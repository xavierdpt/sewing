// Arrange, stitch, then drop: assembling a garment the way it is actually made.
//
// Three phases, in this order, and the order is the point:
//
//   1. ARRANGE   every pattern piece is placed in 3D as a rigid flat panel,
//                standing around the body where it belongs. Nothing is joined.
//   2. STITCH    with gravity OFF, the seams are drawn closed: each pair of
//                points that share a seam is pulled together while the body
//                stops the cloth passing through itself or through the figure.
//                The pieces wrap onto the body as they close.
//   3. DROP      the closed seams are welded, gravity is switched on, and the
//                garment falls.
//
// Why bother, when skirt.js can lay a skirt straight onto the cone it belongs
// on? Two reasons, and both are measured rather than asserted.
//
// It needs no closed-form placement, and for most garments none exists. A
// flat piece placed rigidly in 3D is trivially isometric -- it is the pattern,
// moved -- so there is no strain to start with whatever the garment is. The
// alternative requires an embedding that is isometric AND closed, and below a
// full circle of flare no planar one exists at all (docs/12-flare.md section
// 5): laying four quarter-circle panels flat leaves a 270 degree gap and the
// closing seam has to stretch 3430 % across it.
//
// And separating the stitching from the fall is what keeps the strain out. A
// full circle skirt dropped from its flat layout settles at 13.6 % peak strain
// even though it STARTED at 0.2 %, because the hem has 90 cm to travel and a
// nearly inextensible mesh cannot work the transient back out. Close the seams
// quasi-statically first and the garment never has that transient.
//
// This is the architecture commercial drape software uses -- arrange the pieces
// on the avatar, then simulate -- and it is arrived at here for the same
// reason.

import { Assembly } from './assembly.js';
import { Cloth } from './cloth.js';

/**
 * Phase 1. Place every piece in 3D, unjoined: vertically around the body, one
 * at each station, each piece centred on the part of the body it belongs to.
 *
 * Two details earn their keep, and both are measured.
 *
 * The pieces are ROLLED onto a cylinder rather than laid flat on tangent planes
 * to it. Rolling a flat sheet is a bending, not a stretching, so the piece is
 * still exactly the shape it was cut (to the chord-versus-arc error of the
 * mesh, which is edge^2/24R^2 -- under a tenth of a per cent here). Flat planes
 * work while pieces are narrow and fail when they are not: the four panels of a
 * full circle skirt are 106 cm across, and as flat planes they stick straight
 * out through their neighbours.
 *
 * And wide pieces are allowed to OVERLAP each other. A full circle skirt has
 * 424 cm of hem and the body is 78 cm around, so there is no way to arrange it
 * close to the figure without overlap; the alternative is to stand the pieces
 * so far out that every seam has half a metre to travel. Overlap is harmless
 * here because the pieces are not a garment yet -- self-collision is off for
 * the stitching phase and on from the weld onwards, which is a statement about
 * what a pile of cut pieces is, not a numerical dodge.
 *
 * Stations are assigned from each piece's own placement hint, so the
 * arrangement does not depend on the order the pieces appear in the file.
 */
export function layOut(pattern, surface, {
  standoffCm = 6, radiusCm = null,
} = {}) {
  const asm = new Assembly({ u: 1, weldTol: 1e-9 });
  const instances = new Map();        // v3 -> [vertex index, ...]
  const panelOf = [];

  const vs = [];
  for (const p of pattern.panels) for (const q of p.pts) if (q.uv) vs.push(q.uv[1]);
  const vLo = vs.length ? Math.min(...vs) : 0.2;
  const vHi = vs.length ? Math.max(...vs) : 0.9;

  let cx = 0, cz = 0, rMax = 0, n = 0;
  for (let k = 0; k <= 12; k++) {
    const v = vLo + (vHi - vLo) * k / 12;
    for (let i = 0; i < 24; i++) {
      const q = surface.point(i / 24, v);
      cx += q[0]; cz += q[2]; n++;
      rMax = Math.max(rMax, Math.hypot(q[0], q[2]));
    }
  }
  cx /= n; cz /= n;
  const R = radiusCm ?? rMax + standoffCm;

  const hintOf = (panel, pi) => {
    const us = panel.pts.map((q) => (q.uv ? q.uv[0] : null)).filter((x) => x !== null);
    if (!us.length) return pi / pattern.panels.length;
    const a = Math.atan2(us.reduce((t, u) => t + Math.sin(u * 2 * Math.PI), 0),
      us.reduce((t, u) => t + Math.cos(u * 2 * Math.PI), 0)) / (2 * Math.PI);
    return a - Math.floor(a);
  };
  const yOf = (v) => surface.point(0, Math.max(0, Math.min(1, v)))[1];

  pattern.panels.forEach((panel, pi) => {
    const xs = panel.pts.map((q) => q.x);
    const xMid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const pv = panel.pts.map((q) => (q.uv ? q.uv[1] : null)).filter((x) => x !== null);
    const vTop = pv.length ? Math.max(...pv) : vHi;
    const yTop = yOf(vTop);
    const yMaxPanel = Math.max(...panel.pts.map((q) => q.y));
    const aMid = hintOf(panel, pi) * Math.PI * 2;

    const local = [];
    for (const q of panel.pts) {
      // arc length along the cylinder -> angle, centred on this piece's station
      const a = aMid + (q.x - xMid) / R;
      const pos = [
        cx - Math.sin(a) * R,
        yTop + (q.y - yMaxPanel),
        cz + Math.cos(a) * R,
      ];
      asm.verts.push(pos);
      asm.pinned.push(false);
      const idx = asm.verts.length - 1;
      panelOf.push(pi);
      local.push(idx);
      if (q.v3 !== undefined && q.v3 !== null) {
        if (!instances.has(q.v3)) instances.set(q.v3, []);
        instances.get(q.v3).push(idx);
      }
    }
    for (const t of panel.tris) {
      const A = panel.pts[t[0]], B = panel.pts[t[1]], C = panel.pts[t[2]];
      const sides = [
        Math.hypot(B.x - C.x, B.y - C.y),
        Math.hypot(C.x - A.x, C.y - A.y),
        Math.hypot(A.x - B.x, A.y - B.y),
      ];
      asm.addRawTile([local[t[0]], local[t[1]], local[t[2]]], sides, panel.name);
    }
  });

  // The stitches: every pair of vertices that are the same point of the garment
  // but were cut on different pieces. That is what a seam is before it is sewn.
  // They are a SET, solved together every substep, so no stitch and no piece is
  // the reference and the order they were generated in does not matter.
  // Each stitch carries the pattern vertex it came from, so the viewer can
  // colour it by which seam it belongs to. Seeing a seam as one coloured
  // ribbon -- rather than sixty anonymous lines -- is what tells you whether a
  // piece is the right way round: lay one in back to front and its stitches
  // cross each other in an X instead of running parallel.
  // Each stitch also carries WHICH SEAM it belongs to and WHICH TWO PIECES it
  // joins. The pattern already knows -- annotateSeams (patternio.js) grouped
  // the outline into runs and gave each shared run a seam id -- and without
  // those two fields nothing can address a subset of the sewing: no "sew only
  // these pieces", and no per-seam tension report.
  const seamOfV3 = new Map();
  for (const p of pattern.panels) {
    for (const r of p.runs || []) {
      if (r.kind !== 'seam' || !r.v3) continue;
      for (const v of r.v3) seamOfV3.set(v, r.seam);
    }
  }
  const stitches = [];
  for (const [v3, group] of instances) {
    for (let k = 1; k < group.length; k++) {
      const a = group[0], b = group[k];
      const pa = panelOf[a], pb = panelOf[b];
      stitches.push({
        a, b, v3,
        // a stitch on no named seam is a dart: a seam inside a single piece
        seam: seamOfV3.get(v3) || (pa === pb ? `dart@P${pa}` : null),
        pa: Math.min(pa, pb),
        pb: Math.max(pa, pb),
        active: true,
      });
    }
  }
  const v3Of = new Map();
  for (const [v3, group] of instances) v3Of.set(v3, group[0]);

  asm.meta = { sewn: false, arranged: true, panels: pattern.panels.length, panelOf, stitches };
  return { asm, stitches, panelOf, radiusCm: R, centre: [cx, 0, cz], v3Of };
}

/**
 * Phase 3. Weld the closed seams into one mesh and carry the motion across.
 *
 * Welding rather than leaving the stitches as zero-length constraints is not
 * cosmetic: a seam held by a point constraint is a HINGE, because the bending
 * constraint across it never existed -- the two triangles were never
 * neighbours. A welded seam has the same bending stiffness as the cloth either
 * side of it, which is what a sewn seam has (rather more, in fact).
 *
 * Rest lengths come from the pattern, not from the welded geometry, so nothing
 * that was stitched slightly imperfectly gets baked in as the cloth's new idea
 * of its own size.
 *
 * ONLY CLOSED SEAMS ARE WELDED. `closedCm` is a tolerance, not a formality: a
 * stitch still open by more than that is left alone, and the pair of vertices
 * stays two vertices. This is the counterpart of the force limit in cloth.js
 * -- welding a seam the cloth could not close averages its two sides together
 * and destroys the measurement, which is precisely the thing the force limit
 * exists to produce. The caller gets `openStitches` back and can keep basting
 * them, show them, or go and fix the pattern.
 *
 * Pass `closedCm: Infinity` for the old behaviour of welding everything.
 */
export function weldStitched(asm, stitches, {
  velocities = null, closedCm = 0.25,
} = {}) {
  const gapOf = (s) => {
    const a = asm.verts[s.a], b = asm.verts[s.b];
    return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  };
  const closed = [], open = [];
  for (const s of stitches) (gapOf(s) <= closedCm ? closed : open).push(s);

  const parent = asm.verts.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[b] = a; };
  for (const s of closed) union(s.a, s.b);

  const newIndex = new Map();
  const groups = [];
  for (let i = 0; i < asm.verts.length; i++) {
    const r = find(i);
    if (!newIndex.has(r)) { newIndex.set(r, groups.length); groups.push([]); }
    groups[newIndex.get(r)].push(i);
  }
  const map = asm.verts.map((_, i) => newIndex.get(find(i)));

  const out = new Assembly({ u: 1, weldTol: 1e-9 });
  const vel = [];
  for (const g of groups) {
    const p = [0, 0, 0];
    const v = [0, 0, 0];
    for (const i of g) {
      p[0] += asm.verts[i][0] / g.length;
      p[1] += asm.verts[i][1] / g.length;
      p[2] += asm.verts[i][2] / g.length;
      if (velocities) {
        v[0] += velocities[i][0] / g.length;
        v[1] += velocities[i][1] / g.length;
        v[2] += velocities[i][2] / g.length;
      }
    }
    out.verts.push(p);
    out.pinned.push(false);
    vel.push(v);
  }
  for (const t of asm.tiles) {
    const v = t.v.map((i) => map[i]);
    if (new Set(v).size < 3) continue;
    out.addRawTile(v, t.sides, t.label);
  }
  // The seams that would not close, carried over to the welded indices so the
  // caller can keep basting them and keep reporting them.
  const openStitches = open
    .map((s) => ({ ...s, a: map[s.a], b: map[s.b] }))
    .filter((s) => s.a !== s.b);
  out.meta = {
    ...(asm.meta || {}), sewn: true, arranged: false, welded: true,
    openStitches,
    panelOf: (asm.meta && asm.meta.panelOf)
      ? groups.map((g) => asm.meta.panelOf[g[0]]) : null,
  };
  return {
    asm: out, map, velocities: vel, groups,
    closedStitches: closed, openStitches,
    weldedPct: stitches.length ? +(100 * closed.length / stitches.length).toFixed(1) : 100,
  };
}

export const PHASES = ['arranging', 'stitching', 'welding', 'falling', 'settled'];

/**
 * All three phases, driven to completion. Headless; the viewer runs the same
 * steps a frame at a time so they can be watched.
 *
 * @param opts.stitchSeconds  how long the seams are drawn closed for
 * @param opts.fallSeconds    how long to let it hang afterwards
 */
export function assembleGarment(pattern, surface, {
  fabric = 'linen', standoffCm = 6, stitchSeconds = 2.0, fallSeconds = 6.0,
  dt = 1 / 60, floorY = null, cloth: clothOpts = {}, pinTop = 0, pinWaist = true,
  onFrame = null, weldTolCm = 0.25,
} = {}) {
  const log = [];
  const laid = layOut(pattern, surface, { standoffCm });

  // ---- phase 2: stitch, with gravity off.
  //
  // Gravity off is the whole trick. The seams have to travel a long way --
  // the pieces start outside the body -- and doing that while the cloth is
  // also falling is what fills a nearly inextensible mesh with strain it can
  // never work back out.
  const sim = new Cloth(laid.asm, surface, {
    fabric, gravityScale: 0, stitches: laid.stitches, floorY,
    // Cut pieces are allowed to pass through each other while they are still
    // cut pieces. A wide panel cannot be arranged near the body without
    // overlapping its neighbours, and treating that overlap as a collision
    // tangles the garment before a single seam has closed.
    selfCollision: false,
    ...clothOpts,
  });
  const gap0 = sim.maxStitchGap();
  const frames = Math.round(stitchSeconds / dt);
  for (let f = 0; f < frames; f++) {
    // ramp the pull, so the pieces are drawn together rather than snapped
    sim.stitchStrength = Math.min(1, 0.05 + 1.2 * (f / frames));
    sim.step(dt);
    if (onFrame) onFrame('stitching', f / frames, sim);
  }
  // A last pass with the cloth held still, to let the seams converge: the
  // stitch pulls against the stretch constraints, so it stops short while they
  // are still being fought.
  //
  // This used to zero the velocities every frame, which is not settling, it is
  // squeezing -- it drove the gap down by brute force so the weld would have
  // less to average away. The gap is now the MEASUREMENT (a seam that cannot
  // close is the thing a fitting most wants to know, and the weld no longer
  // closes it on the seam's behalf), so the hold is a quiet settle and nothing
  // more: velocities are damped, not erased, and it stops as soon as the gap
  // stops improving.
  let last = sim.maxStitchGap();
  for (let f = 0; f < 60; f++) {
    for (const v of sim.vel) { v[0] *= 0.5; v[1] *= 0.5; v[2] *= 0.5; }
    sim.step(dt);
    const g = sim.maxStitchGap();
    if (f > 5 && last - g < 1e-4) break;
    last = g;
  }
  log.push({
    phase: 'stitching', seconds: +sim.time.toFixed(2),
    seamGapStartCm: +gap0.toFixed(2), seamGapEndCm: +sim.maxStitchGap().toFixed(3),
    peakTensionGf: +Math.max(0, ...sim.stitches.map((x) => x.peakGf)).toFixed(0),
    seamsAtTheLimit: sim.stitches.filter((x) => x.saturated).length,
    maxStretchPct: sim.report().maxStretchPct,
  });

  // ---- phase 3: weld and drop. Only the seams that actually closed.
  const welded = weldStitched(laid.asm, laid.stitches,
    { velocities: sim.vel, closedCm: weldTolCm });
  // carry the pattern's own labels through: which vertices are the hem, which
  // the waist. The pattern knows; the mesh should not have to guess.
  const idsOfKind = (kind) => {
    const out = new Set();
    for (const p of pattern.panels) {
      for (const r of p.runs || []) {
        if (r.kind !== kind) continue;
        for (const i of r.pts) {
          const v3 = p.pts[i].v3;
          if (laid.v3Of.has(v3)) out.add(welded.map[laid.v3Of.get(v3)]);
        }
      }
    }
    return [...out];
  };
  welded.asm.meta.hemIds = idsOfKind('bottom');
  welded.asm.meta.waistIds = idsOfKind('top');
  // Seams that did not close keep their basting threads: they are still held
  // together as well as they can be, and they still report their tension.
  const sim2 = new Cloth(welded.asm, surface, {
    fabric, floorY, stitches: welded.openStitches, ...clothOpts,
  });
  if (welded.openStitches.length) sim2.stitchStrength = 1;
  welded.velocities.forEach((v, i) => { sim2.vel[i] = v; });
  if (pinTop > 0) sim2.pinTop(pinTop);
  // A waistband. Without one a skirt is a loose tube and gravity simply slides
  // it down the body until it wedges on the hips -- which is correct, is what
  // happens, and is why skirts have waistbands. `pinWaist: false` to watch it.
  if (pinWaist && welded.asm.meta.waistIds) {
    for (const i of welded.asm.meta.waistIds) {
      welded.asm.pinned[i] = true;
      sim2.invMass[i] = 0;
    }
  }
  const settle = sim2.settle({
    maxSeconds: fallSeconds, dt,
    onFrame: onFrame ? (f, s) => onFrame('falling', f / (fallSeconds / dt), s) : null,
  });
  log.push({
    phase: 'falling', seconds: settle.seconds, settled: !!settle.settled,
    weldedPct: welded.weldedPct, seamsLeftOpen: welded.openStitches.length,
    maxStretchPct: sim2.report().maxStretchPct,
  });

  return {
    laid, stitchSim: sim, asm: welded.asm, sim: sim2, welded, log, settle,
    seams: sim.stitchReport({ closedCm: weldTolCm }),
  };
}
