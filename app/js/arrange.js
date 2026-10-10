// Arranging the pieces: a stored rigid placement per piece, and the operations
// that change it.
//
// The pieces used to be moved by mutating `asm.verts` in place -- each gesture
// was individually a rigid motion, so the arrangement stayed isometric, but
// nothing recorded WHERE a piece had been put. That costs more than it looks:
// no undo, no reset, no numeric readout, no mirroring a placement to the other
// side of the body, and a hundred composed incremental rotations that drift.
//
// Here a piece's position is a handful of named numbers, and its vertices are
// recomputed from the PATTERN every time:
//
//     verts = place(panel, placement, axis)
//
// So the piece in the scene is always exactly the piece that was cut, however
// many buttons have been pressed. That is not a tidiness argument: the whole
// reason the pieces may be moved freely is that a flat piece moved rigidly in
// 3D is trivially isometric, so the garment starts unstrained whatever the
// arrangement (docs/13-assembly.md section 1, measured at 2e-13 %). An
// accumulated mutation only approximates that claim; a recomputed placement
// IS it.
//
// This module is three.js-free, like every other geometry module here, so
// test/run.mjs can assert on it under plain node.

import { RAD, DEG } from './geom.js';

// --------------------------------------------------------------- the model

/**
 * Where a piece is, as numbers rather than as moved vertices.
 *
 *   station  angle around the body's vertical axis, radians. 0 is the front.
 *   y        height of the piece's TOP edge, cm, in body coordinates.
 *   radius   distance from the body's axis, cm.
 *   spin     rotation in the piece's own surface, radians, applied in PATTERN
 *            space before the piece is wrapped -- so a spun piece still lies
 *            on the cylinder instead of cutting through it.
 *   tilt     rotation about the piece's local horizontal, radians: leans the
 *            top of the piece out from the body or in towards it. Rigid, and
 *            applied after wrapping, so it genuinely lifts the piece off.
 *   swing    rotation about the piece's local vertical, radians: turns the
 *            piece like a door on its hinge.
 *   flip     mirror the piece about its own centre line: laid on face down.
 *   wrap     rolled onto the cylinder (true) or flat on the tangent plane.
 *
 * On `spin` versus a rotation about the radial direction: they are the same
 * rotation. A piece facing outwards lies in the plane spanned by its local
 * horizontal and vertical, so turning it about the outward normal is a
 * rotation within its own surface -- which is what `spin` is. The difference
 * is only WHEN it happens: before wrapping it keeps the piece on the cylinder,
 * after wrapping it would peel the piece off for no gain. So there is one
 * in-surface rotation here, not two.
 */
export function placement(o = {}) {
  return {
    station: 0, y: 0, radius: 20,
    spin: 0, tilt: 0, swing: 0,
    flip: false, wrap: true,
    ...o,
  };
}

/**
 * The body's own angular convention, taken from layOut and from the viewer's
 * cylinder pick so that all three agree:
 *
 *     outward(a) = [-sin a, 0, cos a]        radially away from the axis
 *     along(a)   = [-cos a, 0, -sin a]       increasing a, i.e. to the piece's right
 *
 * `along` is the derivative of `outward`, which is what makes arc length on
 * the cylinder equal to pattern-space x: a point x cm to the right of a
 * piece's centre sits at station + x/radius.
 */
export const outward = (a) => [-Math.sin(a), 0, Math.cos(a)];
export const along = (a) => [-Math.cos(a), 0, -Math.sin(a)];

// ------------------------------------------------------- pattern-space frame

/**
 * A panel's own origin: the middle of its width, and the top of its height.
 *
 * Width is centred so that spinning and flipping happen about the piece's
 * middle rather than about whatever corner the drafting happened to put at
 * x = 0. Height is measured from the top because that is the edge that gets
 * hung -- a waist, a shoulder -- and keeping it fixed means lengthening a
 * piece grows it downwards, which is what lengthening a garment does.
 */
export function panelFrame(panel) {
  const xs = panel.pts.map((q) => q.x);
  return {
    xMid: (Math.min(...xs) + Math.max(...xs)) / 2,
    yTop: Math.max(...panel.pts.map((q) => q.y)),
  };
}

/** Where a panel's top edge belongs on the body, as a height in cm. */
export function panelTopY(panel, surface, vHi = 0.9) {
  const pv = panel.pts.map((q) => (q.uv ? q.uv[1] : null)).filter((x) => x !== null);
  const v = pv.length ? Math.max(...pv) : vHi;
  return surface.point(0, Math.max(0, Math.min(1, v)))[1];
}

/**
 * The station a panel's own placement hint asks for: the circular mean of its
 * points' u coordinates.
 *
 * Circular, not arithmetic, because a panel that straddles u = 0 -- the centre
 * front of a bodice -- has u values near 0 and near 1, whose arithmetic mean
 * is 0.5, the centre BACK. Taken from layOut, where it was already right.
 */
export function panelStation(panel, pi, nPanels) {
  const us = panel.pts.map((q) => (q.uv ? q.uv[0] : null)).filter((x) => x !== null);
  if (!us.length) return (pi / nPanels) * Math.PI * 2;
  const a = Math.atan2(
    us.reduce((t, u) => t + Math.sin(u * 2 * Math.PI), 0),
    us.reduce((t, u) => t + Math.cos(u * 2 * Math.PI), 0),
  ) / (2 * Math.PI);
  return (a - Math.floor(a)) * Math.PI * 2;
}

// ------------------------------------------------------------ the placement

/**
 * A panel's vertices in 3D, from its pattern coordinates and its placement.
 *
 * The order of operations is the whole content of this function:
 *
 *   1. to the panel's own frame     (centre of width, top of height)
 *   2. flip, then spin              IN PATTERN SPACE, still flat
 *   3. wrap onto the cylinder       a bending, not a stretching
 *   4. tilt and swing               rigid, about the piece's centroid
 *
 * Steps 2 and 3 are in that order on purpose. Spinning after wrapping would
 * take the piece off the cylinder, and the cylinder is what keeps a wide piece
 * from standing out through its neighbours -- the four panels of a full circle
 * skirt are 106 cm across, and flat they stick straight out (assemble.js).
 * Steps 3 and 4 are in that order for the opposite reason: tilt is WANTED to
 * lift the piece off, which is how a bodice front is leaned out over a bust.
 *
 * @param axis  [x, y, z] of the body's vertical axis; y is ignored.
 * @param out   optional array of 3-arrays to write into, to avoid allocating
 *              on every frame.
 */
export function placePanel(panel, pl, axis, out = null) {
  const { xMid, yTop } = panelFrame(panel);
  const R = Math.max(1e-6, pl.radius);
  const cs = Math.cos(pl.spin), ss = Math.sin(pl.spin);
  const res = out || panel.pts.map(() => [0, 0, 0]);

  // --- 1-3: pattern space -> flip -> spin -> wrap
  for (let i = 0; i < panel.pts.length; i++) {
    const q = panel.pts[i];
    let px = q.x - xMid;
    const qy = q.y - yTop;
    if (pl.flip) px = -px;
    // in-surface rotation, while the piece is still flat
    const sx = px * cs - qy * ss;
    const sy = px * ss + qy * cs;
    const p = res[i];
    if (pl.wrap) {
      const a = pl.station + sx / R;
      p[0] = axis[0] - Math.sin(a) * R;
      p[1] = pl.y + sy;
      p[2] = axis[2] + Math.cos(a) * R;
    } else {
      const o = outward(pl.station), t = along(pl.station);
      p[0] = axis[0] + o[0] * R + t[0] * sx;
      p[1] = pl.y + sy;
      p[2] = axis[2] + o[2] * R + t[2] * sx;
    }
  }

  // --- 4: tilt and swing, rigid, about the piece's own centroid
  if (pl.tilt || pl.swing) {
    let cx = 0, cy = 0, cz = 0;
    for (const p of res) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= res.length; cy /= res.length; cz /= res.length;
    // the piece's local frame at its station: horizontal along the body, and up
    const t = along(pl.station);
    const up = [0, 1, 0];
    if (pl.tilt) rotateAbout(res, [cx, cy, cz], t, pl.tilt);
    if (pl.swing) rotateAbout(res, [cx, cy, cz], up, pl.swing);
  }
  return res;
}

/** Rodrigues rotation of a list of points about an axis through a pivot. */
export function rotateAbout(pts, pivot, axis, angle) {
  const L = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const kx = axis[0] / L, ky = axis[1] / L, kz = axis[2] / L;
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  // the rotation matrix, built once rather than per point
  const m = [
    t * kx * kx + c, t * kx * ky - s * kz, t * kx * kz + s * ky,
    t * kx * ky + s * kz, t * ky * ky + c, t * ky * kz - s * kx,
    t * kx * kz - s * ky, t * ky * kz + s * kx, t * kz * kz + c,
  ];
  for (const p of pts) {
    const x = p[0] - pivot[0], y = p[1] - pivot[1], z = p[2] - pivot[2];
    p[0] = pivot[0] + m[0] * x + m[1] * y + m[2] * z;
    p[1] = pivot[1] + m[3] * x + m[4] * y + m[5] * z;
    p[2] = pivot[2] + m[6] * x + m[7] * y + m[8] * z;
  }
  return pts;
}

/**
 * The placement every piece starts at: its own hint, at the standoff radius.
 * This is what layOut used to compute inline, and layOut now calls it, so the
 * hand arrangement and the automatic one cannot drift apart.
 */
export function defaultPlacements(pattern, surface, { standoffCm = 6, radiusCm = null } = {}) {
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

  const placements = pattern.panels.map((panel, pi) => placement({
    station: panelStation(panel, pi, pattern.panels.length),
    y: panelTopY(panel, surface, vHi),
    radius: R,
  }));
  return { placements, axis: [cx, 0, cz], radiusCm: R };
}

// -------------------------------------------------------- the button actions

/**
 * The transforms the buttons expose, declared rather than written out twice.
 *
 * `step` is in the field's own units -- cm for the lengths, degrees for the
 * angles, which is what the buttons are labelled in. `deg: true` means the
 * stored field is radians and the step has to be converted.
 *
 * On what a transform means for SEVERAL pieces at once: `station`, `y` and
 * `radius` move every selected piece by the same amount, which for `station`
 * is a rotation of the whole selection about the body's axis and so preserves
 * the arrangement exactly. The rotations act on each piece about ITS OWN
 * centre. A group-rigid tilt -- the selection turned as one body about a
 * shared centroid -- is deliberately not offered: it cannot be written back
 * into per-piece placements exactly, and storing it as a separate accumulated
 * rotation would reintroduce the drift this module exists to remove.
 */
export const TRANSFORMS = [
  { field: 'station', label: 'around the body', step: 5, deg: true, unit: 'deg' },
  { field: 'y', label: 'up / down', step: 1, unit: 'cm' },
  { field: 'radius', label: 'out / in', step: 1, unit: 'cm' },
  { field: 'spin', label: 'spin (in its own surface)', step: 5, deg: true, unit: 'deg' },
  { field: 'tilt', label: 'tilt (lean the top out)', step: 5, deg: true, unit: 'deg' },
  { field: 'swing', label: 'swing (like a door)', step: 5, deg: true, unit: 'deg' },
];

const BY_FIELD = Object.fromEntries(TRANSFORMS.map((t) => [t.field, t]));

/**
 * Move the selected pieces. `amount` is in the transform's own unit, so
 * `nudge(pl, sel, 'station', 5)` is five degrees and `nudge(pl, sel, 'y', -1)`
 * is a centimetre down.
 */
export function nudge(placements, selection, field, amount) {
  const t = BY_FIELD[field];
  if (!t) throw new Error(`no such transform: ${field}`);
  const d = t.deg ? amount * RAD : amount;
  for (const i of selection) {
    if (!placements[i]) continue;
    placements[i][field] += d;
    if (field === 'radius') placements[i].radius = Math.max(1, placements[i].radius);
  }
  return placements;
}

/** Set a field outright rather than by an increment. */
export function setField(placements, selection, field, value) {
  const t = BY_FIELD[field];
  const v = t && t.deg ? value * RAD : value;
  for (const i of selection) if (placements[i]) placements[i][field] = v;
  return placements;
}

/** Turn a piece over: laid on face down. */
export function flip(placements, selection) {
  for (const i of selection) if (placements[i]) placements[i].flip = !placements[i].flip;
  return placements;
}

/** Rolled onto the cylinder, or flat on the tangent plane. */
export function setWrap(placements, selection, wrap) {
  for (const i of selection) if (placements[i]) placements[i].wrap = !!wrap;
  return placements;
}

/**
 * Mirror the selection across the body's plane of symmetry.
 *
 * A mirrored placement is the piece's own reflection: its station reflects
 * about the front, its in-surface spin reverses with it, and the piece itself
 * is turned over -- because a reflection is not a rotation, and a piece
 * reflected without being flipped would be the wrong one of the two.
 *
 * `aboutDeg` is the plane to mirror in: 0 is the centre front / centre back
 * plane, which is the one that matters for a garment.
 */
export function mirror(placements, selection, aboutDeg = 0) {
  const a0 = aboutDeg * RAD;
  for (const i of selection) {
    const p = placements[i];
    if (!p) continue;
    p.station = 2 * a0 - p.station;
    p.spin = -p.spin;
    p.swing = -p.swing;
    p.flip = !p.flip;
  }
  return placements;
}

/**
 * Space the selected pieces equally around the body, in the order they are in
 * now. The one-click fix for an arrangement that has been shuffled into a
 * heap, and the thing a pattern with no placement hints needs immediately.
 */
export function distribute(placements, selection, { fullTurn = true } = {}) {
  const ids = [...selection].filter((i) => placements[i]);
  if (ids.length < 2) return placements;
  // keep them in their current angular order, so nothing jumps across the body
  const norm = (a) => a - Math.PI * 2 * Math.floor(a / (Math.PI * 2));
  ids.sort((i, j) => norm(placements[i].station) - norm(placements[j].station));
  const a0 = norm(placements[ids[0]].station);
  const span = fullTurn ? Math.PI * 2 : Math.PI * 2 * (ids.length - 1) / ids.length;
  ids.forEach((id, k) => { placements[id].station = a0 + span * k / ids.length; });
  return placements;
}

/** Put the selected pieces back where their own placement hints asked for. */
export function reset(placements, selection, defaults) {
  for (const i of selection) {
    if (placements[i] && defaults[i]) placements[i] = placement(defaults[i]);
  }
  return placements;
}

/** Readable numbers for the selected piece, for a readout beside the buttons. */
export function describe(pl) {
  return {
    'around the body': `${(pl.station * DEG).toFixed(0)} deg`,
    height: `${pl.y.toFixed(1)} cm`,
    'out from the axis': `${pl.radius.toFixed(1)} cm`,
    spin: `${(pl.spin * DEG).toFixed(0)} deg`,
    tilt: `${(pl.tilt * DEG).toFixed(0)} deg`,
    swing: `${(pl.swing * DEG).toFixed(0)} deg`,
    'face down': pl.flip ? 'yes' : 'no',
    'on the cylinder': pl.wrap ? 'rolled' : 'flat',
  };
}

// ------------------------------------------------------------- applying it

/**
 * Rewrite every selected piece's vertices in an Assembly from its placement.
 *
 * `offsets[pi]` is where panel pi's points start in `asm.verts`, which layOut
 * records, because layOut pushes each panel's points in order.
 */
export function applyPlacements(asm, pattern, placements, axis, offsets, which = null) {
  const ids = which || pattern.panels.map((_, i) => i);
  const scratch = [];
  for (const pi of ids) {
    const panel = pattern.panels[pi];
    const base = offsets[pi];
    scratch.length = 0;
    for (let i = 0; i < panel.pts.length; i++) scratch.push(asm.verts[base + i]);
    placePanel(panel, placements[pi], axis, scratch);
  }
  return asm;
}

// ------------------------------------------------------------- the isometry

/**
 * How much a placement changes the piece's own measurements, as a relative
 * edge-length error against the flat pattern.
 *
 * This is the claim the whole arrangement phase rests on, so it is checkable
 * rather than asserted. Flat (`wrap: false`) it is exactly zero to rounding.
 * Rolled it is the chord-versus-arc error of the mesh, edge^2/24R^2, which is
 * under a tenth of a per cent at these sizes -- and crucially it does not GROW
 * with the number of buttons pressed, which is what an accumulated mutation
 * could not promise.
 */
export function placementStrain(panel, pl, axis) {
  const P = placePanel(panel, pl, axis);
  let worst = 0;
  for (const t of panel.tris) {
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const a = panel.pts[t[i]], b = panel.pts[t[j]];
      const flat = Math.hypot(b.x - a.x, b.y - a.y);
      if (flat < 1e-9) continue;
      const A = P[t[i]], B = P[t[j]];
      const got = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      worst = Math.max(worst, Math.abs(got - flat) / flat);
    }
  }
  return worst;
}
