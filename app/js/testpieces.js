// Test pieces: flat pattern shapes whose drape is known in advance, so the
// physics can be checked against something other than an opinion.
//
// The first and most useful is the HOLLOW DISC -- an annulus, which is what a
// circular yoke, a cape, a cowl and a full circle skirt all are. Dropped
// horizontally over a neck it has exactly two outcomes, and which one you get
// depends on one number:
//
//   inner radius slightly larger than the neck
//       the hole cannot pass the shoulders, so the cloth hangs from them. The
//       inner edge sits on the neck/shoulder shelf and the outer edge falls in
//       folds. This is a yoke, and it is why a circular yoke works at all.
//
//   inner radius much larger than the neck
//       the hole clears the shoulders. Nothing supports the cloth but friction
//       against a surface that is sloping away beneath it, so the disc slides
//       down the bodice until the hole is narrower than the body -- at the bust
//       or at the hips -- or until it falls off entirely.
//
// Nothing in the generator knows about either outcome. The transition between
// them is produced by gravity, contact and friction in cloth.js, which is the
// point of the test: if the simulation is right, the yoke/slip boundary comes
// out near the shoulder width without being told where it is.
//
// The pieces are emitted in the ordinary pattern format of patternio.js
// (`panels[].pts/tris/loop`, with `v3` ids shared across panels where they are
// sewn). So a test piece can be exported to SVG and cut out, and -- more to the
// point -- the SAME path handles a real multi-panel pattern: `sewFlat()` welds
// the panels into one Assembly by their `v3` ids and the simulation sees a
// single mesh with the seams as interior edges. There is no 2D special case in
// the solver.

import { PATTERN_FORMAT } from './patternio.js';

/**
 * A triangulated annulus.
 *
 * Resolution is driven by a target edge length rather than by ring and sector
 * counts, because a disc's circumference grows with radius: a constant sector
 * count that is right at the outer edge is four times too coarse at the inner
 * edge, and right at the inner edge it is four times too fine at the outer.
 * So the sector count DOUBLES outward whenever the circumferential edge gets
 * too long, joined by a 2:1 transition row of three triangles per inner
 * segment. The triangles stay near-equilateral everywhere, which is what
 * "triangulated enough" has to mean for a physics mesh -- long thin triangles
 * make the stretch constraints ill-conditioned and the drape direction-biased.
 *
 * @param innerR   cm, the hole
 * @param outerR   cm, the hem
 * @param edge     cm, target triangle edge
 * @returns pattern in the patternio format, one panel, plus `meta.test`
 */
export function annulusPattern({ innerR = 7.5, outerR = 28, edge = 2.2 } = {}) {
  if (!(outerR > innerR)) throw new Error('outer radius must exceed the inner radius');
  const pts = [];
  const tris = [];
  const addPt = (r, a) => {
    pts.push({ x: +(r * Math.cos(a)).toFixed(5), y: +(r * Math.sin(a)).toFixed(5), v3: pts.length });
    return pts.length - 1;
  };

  // ---- ring radii. Step outward by the target edge, but make the last step
  // land exactly on outerR so the hem is the radius that was asked for.
  const nR = Math.max(2, Math.round((outerR - innerR) / edge));
  const radii = Array.from({ length: nR + 1 }, (_, j) => innerR + (outerR - innerR) * j / nR);

  // ---- sector counts, doubling outward. Start from whatever keeps the inner
  // ring's circumferential edge near the target, and never below 12 or the
  // hole is a polygon rather than a circle.
  const counts = [];
  let n = Math.max(12, Math.round(2 * Math.PI * innerR / edge));
  if (n % 2) n += 1;                                  // even, so it can halve back
  for (let j = 0; j <= nR; j++) {
    if (j > 0 && 2 * Math.PI * radii[j] / n > 1.55 * edge) n *= 2;
    counts.push(n);
  }

  // ---- vertices, ring by ring
  const rings = counts.map((cnt, j) =>
    Array.from({ length: cnt }, (_, i) => addPt(radii[j], 2 * Math.PI * i / cnt)));

  // ---- faces
  for (let j = 0; j < nR; j++) {
    const A = rings[j], B = rings[j + 1];
    const na = A.length, nb = B.length;
    if (nb === na) {
      // plain quad strip, diagonals alternating so the mesh has no global bias
      for (let i = 0; i < na; i++) {
        const i2 = (i + 1) % na;
        if ((i + j) % 2 === 0) {
          tris.push([A[i], B[i], B[i2]], [A[i], B[i2], A[i2]]);
        } else {
          tris.push([A[i], B[i], A[i2]], [A[i2], B[i], B[i2]]);
        }
      }
    } else {
      // 2:1 transition: each inner segment spans two outer ones, as three
      // triangles. No vertex is left T-shaped, which would otherwise be a
      // crack the cloth tears along.
      for (let i = 0; i < na; i++) {
        const i2 = (i + 1) % na;
        const o0 = B[(2 * i) % nb], o1 = B[(2 * i + 1) % nb], o2 = B[(2 * i + 2) % nb];
        tris.push([A[i], o0, o1], [A[i], o1, A[i2]], [A[i2], o1, o2]);
      }
    }
  }

  // ---- the two boundaries. `loop` is the cutting outline (the hem); `hole`
  // is the inner edge, which a pattern would mark as the neckline.
  const loop = rings[nR].slice();
  const hole = rings[0].slice();
  const circ = (ring) => {
    let L = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = pts[ring[i]], b = pts[ring[(i + 1) % ring.length]];
      L += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return L;
  };

  return {
    format: PATTERN_FORMAT,
    units: 'cm',
    meta: {
      test: 'annulus',
      innerRadiusCm: innerR,
      outerRadiusCm: outerR,
      edgeCm: edge,
      holeCircumferenceCm: +circ(hole).toFixed(2),
      hemCircumferenceCm: +circ(loop).toFixed(2),
      rings: nR + 1,
      sectorsInner: counts[0],
      sectorsOuter: counts[nR],
    },
    panels: [{
      name: 'DISC',
      pts,
      tris,
      loop,
      hole,
      areaCm2: +(Math.PI * (outerR * outerR - innerR * innerR)).toFixed(2),
      darts: [],
      runs: [
        { kind: 'hem', pts: loop, lengthCm: +circ(loop).toFixed(2) },
        { kind: 'neckline', pts: hole, lengthCm: +circ(hole).toFixed(2) },
      ],
    }],
    seams: [],
  };
}

/**
 * A plain rectangle, triangulated. Useful as the control: a square of cloth
 * draped over a shoulder has no hole to catch on anything, so it must always
 * slide off. If it does not, the friction model is wrong.
 */
export function rectanglePattern({ width = 40, height = 40, edge = 2.2 } = {}) {
  const nx = Math.max(1, Math.round(width / edge));
  const ny = Math.max(1, Math.round(height / edge));
  const pts = [];
  const id = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      pts.push({
        x: +(-width / 2 + width * i / nx).toFixed(5),
        y: +(-height / 2 + height * j / ny).toFixed(5),
        v3: id(i, j),
      });
    }
  }
  const tris = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if ((i + j) % 2 === 0) {
        tris.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
      } else {
        tris.push([id(i, j), id(i + 1, j), id(i, j + 1)], [id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]);
      }
    }
  }
  const loop = [];
  for (let i = 0; i <= nx; i++) loop.push(id(i, 0));
  for (let j = 1; j <= ny; j++) loop.push(id(nx, j));
  for (let i = nx - 1; i >= 0; i--) loop.push(id(i, ny));
  for (let j = ny - 1; j >= 1; j--) loop.push(id(0, j));

  return {
    format: PATTERN_FORMAT,
    units: 'cm',
    meta: { test: 'rectangle', widthCm: width, heightCm: height, edgeCm: edge },
    panels: [{ name: 'RECT', pts, tris, loop, areaCm2: width * height, darts: [] }],
    seams: [],
  };
}
