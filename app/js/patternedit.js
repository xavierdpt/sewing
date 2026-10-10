// Editing a pattern piece: taking a wedge out, and letting a wedge in.
//
// These two are most of pattern making, and they are the same operation with
// opposite sign:
//
//   TAKE A WEDGE OUT   cut a triangle of cloth away and sew the two cut edges
//                      to each other. The piece loses area and gains SHAPE:
//                      sewn up, the flat piece can no longer lie flat, because
//                      the material that used to go round the apex is gone.
//                      That is a dart, and it is how a flat cloth is made to
//                      fit a bust, a shoulder blade or a seat.
//
//   LET A WEDGE IN     cut the piece and insert a triangle of cloth between the
//                      two cut edges. The piece gains area and loses shape: it
//                      spreads. That is slash-and-spread, and it is how flare,
//                      gathers and godets are added.
//
// Both are exact here, and neither distorts the cloth that is left. A wedge
// taken out removes triangles and moves nothing: the material either side is
// untouched, and all the 3D consequence comes from sewing the two cut edges
// together. A wedge let in cuts the piece in two, moves one half by a RIGID
// rotation about the pivot, and fills the gap with new cloth. Nothing is
// stretched by either, so a pattern can be edited and re-edited without
// accumulating error.
//
// The sewing comes for free. A dart's two legs are given the same vertex ids,
// which is the same thing a seam between two pieces is, so assemble.js stitches
// a dart closed with no knowledge that it is a dart. A dart really is just a
// seam that happens to be inside a piece.

import { annotateSeams } from './patternio.js';

const EPS = 1e-9;

const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const len2 = (a) => Math.hypot(a[0], a[1]);

/** Wrap an angle into [0, 2pi). */
const norm2pi = (x) => {
  const t = x % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
};

/** Angle of p about the apex, in [0, 2pi). */
const angleAbout = (p, apex) => {
  const a = Math.atan2(p.y - apex[1], p.x - apex[0]);
  return a < 0 ? a + 2 * Math.PI : a;
};

/** Is `a` inside the sector from `from` sweeping `span` anticlockwise? */
const inSector = (a, from, span) => {
  const d = norm2pi(a - from);
  return d > EPS && d < span - EPS;
};

/**
 * Split every triangle that a ray from the apex passes through, so that the ray
 * lies along mesh edges and nothing has to be cut later.
 *
 * Returns the vertices that now lie on the ray, ordered outward from the apex.
 */
function splitAlongRay(panel, apex, theta, { apexIndex = null } = {}) {
  const dir = [Math.cos(theta), Math.sin(theta)];
  const onRay = (q) => {
    const d = [q.x - apex[0], q.y - apex[1]];
    const r = d[0] * dir[0] + d[1] * dir[1];
    return r >= -EPS && Math.abs(cross2(d, dir)) < 1e-7 * Math.max(1, r);
  };

  // Split edges the ray crosses. One pass is enough: each split only shortens
  // the edges it creates, and they no longer cross the ray.
  for (let guard = 0; guard < 500; guard++) {
    let did = false;
    for (let ti = 0; ti < panel.tris.length && !did; ti++) {
      const t = panel.tris[ti];
      for (let k = 0; k < 3 && !did; k++) {
        const ia = t[k], ib = t[(k + 1) % 3];
        const A = panel.pts[ia], B = panel.pts[ib];
        if (onRay(A) || onRay(B)) continue;
        // does segment AB cross the ray from the apex?
        const ao = sub2([A.x, A.y], apex), bo = sub2([B.x, B.y], apex);
        const ca = cross2(dir, ao), cb = cross2(dir, bo);
        if ((ca > 0) === (cb > 0)) continue;              // same side of the line
        const s = ca / (ca - cb);
        const px = A.x + (B.x - A.x) * s, py = A.y + (B.y - A.y) * s;
        const r = (px - apex[0]) * dir[0] + (py - apex[1]) * dir[1];
        if (r <= EPS) continue;                            // behind the apex
        // new vertex, splitting every triangle that uses edge (ia, ib)
        const ni = panel.pts.length;
        panel.pts.push({ x: px, y: py, v3: null, uv: A.uv && B.uv
          ? [A.uv[0] + (B.uv[0] - A.uv[0]) * s, A.uv[1] + (B.uv[1] - A.uv[1]) * s] : undefined });
        const extra = [];
        for (let tj = panel.tris.length - 1; tj >= 0; tj--) {
          const u = panel.tris[tj];
          const ka = u.indexOf(ia), kb = u.indexOf(ib);
          if (ka < 0 || kb < 0) continue;
          const kc = 3 - ka - kb;
          // Split in the triangle's OWN cyclic direction, or the two halves
          // come out wound against the rest of the mesh -- which is invisible
          // until something asks the pattern which way is up.
          const [first, second] = ((ka + 1) % 3 === kb) ? [u[ka], u[kb]] : [u[kb], u[ka]];
          extra.push([first, ni, u[kc]], [ni, second, u[kc]]);
          panel.tris.splice(tj, 1);
        }
        panel.tris.push(...extra);
        did = true;
      }
    }
    if (!did) break;
  }

  const chain = panel.pts
    .map((q, i) => ({ i, r: (q.x - apex[0]) * dir[0] + (q.y - apex[1]) * dir[1], q }))
    .filter(({ i, q, r }) => onRay(q) && r > EPS && i !== apexIndex)
    .sort((a, b) => a.r - b.r);
  return chain;
}

/** Nearest existing point of the panel to (x, y), or null. */
function nearestPoint(panel, x, y) {
  let best = -1, bd = Infinity;
  panel.pts.forEach((q, i) => {
    const d = (q.x - x) ** 2 + (q.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

const panelArea = (panel) => panel.tris.reduce((a, t) => {
  const A = panel.pts[t[0]], B = panel.pts[t[1]], C = panel.pts[t[2]];
  return a + Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
}, 0);

/** The outline of a panel, as a cyclically ordered list of point indices. */
export function outlineOf(panel) {
  const count = new Map();
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (const t of panel.tris) {
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const k = key(t[i], t[j]);
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  const nbr = new Map();
  for (const [k, n] of count) {
    if (n !== 1) continue;
    const [a, b] = k.split('_').map(Number);
    if (!nbr.has(a)) nbr.set(a, []);
    if (!nbr.has(b)) nbr.set(b, []);
    nbr.get(a).push(b);
    nbr.get(b).push(a);
  }
  if (!nbr.size) return [];
  const start = [...nbr.keys()][0];
  const loop = [start];
  const seen = new Set([start]);
  let cur = start;
  for (;;) {
    const next = (nbr.get(cur) || []).find((x) => !seen.has(x));
    if (next === undefined) break;
    loop.push(next);
    seen.add(next);
    cur = next;
  }
  return loop;
}

/**
 * Take a wedge of cloth out of a piece, and sew the two cut edges together.
 *
 * The wedge is a sector: an apex somewhere in the piece, a bisector direction,
 * and the intake angle. The cloth inside it is removed and the two cut edges
 * become a seam — given matching vertex ids, so the assembly machinery sews
 * them with no idea it is a dart.
 *
 * The material either side of the wedge is not touched. That is the whole
 * reason a dart works: nothing is stretched, cloth is simply missing, and what
 * remains can no longer lie flat once the gap is closed up.
 *
 * @param apex       [x, y] in the panel's own coordinates
 * @param bisectDeg  direction the wedge points, degrees anticlockwise from +x
 * @param intakeDeg  how wide the wedge is
 */
export function takeOutWedge(pattern, panelIndex, { apex, bisectDeg, intakeDeg }) {
  const panel = pattern.panels[panelIndex];
  const before = panelArea(panel);
  const half = (intakeDeg * Math.PI / 180) / 2;
  const mid = bisectDeg * Math.PI / 180;
  const a1 = mid - half, a2 = mid + half;

  const apexIndex = nearestPoint(panel, apex[0], apex[1]);
  const A = [panel.pts[apexIndex].x, panel.pts[apexIndex].y];

  const leg1 = splitAlongRay(panel, A, a1, { apexIndex });
  const leg2 = splitAlongRay(panel, A, a2, { apexIndex });
  if (!leg1.length || !leg2.length) {
    throw new Error('the wedge does not reach the edge of the piece: move the apex or widen it');
  }

  // Drop everything inside the sector.
  const keep = panel.tris.filter((t) => {
    const cx = (panel.pts[t[0]].x + panel.pts[t[1]].x + panel.pts[t[2]].x) / 3;
    const cy = (panel.pts[t[0]].y + panel.pts[t[1]].y + panel.pts[t[2]].y) / 3;
    return !inSector(angleAbout({ x: cx, y: cy }, A), a1, 2 * half);
  });
  if (keep.length === panel.tris.length) {
    throw new Error('the wedge contains no cloth: check the apex and the direction');
  }
  panel.tris = keep;

  // Pair the two legs up the way a sewer trues a dart: by fraction of the leg,
  // so the same point of one leg meets the same point of the other. The legs
  // are straight, so their lengths are their outer radii, and the mismatch
  // between them is reported rather than hidden -- a dart whose legs are
  // different lengths is one that will not close cleanly.
  const n = Math.min(leg1.length, leg2.length);
  const sampleAt = (leg, f) => leg[Math.min(leg.length - 1, Math.round(f * (leg.length - 1)))];
  let nextId = 1 + pattern.panels.reduce((m, p) => Math.max(m,
    ...p.pts.map((q) => (q.v3 === null || q.v3 === undefined ? -1 : q.v3))), -1);
  const pairs = [];
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 1 : k / (n - 1);
    const p1 = sampleAt(leg1, f), p2 = sampleAt(leg2, f);
    const id = nextId++;
    panel.pts[p1.i].v3 = id;
    panel.pts[p2.i].v3 = id;
    pairs.push([p1.i, p2.i]);
  }
  // any remaining unlabelled point on a leg gets its own id, so nothing is
  // silently welded to anything
  for (const leg of [leg1, leg2]) {
    for (const { i } of leg) if (panel.pts[i].v3 === null) panel.pts[i].v3 = nextId++;
  }
  for (const q of panel.pts) if (q.v3 === null || q.v3 === undefined) q.v3 = nextId++;

  panel.loop = outlineOf(panel);
  panel.darts = (panel.darts || []).concat([{
    apex: apexIndex, intakeDeg, bisectDeg,
    legCm: [+leg1[leg1.length - 1].r.toFixed(3), +leg2[leg2.length - 1].r.toFixed(3)],
  }]);
  const after = panelArea(panel);
  panel.areaCm2 = +after.toFixed(2);
  return {
    pattern: annotateSeams(pattern),
    removedCm2: +(before - after).toFixed(2),
    legCm: [+leg1[leg1.length - 1].r.toFixed(2), +leg2[leg2.length - 1].r.toFixed(2)],
    legMismatchCm: +Math.abs(leg1[leg1.length - 1].r - leg2[leg2.length - 1].r).toFixed(3),
    pairs: pairs.length,
  };
}

/**
 * Cut a piece and let a wedge of cloth in: slash and spread.
 *
 * The cut runs from the apex out to the edge of the piece. Everything
 * anticlockwise of it is turned about the apex by the spread angle -- a RIGID
 * rotation, so that half of the piece is untouched -- and the gap is filled
 * with new cloth.
 *
 * This is the exact inverse of taking a wedge out, and the two compose: take
 * one out at the waist and let one in at the hem and you have moved the
 * fullness from one to the other, which is the manoeuvre most of pattern
 * drafting is made of.
 */
export function letInWedge(pattern, panelIndex, { apex, towardsDeg, spreadDeg }) {
  const panel = pattern.panels[panelIndex];
  const before = panelArea(panel);
  const theta = towardsDeg * Math.PI / 180;
  const spread = spreadDeg * Math.PI / 180;
  const apexIndex = nearestPoint(panel, apex[0], apex[1]);
  const A = [panel.pts[apexIndex].x, panel.pts[apexIndex].y];

  const leg = splitAlongRay(panel, A, theta, { apexIndex });
  if (!leg.length) throw new Error('the cut does not reach the edge of the piece');

  let nextId = 1 + pattern.panels.reduce((m, p) => Math.max(m,
    ...p.pts.map((q) => (q.v3 === null || q.v3 === undefined ? -1 : q.v3))), -1);

  // Duplicate the cut: one copy stays put, the other travels with the half
  // that turns. They are different points of the garment now -- there is cloth
  // between them -- so they get different ids.
  const twin = new Map();
  for (const { i } of leg) {
    const q = panel.pts[i];
    panel.pts.push({ x: q.x, y: q.y, v3: nextId++, uv: q.uv ? [...q.uv] : undefined });
    twin.set(i, panel.pts.length - 1);
  }

  // Which triangles turn? The ones anticlockwise of the cut.
  const turning = [];
  for (const t of panel.tris) {
    const cx = (panel.pts[t[0]].x + panel.pts[t[1]].x + panel.pts[t[2]].x) / 3;
    const cy = (panel.pts[t[0]].y + panel.pts[t[1]].y + panel.pts[t[2]].y) / 3;
    // Which side of the cut is this triangle on? The angle about the apex,
    // measured from the cut and wrapped into [0, 2pi): the first half turn is
    // one side of the cut, the second half is the other. Wrapping only the
    // negative case -- which is what this said at first -- leaves angles above
    // 2pi unwrapped, and then nothing is ever classified as turning and the
    // spread silently does nothing at all.
    const d = norm2pi(angleAbout({ x: cx, y: cy }, A) - theta);
    if (d < Math.PI) turning.push(t);
  }
  const moved = new Set();
  for (const t of turning) {
    for (let k = 0; k < 3; k++) {
      if (twin.has(t[k])) { t[k] = twin.get(t[k]); }
      moved.add(t[k]);
    }
  }
  // rotate the turning half, rigidly, about the apex
  const ca = Math.cos(spread), sa = Math.sin(spread);
  for (const i of moved) {
    if (i === apexIndex) continue;
    const q = panel.pts[i];
    const x = q.x - A[0], y = q.y - A[1];
    q.x = A[0] + x * ca - y * sa;
    q.y = A[1] + x * sa + y * ca;
  }

  // fill the gap with cloth: a strip between the cut and its twin
  // Fill the gap with cloth: a strip between the cut and its twin. The twin
  // chain is the one that turned, so it is anticlockwise of the original, and
  // the triangles are wound to match the rest of the piece.
  const sgn = Math.sign(panel.tris.reduce((acc, t) => {
    const A0 = panel.pts[t[0]], B0 = panel.pts[t[1]], C0 = panel.pts[t[2]];
    return acc + ((B0.x - A0.x) * (C0.y - A0.y) - (C0.x - A0.x) * (B0.y - A0.y));
  }, 0)) || 1;
  const face = (a, b, c) => {
    const A0 = panel.pts[a], B0 = panel.pts[b], C0 = panel.pts[c];
    const ar = (B0.x - A0.x) * (C0.y - A0.y) - (C0.x - A0.x) * (B0.y - A0.y);
    if (Math.abs(ar) < 1e-12) return;
    panel.tris.push(Math.sign(ar) === sgn ? [a, b, c] : [a, c, b]);
  };
  for (let k = 0; k < leg.length; k++) {
    const a0 = k === 0 ? apexIndex : leg[k - 1].i;
    const b0 = k === 0 ? apexIndex : twin.get(leg[k - 1].i);
    const a1 = leg[k].i, b1 = twin.get(leg[k].i);
    if (a0 === apexIndex) face(apexIndex, a1, b1);
    else { face(a0, a1, b1); face(a0, b1, b0); }
  }

  for (const q of panel.pts) if (q.v3 === null || q.v3 === undefined) q.v3 = nextId++;
  panel.loop = outlineOf(panel);
  const after = panelArea(panel);
  panel.areaCm2 = +after.toFixed(2);
  return {
    pattern: annotateSeams(pattern),
    addedCm2: +(after - before).toFixed(2),
    legCm: +leg[leg.length - 1].r.toFixed(2),
  };
}

/**
 * Is this pattern still sewable?
 *
 * Three things can go wrong when a piece is edited, and all three are silent
 * until something looks odd in 3D: a seam whose two sides are no longer the
 * same length, a triangle turned inside out, and a vertex id used by points
 * that are not meant to be sewn.
 */
export function check(pattern) {
  const problems = [];
  let flipped = 0, zero = 0;
  for (const p of pattern.panels) {
    for (const t of p.tris) {
      const A = p.pts[t[0]], B = p.pts[t[1]], C = p.pts[t[2]];
      const a = (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y);
      if (Math.abs(a) < 1e-9) zero++;
      else if (a < 0) flipped++;
    }
  }
  // A mesh can be wound either way; what matters is that it is consistent, so
  // the count that means anything is whichever orientation is in the minority.
  const total = pattern.panels.reduce((n, p) => n + p.tris.length, 0);
  const inconsistent = Math.min(flipped, total - flipped - zero);
  if (zero) problems.push(`${zero} degenerate triangles`);
  if (inconsistent) problems.push(`${inconsistent} triangles wound against the rest`);

  const seamLengths = new Map();
  for (const p of pattern.panels) {
    for (const r of p.runs || []) {
      if (r.kind !== 'seam') continue;
      if (!seamLengths.has(r.seam)) seamLengths.set(r.seam, []);
      seamLengths.get(r.seam).push(r.lengthCm);
    }
  }
  let worstSeam = 0;
  for (const [id, ls] of seamLengths) {
    if (ls.length < 2) continue;
    const d = Math.max(...ls) - Math.min(...ls);
    if (d > worstSeam) worstSeam = d;
    if (d > 0.1) problems.push(`seam ${id} differs by ${d.toFixed(2)} cm between its sides`);
  }
  return {
    ok: problems.length === 0,
    problems,
    degenerateTriangles: zero,
    worstSeamMismatchCm: +worstSeam.toFixed(3),
    areaCm2: +pattern.panels.reduce((a, p) => a + panelArea(p), 0).toFixed(2),
  };
}

export { panelArea };
