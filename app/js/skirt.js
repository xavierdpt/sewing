// Flared and gathered panels: more fabric at the hem than at the waist.
//
// This is the common case the triangulated shell cannot express at all. A
// bodice is fitted, so its pattern is the body's surface flattened. A skirt is
// not fitted below the waist: the pattern deliberately contains MORE cloth than
// the body needs, and the excess has to go somewhere. Where it goes is the
// design.
//
// There are two ways to put the excess in, and they look and behave completely
// differently:
//
//   FLARE      the panel is wider at the hem than at the waist, and the waist
//              seam still matches the body exactly. Nothing is gathered. The
//              extra hem length cannot hang straight down -- a vertical
//              cylinder of hem length would need a waist of the same girth --
//              so the cloth falls into standing waves. Those are flutes, and
//              they are why a circle skirt moves the way it does.
//
//   GATHERS    the panel's waist edge is LONGER than the body's waist and is
//              pulled in to fit. The excess has nowhere to go at the seam
//              itself, so it buckles immediately into folds that start at the
//              waistband. That is a dirndl, a ruffle, a gathered tier.
//
// Both are parameters here (`circleFraction` or `hemCm`, and `gather`), and
// they can be combined. Neither is faked: the pattern really does contain the
// extra cloth, both sides of every seam really are the same length, and the
// folds are produced by cloth.js having nowhere else to put the material.
//
// Flare is named in the trade by how much of a circle the panels make, which
// is what `circleFraction` takes. Since the waist edge is fixed at the measured
// ring, that fraction sets the hem exactly: hem = waist + 2*pi*fraction*length.
// On a 78 cm waist, 55 cm long, a full circle therefore has a 424 cm hem.
//
// A flared panel is an ANNULAR SECTOR, which matters: it is developable, so it
// lies on a cone with no strain at all, and the flat pattern is exact rather
// than approximate. That is the same argument as the gore in docs/09-pattern.md
// section 7, which is why skirts are the easy case geometrically and the hard
// case dynamically.

import { Assembly } from './assembly.js';
import { annotateSeams, PATTERN_FORMAT } from './patternio.js';

/**
 * A skirt of `panels` identical flared panels.
 *
 * @param waistCm  the body's waist: what the finished waist seam must measure
 * @param hemCm    the hem circumference of the pattern -- the flare
 * @param lengthCm waist to hem, measured along the panel
 * @param gather   fullness at the waist. 1 = flat and smooth, 2 = twice as
 *                 much cloth gathered into the same waistband
 * @param edge     target triangle edge, cm
 * @param waistV   where the waist sits on the body, for the placement hints
 */
export function flaredSkirtPattern({
  panels = 4, waistCm = 74, hemCm = null, lengthCm = 55, gather = 1.0,
  circleFraction = null, edge = 2.5, waistV = 0.3, name = 'skirt',
} = {}) {
  if (panels < 1) throw new Error('a skirt needs at least one panel');
  const patternWaist = waistCm * gather;
  // Flare is named in the trade by how much of a circle the pieces make, not
  // in centimetres of hem, so take it either way. The panels together span
  // 2*pi*circleFraction of angle, and since the waist edge is fixed at the
  // measured ring, that angle sets the hem exactly:
  //     hem = waist + 2*pi*circleFraction*length
  // A full circle skirt on a 78 cm waist, 55 cm long, therefore has a 424 cm
  // hem -- which is the number that surprises people cutting their first one,
  // and the reason a full circle rarely fits across the fabric.
  if (circleFraction !== null) {
    hemCm = patternWaist + 2 * Math.PI * circleFraction * lengthCm;
  } else if (hemCm === null) {
    hemCm = patternWaist + 2 * Math.PI * 0.25 * lengthCm;    // a quarter circle
  }
  if (hemCm < patternWaist - 1e-6) {
    throw new Error(`hem ${hemCm} cm is narrower than the pattern waist `
      + `${patternWaist.toFixed(1)} cm; this generator does not peg skirts`);
  }

  const w = patternWaist / panels;        // waist arc of one panel, on the cloth
  const h = hemCm / panels;               // hem arc of one panel
  const L = lengthCm;

  // Annular sector: inner arc w, outer arc h, radial width L.
  //   theta * r0 = w,  theta * (r0 + L) = h   =>   theta = (h - w) / L
  const theta = (h - w) / L;
  const flared = Math.abs(theta) > 1e-9;
  const r0 = flared ? w / theta : 0;

  // Resolution. Columns are counted across the WIDEST edge so the hem is not
  // coarse, and rows along the length.
  const nI = Math.max(2, Math.round(h / edge));
  const nJ = Math.max(2, Math.round(L / edge));
  const nCols = panels * nI;              // global columns, wrapping at the back

  /** 2D position of (i, j) within one panel, waist at y = 0, hem at y = -L. */
  const xy = (i, j) => {
    const t = j / nJ;
    if (!flared) return { x: -w / 2 + w * (i / nI), y: -L * t };
    const phi = -theta / 2 + theta * (i / nI);
    const r = r0 + L * t;
    return { x: r * Math.sin(phi), y: -(r * Math.cos(phi) - r0) };
  };

  const out = {
    format: PATTERN_FORMAT,
    units: 'cm',
    meta: {
      test: 'flared-skirt',
      panels,
      waistCm,
      patternWaistCm: +patternWaist.toFixed(2),
      hemCm: +hemCm.toFixed(2),
      lengthCm,
      gather,
      // The two numbers that say what this pattern DOES. Flare is how much
      // wider the hem is than the waist it hangs from; gather is how much
      // cloth is crammed into the waist seam itself.
      flareRatio: +(hemCm / patternWaist).toFixed(3),
      // what a pattern book would call it
      circleFraction: +((hemCm - patternWaist) / (2 * Math.PI * L)).toFixed(3),
      sectorAngleDeg: +(theta * 180 / Math.PI).toFixed(2),
      innerRadiusCm: flared ? +r0.toFixed(2) : null,
      rows: nJ + 1,
      colsPerPanel: nI,
      waistV,
      edgeCm: edge,
    },
    panels: [],
  };

  for (let p = 0; p < panels; p++) {
    const pts = [];
    const index = (i, j) => j * (nI + 1) + i;
    for (let j = 0; j <= nJ; j++) {
      for (let i = 0; i <= nI; i++) {
        const { x, y } = xy(i, j);
        // The id is GLOBAL and wraps, so the last column of one panel and the
        // first column of the next are the same 3D vertex. That one line is
        // the whole assembly: sew() and sewFlat() weld by this id, and
        // annotateSeams() works out which panel joins which from it, with no
        // matching heuristic anywhere.
        const col = (p * nI + i) % nCols;
        pts.push({
          x: +x.toFixed(5),
          y: +y.toFixed(5),
          v3: j * nCols + col,
          uv: [+(col / nCols).toFixed(5), +(waistV * (1 - j / nJ)).toFixed(5)],
        });
      }
    }
    const tris = [];
    for (let j = 0; j < nJ; j++) {
      for (let i = 0; i < nI; i++) {
        const A = index(i, j), B = index(i + 1, j), C = index(i + 1, j + 1), D = index(i, j + 1);
        if ((i + j) % 2 === 0) tris.push([A, B, C], [A, C, D]);
        else tris.push([A, B, D], [B, C, D]);
      }
    }
    // outline: waist left to right, right seam down, hem right to left, left seam up
    const loop = [];
    for (let i = 0; i <= nI; i++) loop.push(index(i, 0));
    for (let j = 1; j <= nJ; j++) loop.push(index(nI, j));
    for (let i = nI - 1; i >= 0; i--) loop.push(index(i, nJ));
    for (let j = nJ - 1; j >= 1; j--) loop.push(index(0, j));

    out.panels.push({
      name: `${name.toUpperCase()}-${String(p + 1).padStart(2, '0')}`,
      pts,
      tris,
      loop,
      areaCm2: +(0.5 * (w + h) * L).toFixed(2),
      darts: [],
    });
  }
  return annotateSeams(out);
}

/**
 * The body's waist ring: its LENGTH, and points along it to pin to.
 *
 * The length is the part that matters, and it is the part that is easy to get
 * wrong. A 72 cm waist is a 78 cm ring at 1 cm of ease -- offsetting a closed
 * curve outward by d adds 2*pi*d to it -- so a skirt drafted to the tape
 * measurement and pinned to the ring starts 8 % stretched, and every fold
 * measured afterwards is measuring that mistake. It did, in the first version
 * of this file. Measure the seam, then draft to what was measured.
 *
 * Whether the ring is a circle, an ellipse or a rounded rectangle makes no
 * difference: the cloth is inextensible and intrinsically flat, so it absorbs
 * the shape by bending, and only the length constrains it. Points are returned
 * spaced by equal arc length, which is how a sewer distributes gathers -- evenly
 * along the seam, not evenly in angle about an axis the body does not have.
 */
export function waistRing(surface, { waistV = 0.3, ease = 1.0, nCols = 64, samples = 720 } = {}) {
  const at = (u) => {
    const q = surface.point(u, waistV);
    const n = surface.normal(u, waistV);
    return [q[0] + n[0] * ease, q[1] + n[1] * ease, q[2] + n[2] * ease];
  };
  const dense = [], cum = [0];
  for (let k = 0; k < samples; k++) dense.push(at(k / samples));
  for (let k = 1; k <= samples; k++) {
    const a = dense[k - 1], b = dense[k % samples];
    cum.push(cum[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = cum[samples];
  const pts = [];
  for (let c = 0; c < nCols; c++) {
    const target = (c / nCols) * total;
    let k = 1;
    while (k < samples && cum[k] < target) k++;
    const t = (target - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1);
    const a = dense[k - 1], b = dense[k % samples];
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  const centre = pts.reduce((a, p) => [a[0] + p[0] / nCols, a[1] + p[1] / nCols, a[2] + p[2] / nCols],
    [0, 0, 0]);
  const rMean = pts.reduce((a, p) => a + Math.hypot(p[0] - centre[0], p[2] - centre[2]), 0) / nCols;
  return { pts, circumferenceCm: total, centre, rMean };
}

/**
 * Offer the sewn skirt up to the body: waist seam on the waist, the rest
 * hanging as the cone the pattern actually is.
 *
 * The cone is the pattern's own shape, so the cloth starts unstrained and
 * everything that happens afterwards is gravity. Starting from a cylinder
 * instead would begin the simulation with the hem already compressed, and the
 * folds you then saw would be the initial condition rather than the drape.
 *
 * Returns the Assembly plus the waist vertices, which the caller pins: a
 * waistband is not a physical simplification, it is what a waistband is.
 */
export function placeSkirt(pattern, surface, { ease = 1.0, waistV = null, start = 'cone' } = {}) {
  const meta = pattern.meta;
  const vW = waistV ?? meta.waistV ?? 0.3;
  const nCols = meta.panels * meta.colsPerPanel;
  const nJ = meta.rows - 1;

  const ringInfo = waistRing(surface, { waistV: vW, ease, nCols });
  const ring = ringInfo.pts;
  const [cx, cy, cz] = ringInfo.centre;
  const rWaist = ringInfo.rMean;

  // Where does each row go?
  //
  // On the cone the pattern IS, and nowhere else.
  //
  // Sewing joins edges; it does not stretch anything. Both sides of every seam
  // are the same length, so the assembled skirt's metric is exactly what was
  // cut, and since every panel is flat the whole garment is INTRINSICALLY FLAT.
  // A flat surface has many isometric embeddings -- it can be rolled, folded,
  // rippled -- so holding the waist seam to a waist that is not round needs no
  // stretching at all. It needs BENDING, which is to say folds. That is the
  // whole mechanism of this file, and the simulation confirms it: a full circle
  // skirt settles at under 3 % peak strain, which is the strain limiter's own
  // noise and not a deformation.
  //
  // What is hard is not the existence of such an embedding but writing one
  // down. An annular sector laid on the matching cone is an exact isometry and
  // trivial to compute -- but its waist is a circle. There is no closed form
  // for the folded isometry whose waist follows a particular body's ring, so
  // the placement does not try: it lays the cone down unstrained, hands the
  // waistband to the solver as a ramp, and lets the solver walk to a folded
  // isometric state. Finding it is exactly what the solver is for.
  //
  // Two cleverer-looking placements were tried and both are worse, because
  // both guess at the embedding instead of leaving it alone:
  //
  //   blend the measured waist ring towards a circle at the hem -- 6 % mean,
  //   19 % peak strain. The ring's points are spaced by equal ARC and the
  //   circle's by equal ANGLE, and a real waist is not round, so the blend
  //   twists the mesh by a different amount at every column. A twist is a
  //   shear.
  //
  //   push the ring outward along its own normals, using the identity that
  //   offsetting a closed curve by d lengthens it by exactly 2*pi*d -- 6 %
  //   mean, 40 % peak. The identity is true of the TOTAL and false of every
  //   part: local arc length grows as (1 + curvature * d), so the sharply
  //   curved sides of a waist grow several times as much as the flat front.
  //
  // Starting strained is not a cosmetic problem: a nearly inextensible mesh
  // cannot work its way out of it (docs/09-pattern.md section 10.5 records the
  // same mistake costing 15 % on the bodice), so the folds you then measured
  // would be measuring the initial condition.
  const patternCircAt = (t) => meta.patternWaistCm + (meta.hemCm - meta.patternWaistCm) * t;
  const rCone = meta.patternWaistCm / (2 * Math.PI);
  const rowAt = (j) => {
    const t = j / nJ;
    const d = (patternCircAt(t) - meta.patternWaistCm) / (2 * Math.PI);
    const slant = meta.lengthCm * t;
    return { r: rCone + d, drop: Math.sqrt(Math.max(0, slant * slant - d * d)) };
  };
  const dr = rowAt(nJ).r - rCone;
  const drop = rowAt(nJ).drop;

  // `start: 'flat'` lays the garment out in the plane, in the shape the pattern
  // literally is -- no construction, no trigonometry, the 2D coordinates as
  // cut. It is exactly isometric and needs nothing derived.
  //
  // It only CLOSES, though, when the panels add up to a full circle. The
  // assembled waist edge has to come back to where it started, and a set of
  // sectors spanning less than 360 degrees cannot do that in a plane: the last
  // seam would have to stretch across the gap. Anything less than a full circle
  // therefore has to leave the plane to close, and the cone is the simplest
  // place to put it. For a full circle the two starts coincide -- and the flat
  // start is then literally the hollow disc of docs/11-cloth.md with its hole
  // pinned.
  const thetaTotal = (meta.hemCm - meta.patternWaistCm) / meta.lengthCm;
  const rFlat = thetaTotal > 1e-9 ? meta.patternWaistCm / thetaTotal : 0;
  const flatAt = (j, col) => {
    const t = j / nJ;
    const a = thetaTotal * (col / nCols);
    const r = rFlat + meta.lengthCm * t;
    return [cx + Math.sin(a) * r, cy, cz + Math.cos(a) * r];
  };

  const asm = new Assembly({ u: 1, weldTol: 1e-9 });
  const vertOf = new Map();
  const waistIds = [];
  const hemIds = [];
  const waistCol = new Map();          // waist vertex -> its column on the ring

  for (const panel of pattern.panels) {
    const local = [];
    for (const q of panel.pts) {
      if (vertOf.has(q.v3)) { local.push(vertOf.get(q.v3)); continue; }
      const j = Math.floor(q.v3 / nCols);
      const col = q.v3 % nCols;
      let pos;
      if (start === 'flat') {
        pos = flatAt(j, col);
      } else {
        const { r, drop: dy } = rowAt(j);
        const a = (col / nCols) * Math.PI * 2;
        pos = [cx - Math.sin(a) * r, cy - dy, cz + Math.cos(a) * r];
      }
      asm.verts.push(pos);
      asm.pinned.push(false);
      const idx = asm.verts.length - 1;
      vertOf.set(q.v3, idx);
      local.push(idx);
      if (j === 0) { waistIds.push(idx); waistCol.set(idx, col); }
      if (j === nJ) hemIds.push(idx);
    }
    for (const t of panel.tris) {
      const A = panel.pts[t[0]], B = panel.pts[t[1]], C = panel.pts[t[2]];
      const sides = [
        Math.hypot(B.x - C.x, B.y - C.y),
        Math.hypot(C.x - A.x, C.y - A.y),
        Math.hypot(A.x - B.x, A.y - B.y),
      ];
      const v = [local[t[0]], local[t[1]], local[t[2]]];
      if (new Set(v).size < 3) continue;
      asm.addRawTile(v, sides, panel.name);
    }
  }

  // The waistband. Its seam is held to the BODY's measured ring, which is a
  // different shape from the cloth's own circular waist edge and, if the
  // pattern is gathered, shorter than it by exactly the fullness ratio. The
  // excess then has nowhere to go but out of the plane, which is what
  // gathering is: nothing here creates a fold, the folds are what the solver
  // finds when it cannot satisfy the seam lengths in the ring it is given.
  //
  // The pins are ramped from where the cone put them to where the body is,
  // rather than teleported, because teleporting a pinned vertex is an
  // arbitrarily large velocity. A third of a second is about how long it takes
  // to pin a waistband anyway.
  const ramp = { ids: [], from: [], to: [], seconds: 0.3 };
  for (const i of waistIds) {
    asm.pinned[i] = true;
    const col = waistCol.get(i);
    ramp.ids.push(i);
    ramp.from.push([...asm.verts[i]]);
    ramp.to.push([...ring[col]]);
  }

  asm.meta = {
    sewn: true, panels: pattern.panels.length, skirt: true, pinRamp: ramp,
    waistIds, hemIds, nCols, nJ,
    waistRingCm: +ringInfo.circumferenceCm.toFixed(2),
    coneDropCm: +drop.toFixed(2),
  };
  return { asm, waistIds, hemIds, rWaist, drop, centre: [cx, cy, cz], pinRamp: ramp,
    waistRingCm: ringInfo.circumferenceCm };
}

/**
 * The boundary loops of a mesh, in cyclic order.
 *
 * A hem is a boundary of the garment, and its order is a property of the MESH,
 * not of the list someone happened to build. Taking the hem vertices in the
 * order a pattern's panels were visited gives a zigzag that walks back and
 * forth between pieces: measured on a half circle skirt, a 251 cm hem came out
 * at 385 cm. Walking the boundary gets it right by construction, needs no
 * knowledge of the pattern, and works for any garment.
 */
export function boundaryLoops(asm) {
  const nbr = new Map();
  for (const e of asm.edges.values()) {
    if (e.tiles.length !== 1) continue;
    if (!nbr.has(e.a)) nbr.set(e.a, []);
    if (!nbr.has(e.b)) nbr.set(e.b, []);
    nbr.get(e.a).push(e.b);
    nbr.get(e.b).push(e.a);
  }
  const seen = new Set();
  const loops = [];
  for (const start of nbr.keys()) {
    if (seen.has(start)) continue;
    const loop = [start];
    seen.add(start);
    let cur = start, prev = -1;
    for (;;) {
      const next = (nbr.get(cur) || []).find((x) => x !== prev && !seen.has(x));
      if (next === undefined) break;
      loop.push(next);
      seen.add(next);
      prev = cur;
      cur = next;
    }
    if (loop.length > 3) loops.push(loop);
  }
  return loops;
}

/**
 * Read the folds off a settled skirt.
 *
 * A hem that has fallen into flutes is a wave in the radius around the body,
 * so the fold count is the number of local maxima and the fold depth is how
 * far the radius swings. Both are what you would describe by eye -- "it hangs
 * in six soft folds" -- turned into numbers you can assert on.
 */
export function hemProfile(asm, { smooth = 2, ids = null } = {}) {
  // The hem is the lowest boundary loop, taken in the mesh's own cyclic order.
  if (!ids) {
    const loops = boundaryLoops(asm);
    if (!loops.length) throw new Error('this mesh has no boundary: nothing to call a hem');
    const meanY = (l) => l.reduce((a, i) => a + asm.verts[i][1], 0) / l.length;
    ids = loops.reduce((best, l) => (meanY(l) < meanY(best) ? l : best), loops[0]);
  }
  const n = ids.length;
  const cx = ids.reduce((a, i) => a + asm.verts[i][0], 0) / n;
  const cz = ids.reduce((a, i) => a + asm.verts[i][2], 0) / n;
  const raw = ids.map((i) => Math.hypot(asm.verts[i][0] - cx, asm.verts[i][2] - cz));
  // the hem is sampled finely; smooth over a couple of samples so that mesh
  // noise is not counted as a fold
  const r = raw.map((_, k) => {
    let s = 0;
    for (let d = -smooth; d <= smooth; d++) s += raw[(k + d + n) % n];
    return s / (2 * smooth + 1);
  });
  const mean = r.reduce((a, b) => a + b, 0) / n;
  let folds = 0;
  for (let k = 0; k < n; k++) {
    const prev = r[(k - 1 + n) % n], next = r[(k + 1) % n];
    if (r[k] > prev && r[k] >= next && r[k] > mean) folds++;
  }
  // length of the hem as it hangs, against the length it was cut
  let hung = 0;
  for (let k = 0; k < n; k++) {
    const a = asm.verts[ids[k]], b = asm.verts[ids[(k + 1) % n]];
    hung += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  const ys = ids.map((i) => asm.verts[i][1]);
  return {
    folds,
    meanRadiusCm: +mean.toFixed(2),
    foldDepthCm: +(Math.max(...r) - Math.min(...r)).toFixed(2),
    hemLengthCm: +hung.toFixed(2),
    hemLowYcm: +Math.min(...ys).toFixed(2),
    hemHighYcm: +Math.max(...ys).toFixed(2),
    hemUnevennessCm: +(Math.max(...ys) - Math.min(...ys)).toFixed(2),
  };
}

/** What the pattern says, as a table: the assembly, piece by piece. */
export function assemblyReport(pattern) {
  const rows = [];
  for (const p of pattern.panels) {
    for (const r of p.runs || []) {
      rows.push({
        panel: p.name,
        edge: r.kind === 'seam' ? `${r.seam} -> ${r.partnerName}` : r.kind,
        points: r.pts.length,
        lengthCm: r.lengthCm,
      });
    }
  }
  return rows;
}
