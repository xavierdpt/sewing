// The drop test: put a flat piece of cloth in the air above the body and let
// go of it.
//
// This is the experiment that cannot be run with a static solver. relax.js and
// drape() both answer "given that the garment is ON the body, what shape does
// it take"; neither can answer "does it stay on the body at all", because both
// start from a placement and one of them pins the shoulders. Here nothing is
// placed and nothing is pinned: the cloth is released horizontally and whether
// it ends up a yoke, a slipped hoop around the waist, or a heap on the floor
// is decided by gravity, contact and friction.
//
// Run it over a range of inner radii and you get the fitting fact the test is
// for: there is a critical hole size, somewhere near the shoulder girth, below
// which the cloth is supported and above which it is not. Nothing tells the
// simulation where that is.

import { Cloth, FABRICS } from './cloth.js';
import { sewFlat } from './patternio.js';
import { annulusPattern, rectanglePattern } from './testpieces.js';

/**
 * Where is the neck, and how high is the body?
 *
 * The cloth has to be centred on the neck AXIS, not on the world origin: a body
 * with `lateralShift` or `rotation` set has its neck somewhere else, and the
 * whole premise of this project is that such bodies are the normal case.
 */
export function neckFrame(surface, { samples = 64 } = {}) {
  const vTop = 0.999;
  let v = vTop;
  try { v = surface.landmarkV ? surface.landmarkV('neck') : vTop; } catch { v = vTop; }
  let cx = 0, cz = 0, cy = 0, girth = 0, prev = null;
  for (let i = 0; i < samples; i++) {
    const p = surface.point(i / samples, v);
    cx += p[0]; cz += p[2]; cy += p[1];
    if (prev) girth += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    prev = p;
  }
  if (prev) {
    const p0 = surface.point(0, v);
    girth += Math.hypot(p0[0] - prev[0], p0[1] - prev[1], p0[2] - prev[2]);
  }
  // the top of the body, measured rather than assumed: a neck stub continues
  // above the nape, and the cloth must start clear of it
  let yTop = -Infinity;
  for (let i = 0; i < samples; i++) {
    const p = surface.point(i / samples, 1);
    if (p[1] > yTop) yTop = p[1];
  }
  return {
    center: [cx / samples, cz / samples],
    y: cy / samples,
    girthCm: girth,
    radiusCm: girth / (2 * Math.PI),
    yTop,
  };
}

/** Named heights on the body, for saying WHERE the cloth came to rest. */
function landmarkHeights(surface) {
  const out = {};
  const names = ['neck', 'shoulder', 'chest', 'bust', 'underBust', 'waist', 'highHip', 'lowHip'];
  const H = surface.ringHeights || surface.heights;
  if (!H) return out;
  for (const n of names) if (H[n] !== undefined) out[n] = H[n];
  return out;
}

/**
 * Drop a hollow disc on a body.
 *
 * @param surface  Torso or MeshSurface
 * @param opts.innerR  cm; the number the whole test turns on
 * @param opts.outerR  cm
 * @param opts.edge    cm, target triangle edge
 * @param opts.dropCm  how far above the top of the body to release it
 * @param opts.seconds simulated seconds to run (settles early if it can)
 */
export function dropDisc(surface, {
  innerR = 7.5, outerR = 28, edge = 2.2, dropCm = 4, seconds = 6,
  fabric = 'cotton poplin', cloth: clothOpts = {}, onFrame = null, dt = 1 / 60,
} = {}) {
  const neck = neckFrame(surface);
  const pattern = annulusPattern({ innerR, outerR, edge });
  const asm = sewFlat(pattern, { y: neck.yTop + dropCm, center: neck.center });
  const holeIds = pattern.panels[0].hole.slice();
  const hemIds = pattern.panels[0].loop.slice();

  const sim = new Cloth(asm, surface, { floorY: floorOf(surface), fabric, ...clothOpts });
  const settle = sim.settle({ maxSeconds: seconds, dt, onFrame });

  return {
    pattern, asm, cloth: sim, settle,
    ...result(sim, surface, { neck, holeIds, hemIds, pattern }),
  };
}

/**
 * Where the body is standing. A garment that slips off has to land somewhere,
 * and the same floor the viewer draws is the obvious place.
 */
export function floorOf(surface) {
  const legFloor = (surface.heights && surface.heights.knee !== undefined)
    ? surface.heights.knee : Infinity;
  const base = Math.min(surface.yMin !== undefined ? surface.yMin : -24, legFloor);
  return base - 2;
}

/** Same, for the control piece: a plain square with no hole. */
export function dropRectangle(surface, {
  width = 40, height = 40, edge = 2.2, dropCm = 6, seconds = 5,
  fabric = 'cotton poplin', cloth: clothOpts = {}, onFrame = null, dt = 1 / 60,
} = {}) {
  const neck = neckFrame(surface);
  const pattern = rectanglePattern({ width, height, edge });
  const asm = sewFlat(pattern, { y: neck.yTop + dropCm, center: neck.center });
  const sim = new Cloth(asm, surface, { floorY: floorOf(surface), fabric, ...clothOpts });
  const settle = sim.settle({ maxSeconds: seconds, dt, onFrame });
  return {
    pattern, asm, cloth: sim, settle,
    ...result(sim, surface, { neck, holeIds: [], hemIds: pattern.panels[0].loop, pattern }),
  };
}

/**
 * Read the outcome off the settled mesh.
 *
 * `restingAt` is the body landmark nearest the height the hole came to rest at,
 * which is the sentence a fitter would say: "it's sitting on the shoulders", or
 * "it's slid to the waist".
 */
function result(sim, surface, { neck, holeIds, hemIds, pattern }) {
  const V = sim.asm.verts;
  const H = landmarkHeights(surface);
  const mean = (ids, d) => ids.reduce((a, i) => a + V[i][d], 0) / Math.max(1, ids.length);
  const holeY = holeIds.length ? mean(holeIds, 1) : null;
  const hemY = mean(hemIds, 1);
  const ys = V.map((p) => p[1]);
  const bottomY = Math.min(...ys);

  // how far the hole has fallen below the neck ring it was dropped around
  const slipCm = holeY === null ? null : neck.y - holeY;

  let restingAt = null, restErr = Infinity;
  if (holeY !== null) {
    for (const [name, y] of Object.entries(H)) {
      const e = Math.abs(y - holeY);
      if (e < restErr) { restErr = e; restingAt = name; }
    }
  }

  const rep = sim.report();
  // Did it leave the body altogether? The body stops at the crotch, so a piece
  // whose highest vertex is below the lowest landmark is on the floor.
  const lowest = Math.min(...Object.values(H).concat([Infinity]));
  const fellOff = Number.isFinite(lowest) && Math.max(...ys) < lowest;
  if (fellOff) restingAt = 'the floor';

  let verdict;
  if (!sim.healthy()) verdict = 'SOLVER BLEW UP';
  else if (fellOff) verdict = 'slid straight off -- it is on the floor';
  else if (holeY === null) verdict = rep.contactVerts > 0 ? 'draped over the body' : 'not touching the body';
  else if (restingAt === 'neck' || restingAt === 'shoulder') {
    verdict = `caught on the ${restingAt} -- it is a yoke`;
  } else verdict = `slid down to the ${restingAt}`;

  return {
    verdict,
    restingAt,
    holeYcm: holeY === null ? null : +holeY.toFixed(2),
    hemYcm: +hemY.toFixed(2),
    bottomYcm: +bottomY.toFixed(2),
    slipCm: slipCm === null ? null : +slipCm.toFixed(2),
    neckGirthCm: +neck.girthCm.toFixed(2),
    neckRadiusCm: +neck.radiusCm.toFixed(2),
    holeCircumferenceCm: pattern.meta.holeCircumferenceCm ?? null,
    settled: sim.rmsSpeed() < 0.6,
    ...rep,
  };
}

/**
 * Sweep the inner radius and find the critical hole size: the smallest one that
 * no longer catches. Returns one row per radius plus the boundary.
 */
export function slipSweep(surface, {
  radii = [6, 7, 8, 9, 10, 12, 14, 16, 18, 20], outerR = 30, edge = 2.6,
  seconds = 4, fabric = 'cotton poplin', cloth: clothOpts = {}, log = null,
} = {}) {
  const rows = [];
  for (const r of radii) {
    const out = dropDisc(surface, { innerR: r, outerR, edge, seconds, fabric, cloth: clothOpts });
    const row = {
      innerRcm: r,
      holeCircCm: out.holeCircumferenceCm,
      caught: /yoke/.test(out.verdict),
      restingAt: out.restingAt,
      slipCm: out.slipCm,
      maxStretchPct: out.maxStretchPct,
      contactPct: out.contactPct,
      verdict: out.verdict,
    };
    rows.push(row);
    if (log) log(row);
  }
  const lastCaught = [...rows].reverse().find((r) => r.caught);
  const firstSlip = rows.find((r) => !r.caught && rows.indexOf(r) > rows.findIndex((x) => x.caught));
  return {
    rows,
    criticalInnerRcm: lastCaught && firstSlip
      ? +(((lastCaught.innerRcm + firstSlip.innerRcm) / 2)).toFixed(2) : null,
    caughtUpTocm: lastCaught ? lastCaught.innerRcm : null,
    slipsFromcm: firstSlip ? firstSlip.innerRcm : null,
  };
}

export { FABRICS };
