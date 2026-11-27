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
 * Split the edge (ia, ib) at parameter s, rewiring every triangle that uses
 * it, and return the new point's index.
 *
 * Every triangle on BOTH sides is rewired, which is what makes the mesh stay a
 * mesh: splitting one side only would leave a T-junction, and a T-junction is
 * a crack the moment the cloth is pulled.
 */
function splitEdgeAt(panel, ia, ib, s) {
  const A = panel.pts[ia], B = panel.pts[ib];
  const ni = panel.pts.length;
  panel.pts.push({
    x: A.x + (B.x - A.x) * s,
    y: A.y + (B.y - A.y) * s,
    v3: null,
    uv: A.uv && B.uv
      ? [A.uv[0] + (B.uv[0] - A.uv[0]) * s, A.uv[1] + (B.uv[1] - A.uv[1]) * s]
      : undefined,
  });
  const extra = [];
  for (let tj = panel.tris.length - 1; tj >= 0; tj--) {
    const u = panel.tris[tj];
    const ka = u.indexOf(ia), kb = u.indexOf(ib);
    if (ka < 0 || kb < 0) continue;
    const kc = 3 - ka - kb;
    // Split in the triangle's OWN cyclic direction, or the two halves come out
    // wound against the rest of the mesh -- which is invisible until something
    // asks the pattern which way is up.
    const [first, second] = ((ka + 1) % 3 === kb) ? [u[ka], u[kb]] : [u[kb], u[ka]];
    extra.push([first, ni, u[kc]], [ni, second, u[kc]]);
    panel.tris.splice(tj, 1);
  }
  panel.tris.push(...extra);
  return ni;
}

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
        // a new vertex on the ray, in every triangle that used that edge
        splitEdgeAt(panel, ia, ib, s);
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
 * Give the two legs of a wedge the SAME fractions, by splitting whichever one
 * is missing a vertex where the other has one.
 *
 * This is what makes the pairing Thales'. Two legs leave a common apex and are
 * sewn to each other, so the point at fraction t of one belongs to the point at
 * fraction t of the other and the stitches are parallel chords across the
 * wedge. But the vertices on a leg are not chosen: `splitAlongRay` puts them
 * where the cut crossed the mesh, and the two rays cross different edges, so
 * one leg can carry 11 vertices where the other carries 7 and none of them at
 * matching fractions.
 *
 * Pairing those by INDEX -- what this file used to do -- joins fraction 0.30
 * of one leg to 0.42 of the other and leaves the surplus sewn to nothing.
 * Measured by `node tools/darts.mjs` on the asymmetric fixture, before this:
 * the tilted dart paired 7 of its 11 points and left 4 joined to nothing, the
 * worst pair was 0.161 of a leg out, and the two points of one stitch started
 * 2.49 cm apart along the seam they were supposed to be.
 *
 * So instead of choosing a correspondence, the legs are made to agree: take
 * every fraction either leg has, and ensure both have a vertex there. Then the
 * pairing is forced, one to one, in order, and the error is zero by
 * construction rather than small by luck.
 *
 * @param chains  [leg1, leg2] as returned by splitAlongRay (apex excluded)
 * @returns the two chains again, equal in length, each sorted outward
 */
function harmoniseLegs(panel, apex, dirs, apexIndex, chains) {
  const rOf = (i, d) => (panel.pts[i].x - apex[0]) * d[0] + (panel.pts[i].y - apex[1]) * d[1];
  // the apex is the shared r = 0 end of both legs
  const legs = chains.map((c) => [{ i: apexIndex, r: 0 }].concat(
    c.map(({ i }) => ({ i, r: 0 })),
  ));
  legs.forEach((leg, k) => { for (const node of leg) node.r = node.i === apexIndex ? 0 : rOf(node.i, dirs[k]); });
  legs.forEach((leg) => leg.sort((a, b) => a.r - b.r));
  const L = legs.map((leg) => leg[leg.length - 1].r);
  if (!(L[0] > 0) || !(L[1] > 0)) return chains;

  // every fraction either leg already has
  const targets = [...new Set(legs.flatMap((leg, k) => leg.map((n) => n.r / L[k])))]
    .filter((t) => t > 1e-9 && t < 1 - 1e-9)
    .sort((a, b) => a - b);

  legs.forEach((leg, k) => {
    for (const t of targets) {
      const want = t * L[k];
      // already there?
      if (leg.some((n) => Math.abs(n.r - want) < 1e-6 * L[k])) continue;
      // the segment that contains it, as a mesh edge between two leg vertices
      let seg = -1;
      for (let j = 0; j + 1 < leg.length; j++) {
        if (leg[j].r < want && want < leg[j + 1].r) { seg = j; break; }
      }
      if (seg < 0) continue;                       // outside the leg: nothing to split
      const a = leg[seg], b = leg[seg + 1];
      const ni = splitEdgeAt(panel, a.i, b.i, (want - a.r) / (b.r - a.r));
      leg.splice(seg + 1, 0, { i: ni, r: want });
    }
  });
  // hand back the chains without the apex, which is not a stitch
  return legs.map((leg) => leg.filter((n) => n.i !== apexIndex));
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

  const apexIndex = resolvePoint(panel, apex);
  if (apexIndex < 0) throw new Error('the apex is nowhere on this piece: no such edge to measure along');
  const A = [panel.pts[apexIndex].x, panel.pts[apexIndex].y];

  let leg1 = splitAlongRay(panel, A, a1, { apexIndex });
  let leg2 = splitAlongRay(panel, A, a2, { apexIndex });
  if (!leg1.length || !leg2.length) {
    throw new Error('the wedge does not reach the edge of the piece: move the apex or widen it');
  }
  // Make the two legs carry matching fractions before anything is paired or
  // removed: the split has to happen while the triangles either side of each
  // leg still exist.
  [leg1, leg2] = harmoniseLegs(panel, A,
    [[Math.cos(a1), Math.sin(a1)], [Math.cos(a2), Math.sin(a2)]], apexIndex, [leg1, leg2]);

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

  // Pair the two legs up the way a sewer trues a dart: fraction of the leg to
  // the same fraction of the other leg, which after harmoniseLegs is a one to
  // one match in order with no fraction left over. The legs are straight, so
  // their lengths are their outer radii, and the mismatch between THOSE is
  // still reported rather than hidden -- a dart whose legs are different
  // lengths is one that will not close cleanly, and that is a property of
  // where the apex was put, not of the pairing.
  const n = Math.min(leg1.length, leg2.length);
  let nextId = 1 + pattern.panels.reduce((m, p) => Math.max(m,
    ...p.pts.map((q) => (q.v3 === null || q.v3 === undefined ? -1 : q.v3))), -1);
  const pairs = [];
  for (let k = 0; k < n; k++) {
    const p1 = leg1[k], p2 = leg2[k];
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
  record(pattern, {
    op: 'dart', panel: panelRef(pattern, panelIndex), at: apex,
    on: Array.isArray(apex) ? describeApex(panel, apexIndex) : apex,
    bisectDeg, intakeDeg,
  });
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
  const apexIndex = resolvePoint(panel, apex);
  if (apexIndex < 0) throw new Error('the cut starts nowhere on this piece: no such edge to measure along');
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
  record(pattern, {
    op: 'spread', panel: panelRef(pattern, panelIndex), at: apex,
    on: Array.isArray(apex) ? describeApex(panel, apexIndex) : apex,
    towardsDeg, spreadDeg,
  });
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

// ------------------------------------------------------- shared machinery
//
// Everything below this line is an edit the cutting table can make. They have
// one shape in common, and it is worth saying once: an operation takes the
// pattern and a piece, changes the mesh, renumbers whatever vertex ids the
// change created, recomputes the outline and the area, records what it did in
// `pattern.edits`, and hands back a report with numbers in it. The differences
// between them are entirely in the middle step.

/** The first vertex id nothing is using. */
function nextFreeId(pattern) {
  let m = -1;
  for (const p of pattern.panels) {
    for (const q of p.pts) if (q.v3 !== null && q.v3 !== undefined && q.v3 > m) m = q.v3;
  }
  return m + 1;
}

/** Give every unlabelled point its own id, so nothing is welded by accident. */
function labelLoose(pattern) {
  let id = nextFreeId(pattern);
  for (const p of pattern.panels) {
    for (const q of p.pts) if (q.v3 === null || q.v3 === undefined) q.v3 = id++;
  }
}

/** The sign of the panel's winding, as the majority of its triangles have it. */
function windingOf(panel) {
  const a = panel.tris.reduce((acc, t) => {
    const A = panel.pts[t[0]], B = panel.pts[t[1]], C = panel.pts[t[2]];
    return acc + ((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y));
  }, 0);
  return Math.sign(a) || 1;
}

const centroidOf = (panel) => {
  const n = panel.pts.length || 1;
  return [panel.pts.reduce((a, q) => a + q.x, 0) / n, panel.pts.reduce((a, q) => a + q.y, 0) / n];
};

/** Settle a panel after its mesh changed: outline, area. */
function refreshPanel(panel) {
  panel.loop = outlineOf(panel);
  panel.areaCm2 = +panelArea(panel).toFixed(2);
  return panel;
}

/** Record what was done, so it can be listed and replayed. */
function record(pattern, edit) {
  if (!pattern.edits) pattern.edits = [];
  pattern.edits.push(edit);
  return edit;
}

const panelRef = (pattern, panelIndex) => (pattern.panels[panelIndex].name || panelIndex);

/**
 * Which piece does a recorded edit mean?
 *
 * By name if the piece has one, because an index is only true of the pattern
 * it was recorded against and names survive a re-unfold. An edit that names a
 * piece this pattern does not have is skipped and said out loud rather than
 * applied to whichever piece happens to be at that index.
 */
export function resolvePanel(pattern, ref) {
  if (typeof ref === 'number') return ref >= 0 && ref < pattern.panels.length ? ref : -1;
  const i = pattern.panels.findIndex((p) => p.name === ref);
  return i;
}

/**
 * Where on a piece is `spec`, as a point index?
 *
 * Two forms, and the second is the one that makes an edit replayable:
 *
 *   [x, y]                     the nearest vertex to a place on the table
 *   { run: 'S01'|'top'|'bottom'|'waist'|'hem', t }
 *                              the vertex nearest the fraction t of the way
 *                              along that edge, measured by arc length
 *
 * A coordinate means the piece it was recorded on. A fraction along a named
 * edge means the same place on a piece unfolded for a different body, which
 * is what replaying an edit onto another form needs -- "a third of the way
 * along the waist" survives the waist changing length, and (14.2, -3.1) does
 * not.
 */
export function resolvePoint(panel, spec) {
  if (Array.isArray(spec)) return nearestPoint(panel, spec[0], spec[1]);
  if (spec && spec.run !== undefined) {
    const want = spec.run;
    const alias = { waist: 'top', hem: 'bottom' };
    const runs = (panel.runs || []).filter((r) => r.seam === want
      || r.kind === want || r.kind === alias[want]);
    if (!runs.length) return -1;
    const r = runs[0];
    // arc length along the run, then the vertex nearest the asked-for fraction
    const ls = [0];
    for (let k = 1; k < r.pts.length; k++) {
      const a = panel.pts[r.pts[k - 1]], b = panel.pts[r.pts[k]];
      ls.push(ls[k - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const L = ls[ls.length - 1];
    if (!(L > 0)) return r.pts[0];
    const want2 = Math.min(1, Math.max(0, spec.t === undefined ? 0.5 : spec.t)) * L;
    // the foot of the construction, interpolated along the edge rather than
    // snapped to a vertex: the vertices of a re-unfolded piece are not in the
    // same places, and the fraction is the thing that carried over
    let k = 1;
    while (k < ls.length - 1 && ls[k] < want2) k++;
    const a = panel.pts[r.pts[k - 1]], b = panel.pts[r.pts[k]];
    const seg = ls[k] - ls[k - 1] || 1;
    const u = Math.max(0, Math.min(1, (want2 - ls[k - 1]) / seg));
    const foot = [a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u];
    const off = spec.offsetCm || 0;
    if (!off) return nearestPoint(panel, foot[0], foot[1]);
    // in from the edge: the perpendicular, taken towards the middle of the
    // piece, because which side of an edge is inside is not a thing an edge
    // knows
    const dx = b.x - a.x, dy = b.y - a.y;
    const dl = Math.hypot(dx, dy) || 1;
    const n = [-dy / dl, dx / dl];
    const c = centroidOf(panel);
    const sgn = ((c[0] - foot[0]) * n[0] + (c[1] - foot[1]) * n[1]) >= 0 ? 1 : -1;
    return nearestPoint(panel, foot[0] + n[0] * off * sgn, foot[1] + n[1] * off * sgn);
  }
  return -1;
}

/**
 * Describe a point of a piece as a CONSTRUCTION, so the edit that uses it can
 * be replayed onto a piece cut for a different body.
 *
 * The construction is the one a dart is actually placed by: so far along an
 * edge, and so far in from it. A dart apex is an interior point, so a fraction
 * along an edge cannot name it on its own -- it needs the offset as well, and
 * with both it survives the waist changing length, which a coordinate does
 * not. Measured, before this existed: every dart replayed onto a skirt 6 cm
 * wider in the waist missed, because the apex snapped to whatever vertex was
 * nearest its old (x, y) and the legs no longer reached an edge.
 */
export function describeApex(panel, i) {
  const runs = panel.runs || [];
  const P = panel.pts[i];
  if (!runs.length || !P) return null;
  let best = null;
  for (const r of runs) {
    const ls = [0];
    for (let k = 1; k < r.pts.length; k++) {
      const a = panel.pts[r.pts[k - 1]], b = panel.pts[r.pts[k]];
      ls.push(ls[k - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const L = ls[ls.length - 1];
    if (!(L > 0)) continue;
    for (let k = 1; k < r.pts.length; k++) {
      const a = panel.pts[r.pts[k - 1]], b = panel.pts[r.pts[k]];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1;
      let t = ((P.x - a.x) * dx + (P.y - a.y) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t, py = a.y + dy * t;
      const d = Math.hypot(P.x - px, P.y - py);
      if (!best || d < best.d) best = { d, r, frac: (ls[k - 1] + t * Math.hypot(dx, dy)) / L };
    }
  }
  if (!best) return null;
  return {
    run: best.r.kind === 'seam' ? best.r.seam : best.r.kind,
    t: +best.frac.toFixed(5),
    offsetCm: +best.d.toFixed(3),
  };
}

// ---------------------------------------------------- the rigid transforms
//
// Turn, move and mirror. They are one operation with three faces: every point
// of the piece goes through the same affine map, so the cloth is not touched
// at all and the result is isometric by construction -- there is nothing to
// measure about the shape afterwards, which is why these three are the cheap
// ones.
//
// Mirror is not quite as cheap as the other two, and the difference is not
// geometric. A reflection reverses orientation, so the triangles have to be
// re-wound or the piece is the only thing in the pattern facing the other way;
// and a mirrored COPY is a different piece of the garment, so its points need
// ids of their own. The exception is a fold: the two halves of a piece cut on
// the fold meet along the fold line and share those ids exactly, which is the
// one case where a mirrored copy is welded rather than renumbered.

function mapPoints(panel, fn) {
  for (const q of panel.pts) {
    const [x, y] = fn(q.x, q.y);
    q.x = x; q.y = y;
  }
}

/** Slide a piece across the table. Changes nothing about the cloth. */
export function movePiece(pattern, panelIndex, { dx = 0, dy = 0 } = {}) {
  const panel = pattern.panels[panelIndex];
  mapPoints(panel, (x, y) => [x + dx, y + dy]);
  refreshPanel(panel);
  record(pattern, { op: 'move', panel: panelRef(pattern, panelIndex), dx, dy });
  return { pattern: annotateSeams(pattern), movedCm: +Math.hypot(dx, dy).toFixed(3) };
}

/**
 * Turn a piece about a point -- its own centre unless told otherwise.
 *
 * The reason to want this is the grain: `alignPanel` turns an unfolded piece
 * by its principal axis, which is a guess, and the grain line is a decision.
 */
export function turnPiece(pattern, panelIndex, { degrees = 0, about = null } = {}) {
  const panel = pattern.panels[panelIndex];
  const c = about || centroidOf(panel);
  const a = degrees * Math.PI / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  mapPoints(panel, (x, y) => {
    const dx = x - c[0], dy = y - c[1];
    return [c[0] + dx * ca - dy * sa, c[1] + dx * sa + dy * ca];
  });
  refreshPanel(panel);
  record(pattern, { op: 'turn', panel: panelRef(pattern, panelIndex), degrees, about: c });
  return { pattern: annotateSeams(pattern), degrees, about: c.map((v) => +v.toFixed(2)) };
}

/** The line a mirror reflects about, as a point and a unit direction. */
function mirrorLine(panel, { line = null, axis = null } = {}) {
  if (line) {
    const [a, b] = line;
    const d = [b[0] - a[0], b[1] - a[1]];
    const L = Math.hypot(d[0], d[1]);
    if (!(L > EPS)) throw new Error('the mirror line has no length');
    return { p: [a[0], a[1]], d: [d[0] / L, d[1] / L] };
  }
  const c = centroidOf(panel);
  // 'y' mirrors left to right (a vertical line), 'x' top to bottom
  return axis === 'x' ? { p: c, d: [1, 0] } : { p: c, d: [0, 1] };
}

const reflectPt = (x, y, { p, d }) => {
  const vx = x - p[0], vy = y - p[1];
  const t = vx * d[0] + vy * d[1];
  const px = d[0] * t, py = d[1] * t;
  return [p[0] + 2 * px - vx, p[1] + 2 * py - vy];
};

const sideOf = (x, y, { p, d }) => (x - p[0]) * d[1] - (y - p[1]) * d[0];

/**
 * Mirror a piece: flip it over, cut a second one reversed, or open it out on
 * the fold.
 *
 * @param mode
 *   'flip'  reflect the piece where it lies. The same piece, the other way up:
 *           the ids are untouched, because it is the same cloth.
 *   'copy'  a second piece, reflected. "Cut 2, one reversed" -- and its points
 *           get FRESH ids, because the left of a body and the right of it are
 *           different places even when the pieces are the same shape. Giving
 *           the copy the original's ids would weld the two together along
 *           every point at once.
 *   'fold'  reflect the piece about the line and weld it to itself there, the
 *           way cloth folded double is cut once and opens out to a whole
 *           symmetric piece. The points ON the line are shared, and they are
 *           the only ones that are.
 */
export function mirrorPiece(pattern, panelIndex, { line = null, axis = 'y', mode = 'copy' } = {}) {
  const panel = pattern.panels[panelIndex];
  const M = mirrorLine(panel, { line, axis });

  if (mode === 'flip') {
    mapPoints(panel, (x, y) => reflectPt(x, y, M));
    for (const t of panel.tris) { const tmp = t[1]; t[1] = t[2]; t[2] = tmp; }
    refreshPanel(panel);
    record(pattern, { op: 'mirror', panel: panelRef(pattern, panelIndex), mode, line: [M.p, [M.p[0] + M.d[0], M.p[1] + M.d[1]]] });
    return { pattern: annotateSeams(pattern), mode, pieces: pattern.panels.length };
  }

  if (mode === 'copy') {
    let id = nextFreeId(pattern);
    const pts = panel.pts.map((q) => {
      const [x, y] = reflectPt(q.x, q.y, M);
      return { x, y, v3: id++, uv: q.uv ? [...q.uv] : undefined };
    });
    const tris = panel.tris.map((t) => [t[0], t[2], t[1]]);
    const copy = { name: `${panel.name || `P${panelIndex + 1}`}'`, pts, tris, darts: (panel.darts || []).map((d) => ({ ...d })) };
    refreshPanel(copy);
    pattern.panels.push(copy);
    record(pattern, { op: 'mirror', panel: panelRef(pattern, panelIndex), mode, line: [M.p, [M.p[0] + M.d[0], M.p[1] + M.d[1]]] });
    return { pattern: annotateSeams(pattern), mode, pieces: pattern.panels.length, name: copy.name };
  }

  if (mode !== 'fold') throw new Error(`mirror: no such mode ${mode}`);

  // --- cut on the fold. The piece has to be ON one side of the line, or the
  // opened-out piece would lie on top of itself; that is checked rather than
  // approximated, because the overlap would be a silent fault in the sewing.
  const tol = 1e-6;
  const sides = panel.pts.map((q) => sideOf(q.x, q.y, M));
  const span = Math.max(...panel.pts.map((q) => Math.abs(q.x) + Math.abs(q.y)), 1);
  const on = sides.map((s) => Math.abs(s) < 1e-4 * span);
  const pos = sides.some((s, i) => !on[i] && s > tol);
  const neg = sides.some((s, i) => !on[i] && s < -tol);
  if (pos && neg) throw new Error('the fold line crosses the piece: the halves would overlap');
  // A fold line has to be an EDGE of the piece, not a line that touches it.
  // Measured on the first version: folding a skirt panel about a line through
  // its leftmost vertex was accepted and doubled the area, joined at a single
  // point -- a hinge, not a fold, and nothing anyone could cut.
  const onCount = on.filter(Boolean).length;
  if (onCount < 2) {
    throw new Error(`the fold line meets the piece at ${onCount} point`
      + `${onCount === 1 ? '' : 's'}: a fold has to run along an edge of it`);
  }

  let id = nextFreeId(pattern);
  const twin = new Map();
  panel.pts.forEach((q, i) => {
    if (on[i]) { twin.set(i, i); return; }           // the fold itself is shared
    const [x, y] = reflectPt(q.x, q.y, M);
    panel.pts.push({ x, y, v3: id++, uv: q.uv ? [...q.uv] : undefined });
    twin.set(i, panel.pts.length - 1);
  });
  const mirrored = panel.tris.map((t) => [twin.get(t[0]), twin.get(t[2]), twin.get(t[1])]);
  panel.tris.push(...mirrored);
  refreshPanel(panel);
  record(pattern, { op: 'mirror', panel: panelRef(pattern, panelIndex), mode, line: [M.p, [M.p[0] + M.d[0], M.p[1] + M.d[1]]] });
  return {
    pattern: annotateSeams(pattern),
    mode,
    onFold: on.filter(Boolean).length,
    areaCm2: panel.areaCm2,
  };
}

// -------------------------------------------------------- cutting in two
//
// Splitting a piece along a line is the half of "move a seam line" that the
// mesh makes easy: the cut follows mesh edges, every edge it crosses is split
// on both sides, and the two halves are then two pieces. What makes it a SEAM
// rather than two unrelated pieces is that the points along the cut keep the
// vertex ids they had, and appear in both halves with them -- which is the
// same trick a dart uses, and it means the two halves sew back together with
// nothing told about it.

/** Split every edge the infinite line through a and b crosses. */
function splitAlongLine(panel, a, b) {
  const d = [b[0] - a[0], b[1] - a[1]];
  const L = Math.hypot(d[0], d[1]);
  if (!(L > EPS)) throw new Error('the cut has no length');
  const dir = [d[0] / L, d[1] / L];
  const sd = (q) => (q.x - a[0]) * dir[1] - (q.y - a[1]) * dir[0];
  const cuts = [];
  const span = Math.max(...panel.pts.map((q) => Math.hypot(q.x - a[0], q.y - a[1])), 1);
  const eps = 1e-7 * span;

  for (let guard = 0; guard < 2000; guard++) {
    let did = false;
    for (let ti = 0; ti < panel.tris.length && !did; ti++) {
      const t = panel.tris[ti];
      for (let k = 0; k < 3 && !did; k++) {
        const ia = t[k], ib = t[(k + 1) % 3];
        const sa = sd(panel.pts[ia]), sb = sd(panel.pts[ib]);
        if (Math.abs(sa) < eps || Math.abs(sb) < eps) continue;
        if ((sa > 0) === (sb > 0)) continue;
        const u = sa / (sa - sb);
        cuts.push({ ia, ib, s: u, ni: splitEdgeAt(panel, ia, ib, u) });
        did = true;
      }
    }
    if (!did) break;
  }
  return { sd, eps, cuts };
}

/**
 * A cut that crosses a piece's EDGE has to cross its neighbour's too.
 *
 * Splitting an edge adds a vertex, and a seam is two panels carrying the same
 * vertex ids along a shared run. Add a vertex to one side and not the other
 * and the seam's two sides stop agreeing: the polyline on one side now goes
 * round a corner the other side cuts straight across. Measured on the first
 * version of the cutting tool, driving the real page: `check()` reported
 * "seam S03 differs by 0.26 cm between its sides" -- just past the 0.25 cm
 * the weld allows -- for a cut that never touched that seam except to cross
 * the edge it ends on.
 *
 * So the same split is made in the partner, at the same fraction of the same
 * edge, and the two new points are given the SAME id, which is what makes
 * them one point of the garment.
 */
function propagateSplit(pattern, panelIndex, cut, id) {
  const panel = pattern.panels[panelIndex];
  const va = panel.pts[cut.ia].v3, vb = panel.pts[cut.ib].v3;
  if (va === null || va === undefined || vb === null || vb === undefined) return false;
  let done = false;
  pattern.panels.forEach((q, qi) => {
    if (qi === panelIndex) return;
    const ja = q.pts.findIndex((r) => r.v3 === va);
    const jb = q.pts.findIndex((r) => r.v3 === vb);
    if (ja < 0 || jb < 0) return;
    const shares = q.tris.some((t) => t.includes(ja) && t.includes(jb));
    if (!shares) return;
    const ni = splitEdgeAt(q, ja, jb, cut.s);
    q.pts[ni].v3 = id;
    refreshPanel(q);
    done = true;
  });
  return done;
}

/**
 * Cut a piece in two along a line, making a seam where the cut was.
 *
 * @param from, to  two points in the piece's own coordinates. The line through
 *   them is what cuts; the segment is not clipped, because a cut that stops
 *   half way through a piece leaves it in one piece and is refused below.
 */
export function splitPiece(pattern, panelIndex, { from, to } = {}) {
  const panel = pattern.panels[panelIndex];
  const before = panelArea(panel);
  const { sd, cuts } = splitAlongLine(panel, from, to);

  // the cut's own points get their ids here, and wherever a cut crossed an
  // edge this piece shares with another, the neighbour is cut to match
  let nid = nextFreeId(pattern);
  let propagated = 0;
  for (const c of cuts) {
    const id = nid++;
    panel.pts[c.ni].v3 = id;
    if (propagateSplit(pattern, panelIndex, c, id)) propagated++;
  }

  const side = (t) => {
    const s = (panel.pts[t[0]] && sd(panel.pts[t[0]])) + sd(panel.pts[t[1]]) + sd(panel.pts[t[2]]);
    return s / 3;
  };
  const left = panel.tris.filter((t) => side(t) > 0);
  const right = panel.tris.filter((t) => side(t) <= 0);
  if (!left.length || !right.length) {
    throw new Error('the cut does not divide the piece: it misses it, or runs along an edge');
  }

  // Label anything the cut left unlabelled BEFORE the halves are built. They are
  // what makes the cut a seam: each one is copied into both halves, and two
  // copies of a point are sewn to each other exactly when they carry the same
  // id. Labelling afterwards -- which is what this did first -- gives the two
  // copies DIFFERENT ids, and the halves come apart with no seam between them:
  // measured, 0 shared points and a join that then refused for want of one.
  labelLoose(pattern);

  const base = panel.name || `P${panelIndex + 1}`;
  const halves = [[left, `${base}a`], [right, `${base}b`]].map(([tris, name]) => {
    const map = new Map();
    const pts = [];
    const out = tris.map((t) => t.map((i) => {
      if (!map.has(i)) {
        const q = panel.pts[i];
        map.set(i, pts.length);
        pts.push({ x: q.x, y: q.y, v3: q.v3, uv: q.uv ? [...q.uv] : undefined });
      }
      return map.get(i);
    }));
    const half = { name, pts, tris: out, darts: [] };
    // a dart whose apex ended up in this half travels with it
    for (const d of panel.darts || []) {
      if (d.apex !== undefined && map.has(d.apex)) half.darts.push({ ...d, apex: map.get(d.apex) });
    }
    return refreshPanel(half);
  });

  pattern.panels.splice(panelIndex, 1, ...halves);
  const shared = halves[0].pts.filter((q) => halves[1].pts.some((r) => r.v3 === q.v3)).length;
  record(pattern, { op: 'split', panel: base, from, to });
  const after = halves.reduce((a, h) => a + panelArea(h), 0);
  return {
    pattern: annotateSeams(pattern),
    pieces: pattern.panels.length,
    names: halves.map((h) => h.name),
    sharedPoints: shared,
    neighboursCut: propagated,
    areaKeptCm2: +after.toFixed(2),
    areaLostCm2: +(before - after).toFixed(3),
    cutLengthCm: +(() => {
      // the cut's length, as the run of shared points measures it
      const pts = halves[0].pts.filter((q) => halves[1].pts.some((r) => r.v3 === q.v3));
      if (pts.length < 2) return 0;
      const dir = [to[0] - from[0], to[1] - from[1]];
      const Ld = Math.hypot(dir[0], dir[1]) || 1;
      const rs = pts.map((q) => ((q.x - from[0]) * dir[0] + (q.y - from[1]) * dir[1]) / Ld);
      return Math.max(...rs) - Math.min(...rs);
    })().toFixed(2),
  };
}

// --------------------------------------------------------- joining two
//
// And the other half. Two pieces that share a seam can be made one piece --
// which is what a drafter does when two panels have no reason to be separate,
// and what this project needs because a shell is cut into strips narrower than
// anything anyone would cut in cloth.
//
// This one is NOT free, and the way it is not free is the whole item. The two
// pieces were flattened separately, so their shared edge has two shapes: one
// in each piece's own plane. Laying one onto the other is a best fit and
// leaves a residual, and that residual is the angle defect the join would have
// to absorb. So it is measured per vertex, reported as a distribution with the
// worst place named, and refused past a tolerance -- never quietly stretched.

/** The rigid motion that best lays `src` onto `dst` (Kabsch, in 2D). */
function bestFit(src, dst) {
  const n = src.length;
  const c1 = [src.reduce((a, p) => a + p[0], 0) / n, src.reduce((a, p) => a + p[1], 0) / n];
  const c2 = [dst.reduce((a, p) => a + p[0], 0) / n, dst.reduce((a, p) => a + p[1], 0) / n];
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    const a = [src[i][0] - c1[0], src[i][1] - c1[1]];
    const b = [dst[i][0] - c2[0], dst[i][1] - c2[1]];
    sxy += a[0] * b[1] - a[1] * b[0];
    sxx += a[0] * b[0] + a[1] * b[1];
  }
  const ang = Math.atan2(sxy, sxx);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  return (x, y) => {
    const dx = x - c1[0], dy = y - c1[1];
    return [c2[0] + dx * ca - dy * sa, c2[1] + dx * sa + dy * ca];
  };
}

/**
 * Join two pieces along the seam they share.
 *
 * @param toleranceCm  how far a welded point may land from its partner before
 *   the join is refused. Default 0.5 cm, which is half the weld tolerance the
 *   sewing uses: a join is permanent where a stitch is not.
 */
export function joinPieces(pattern, aIndex, bIndex, { toleranceCm = 0.5, force = false } = {}) {
  if (aIndex === bIndex) throw new Error('a piece cannot be joined to itself');
  const A = pattern.panels[aIndex], B = pattern.panels[bIndex];
  const idxA = new Map(); A.pts.forEach((q, i) => { if (q.v3 !== null && q.v3 !== undefined) idxA.set(q.v3, i); });
  const pairs = [];
  B.pts.forEach((q, i) => { if (idxA.has(q.v3)) pairs.push([idxA.get(q.v3), i]); });
  if (pairs.length < 2) {
    throw new Error(`${A.name || aIndex} and ${B.name || bIndex} share no seam: ${pairs.length} common points`);
  }

  const fit = bestFit(pairs.map(([, j]) => [B.pts[j].x, B.pts[j].y]),
    pairs.map(([i]) => [A.pts[i].x, A.pts[i].y]));
  const moved = B.pts.map((q) => fit(q.x, q.y));
  const residuals = pairs.map(([i, j]) => ({
    v3: B.pts[j].v3,
    cm: Math.hypot(moved[j][0] - A.pts[i].x, moved[j][1] - A.pts[i].y),
  })).sort((x, y) => y.cm - x.cm);
  const worst = residuals[0];
  const mean = residuals.reduce((a, r) => a + r.cm, 0) / residuals.length;
  const over = residuals.filter((r) => r.cm > toleranceCm);
  if (over.length && !force) {
    const e = new Error(`joining ${A.name || aIndex} to ${B.name || bIndex} would pull the seam out of shape: `
      + `${over.length} of ${residuals.length} points past ${toleranceCm} cm, worst ${worst.cm.toFixed(3)} cm `
      + `at vertex ${worst.v3}. The two pieces were flattened separately and their shared edge is not the `
      + 'same curve in both; joining them anyway would stretch the cloth to make up the difference.');
    e.report = { worstCm: +worst.cm.toFixed(3), meanCm: +mean.toFixed(3), over: over.length, of: residuals.length };
    throw e;
  }

  // weld: B's shared points become A's, the rest are appended keeping their ids
  const map = new Map(pairs.map(([i, j]) => [j, i]));
  B.pts.forEach((q, j) => {
    if (map.has(j)) return;
    A.pts.push({ x: moved[j][0], y: moved[j][1], v3: q.v3, uv: q.uv ? [...q.uv] : undefined });
    map.set(j, A.pts.length - 1);
  });
  const want = windingOf(A);
  for (const t of B.tris) {
    const u = t.map((j) => map.get(j));
    const P = A.pts;
    const ar = (P[u[1]].x - P[u[0]].x) * (P[u[2]].y - P[u[0]].y)
      - (P[u[2]].x - P[u[0]].x) * (P[u[1]].y - P[u[0]].y);
    A.tris.push(Math.sign(ar) === want ? u : [u[0], u[2], u[1]]);
  }
  for (const d of B.darts || []) {
    if (d.apex !== undefined && map.has(d.apex)) (A.darts = A.darts || []).push({ ...d, apex: map.get(d.apex) });
  }
  // Recorded under the names the pieces had BEFORE the join, because that is
  // what a replay will find on a pattern this has not happened to yet. Naming
  // the joined piece -- which is what this did first -- records a piece that
  // exists only after the edit it is meant to describe, and the replay skipped
  // it every time.
  const wasA = A.name || `P${aIndex + 1}`, wasB = B.name || `P${bIndex + 1}`;
  A.name = `${wasA}+${wasB}`;
  pattern.panels.splice(bIndex, 1);
  refreshPanel(A);
  record(pattern, { op: 'join', panel: wasA, with: wasB, toleranceCm });
  return {
    pattern: annotateSeams(pattern),
    pieces: pattern.panels.length,
    name: A.name,
    weldedPoints: pairs.length,
    worstCm: +worst.cm.toFixed(3),
    meanCm: +mean.toFixed(3),
    overToleranceOf: `${over.length}/${residuals.length}`,
    areaCm2: A.areaCm2,
  };
}

// ----------------------------------------------------------- truing darts
//
// What a dart does to the edge it crosses, and how to stop it.
//
// A dart is cut as two rays from an apex, and the legs come out as long as the
// cut happened to reach. Sewn shut, the two legs become one line and the edge
// the dart crossed -- a waist, a hem -- is pulled into a step and a corner at
// the dart's mouth, by exactly the amount the legs disagree. The dart report
// has always printed the leg mismatch; what it never said is what that does to
// the EDGE, which is the thing a person sees on the finished garment.
//
// So: `closedDartProfile` folds each dart shut arithmetically and measures the
// step and the turn it leaves, per dart and located; `trueDart` then moves the
// two leg ends until both are zero, by the construction a pattern CAD uses --
// rotate the far side of the edge about the apex by the dart's own angle, draw
// the edge across, and take the legs to where it crosses them.

/** The points of a panel lying on the ray from `apex` at angle `theta`. */
function rayChain(panel, apex, theta, apexIndex) {
  const dir = [Math.cos(theta), Math.sin(theta)];
  return panel.pts
    .map((q, i) => ({ i, q, r: (q.x - apex[0]) * dir[0] + (q.y - apex[1]) * dir[1] }))
    .filter(({ i, q, r }) => {
      if (i === apexIndex || r <= EPS) return false;
      const d = [q.x - apex[0], q.y - apex[1]];
      return Math.abs(cross2(d, dir)) < 1e-6 * Math.max(1, r);
    })
    .sort((a, b) => a.r - b.r);
}

/** The outline neighbour of `i` that is not itself on the leg. */
function outlineNeighbourOff(panel, i, onLeg) {
  const loop = panel.loop && panel.loop.length ? panel.loop : outlineOf(panel);
  const k = loop.indexOf(i);
  if (k < 0) return -1;
  for (const j of [loop[(k + 1) % loop.length], loop[(k - 1 + loop.length) % loop.length]]) {
    if (!onLeg.has(j)) return j;
  }
  return -1;
}

const rotAbout = (p, c, a) => {
  const ca = Math.cos(a), sa = Math.sin(a);
  const dx = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + dx * ca - dy * sa, c[1] + dx * sa + dy * ca];
};

/** The geometry of one dart, as it will be once it is sewn shut. */
function dartGeometry(panel, dart) {
  const apexIndex = dart.apex;
  const A0 = panel.pts[apexIndex];
  if (!A0) return null;
  const A = [A0.x, A0.y];
  const half = (dart.intakeDeg * Math.PI / 180) / 2;
  const a1 = dart.bisectDeg * Math.PI / 180 - half;
  const a2 = dart.bisectDeg * Math.PI / 180 + half;
  const leg1 = rayChain(panel, A, a1, apexIndex);
  const leg2 = rayChain(panel, A, a2, apexIndex);
  if (!leg1.length || !leg2.length) return null;
  const onLeg = new Set([apexIndex, ...leg1.map((n) => n.i), ...leg2.map((n) => n.i)]);
  const end1 = leg1[leg1.length - 1], end2 = leg2[leg2.length - 1];
  const b1 = outlineNeighbourOff(panel, end1.i, onLeg);
  const b2 = outlineNeighbourOff(panel, end2.i, onLeg);
  return { A, apexIndex, a1, a2, half, leg1, leg2, end1, end2, b1, b2 };
}

/**
 * Fold every dart shut and report what it does to the edge it crosses.
 *
 * Per dart, located by piece and apex:
 *   stepCm   how far the two leg ends miss each other once folded -- the step
 *            left in the waist or the hem
 *   turnDeg  how far the edge turns at the dart's mouth, 0 being straight
 *
 * A distribution and a place, not a worst number (rule 2).
 */
export function closedDartProfile(pattern) {
  const darts = [];
  pattern.panels.forEach((panel, pi) => {
    (panel.darts || []).forEach((d, k) => {
      const g = dartGeometry(panel, d);
      if (!g) { darts.push({ panel: panel.name || pi, dart: k, readable: false }); return; }
      const fold = -(g.a2 - g.a1);                 // brings leg 2 onto leg 1
      const e2 = rotAbout([panel.pts[g.end2.i].x, panel.pts[g.end2.i].y], g.A, fold);
      const e1 = [panel.pts[g.end1.i].x, panel.pts[g.end1.i].y];
      const step = Math.hypot(e2[0] - e1[0], e2[1] - e1[1]);
      let turn = null;
      if (g.b1 >= 0 && g.b2 >= 0) {
        const P = [panel.pts[g.b1].x, panel.pts[g.b1].y];
        const Q = rotAbout([panel.pts[g.b2].x, panel.pts[g.b2].y], g.A, fold);
        const u = [e1[0] - P[0], e1[1] - P[1]];
        const v = [Q[0] - e2[0], Q[1] - e2[1]];
        const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
        if (lu > EPS && lv > EPS) {
          const c = Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)));
          turn = Math.acos(c) * 180 / Math.PI;
        }
      }
      darts.push({
        panel: panel.name || pi,
        dart: k,
        intakeDeg: +d.intakeDeg.toFixed(2),
        legCm: [+g.end1.r.toFixed(3), +g.end2.r.toFixed(3)],
        stepCm: +step.toFixed(3),
        turnDeg: turn === null ? null : +turn.toFixed(3),
        readable: true,
      });
    });
  });
  const steps = darts.filter((d) => d.readable).map((d) => d.stepCm);
  const turns = darts.filter((d) => d.turnDeg !== null && d.turnDeg !== undefined).map((d) => d.turnDeg);
  const stat = (xs) => (xs.length ? {
    worst: +Math.max(...xs).toFixed(3),
    mean: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3),
  } : { worst: 0, mean: 0 });
  return { darts, step: stat(steps), turn: stat(turns), count: darts.length };
}

/**
 * True one dart: move its leg ends so the edge it crosses comes out straight.
 *
 * The construction is the one a pattern CAD uses. Rotate the far side of the
 * edge about the apex by the dart's own angle, so it lands where it will be
 * once the dart is closed; draw the edge from the near side to it; and take
 * the leg to where that line crosses it. Rotating back by the same angle puts
 * the other leg at the same length by construction -- which is why truing a
 * dart also makes its legs equal, and why the step and the turn go together.
 *
 * The leg's interior points are rescaled along the ray with the end, so the
 * two legs keep the matching fractions `harmoniseLegs` gave them. Without
 * that, truing would fix the edge and quietly break the pairing.
 */
export function trueDart(pattern, panelIndex, dartIndex = 0) {
  const panel = pattern.panels[panelIndex];
  const d = (panel.darts || [])[dartIndex];
  if (!d) throw new Error(`piece ${panel.name || panelIndex} has no dart ${dartIndex}`);
  const g = dartGeometry(panel, d);
  if (!g) throw new Error('this dart cannot be read back off the mesh: its legs are not where it says');
  if (g.b1 < 0 || g.b2 < 0) throw new Error('the dart mouth has no edge either side of it to true against');

  const fold = -(g.a2 - g.a1);
  const P = [panel.pts[g.b1].x, panel.pts[g.b1].y];
  const Q = rotAbout([panel.pts[g.b2].x, panel.pts[g.b2].y], g.A, fold);
  // where the closed edge P->Q crosses the first leg
  const dir1 = [Math.cos(g.a1), Math.sin(g.a1)];
  const e = [Q[0] - P[0], Q[1] - P[1]];
  const den = cross2(dir1, [-e[0], -e[1]]);
  const num = cross2([P[0] - g.A[0], P[1] - g.A[1]], [-e[0], -e[1]]);
  if (Math.abs(den) < 1e-12) throw new Error('the closed edge runs along the dart leg: nothing to intersect');
  const r = num / den;
  if (!(r > EPS)) throw new Error('the closed edge crosses the leg behind the apex: check the dart');

  const before = { legCm: [g.end1.r, g.end2.r] };
  const scale = [r / g.end1.r, r / g.end2.r];
  [g.leg1, g.leg2].forEach((leg, k) => {
    const dir = k === 0 ? dir1 : [Math.cos(g.a2), Math.sin(g.a2)];
    for (const n of leg) {
      const rr = n.r * scale[k];
      panel.pts[n.i].x = g.A[0] + dir[0] * rr;
      panel.pts[n.i].y = g.A[1] + dir[1] * rr;
    }
  });
  d.legCm = [+r.toFixed(3), +r.toFixed(3)];
  refreshPanel(panel);
  record(pattern, { op: 'true', panel: panelRef(pattern, panelIndex), dart: dartIndex });
  const after = closedDartProfile(pattern).darts.find((x) => x.dart === dartIndex
    && x.panel === (panel.name || panelIndex));
  return {
    pattern: annotateSeams(pattern),
    legBeforeCm: before.legCm.map((v) => +v.toFixed(3)),
    legAfterCm: [+r.toFixed(3), +r.toFixed(3)],
    movedCm: +Math.max(Math.abs(r - before.legCm[0]), Math.abs(r - before.legCm[1])).toFixed(3),
    stepCm: after ? after.stepCm : null,
    turnDeg: after ? after.turnDeg : null,
  };
}

/** True every dart in the pattern, and say what it cost. */
export function trueDarts(pattern) {
  const before = closedDartProfile(pattern);
  const failed = [];
  pattern.panels.forEach((panel, pi) => {
    (panel.darts || []).forEach((d, k) => {
      try { trueDart(pattern, pi, k); } catch (err) { failed.push(`${panel.name || pi}/${k}: ${err.message}`); }
    });
  });
  const after = closedDartProfile(pattern);
  return {
    pattern: annotateSeams(pattern),
    darts: before.count,
    trued: before.count - failed.length,
    failed,
    stepBeforeCm: before.step, stepAfterCm: after.step,
    turnBeforeDeg: before.turn, turnAfterDeg: after.turn,
  };
}

// ------------------------------------------- what a piece is made up as
//
// The properties that are not the shape: how much allowance each edge takes
// when it is cut, and which way the grain runs. They live on the pattern and
// on the piece rather than in the printer, because they are decisions about
// the garment -- a hem turned up twice wants more cloth than the seam beside
// it, and a piece squared to a stripe is not a piece turned to nest well.

/**
 * Set the seam allowance, by edge kind, for the pattern or for one piece.
 *
 * @param seam, top, bottom  cm, each optional
 * @param panelIndex  one piece, or null for the whole pattern
 */
export function setAllowance(pattern, { seam, top, bottom, panelIndex = null } = {}) {
  const give = {};
  if (seam !== undefined) give.seam = seam;
  if (top !== undefined) give.top = top;
  if (bottom !== undefined) give.bottom = bottom;
  if (panelIndex === null || panelIndex === undefined) {
    pattern.allowance = { ...(pattern.allowance || {}), ...give };
  } else {
    const panel = pattern.panels[panelIndex];
    panel.allowanceCm = { ...(panel.allowanceCm || {}), ...give };
  }
  record(pattern, { op: 'allowance', panel: panelIndex === null || panelIndex === undefined
    ? null : panelRef(pattern, panelIndex), ...give });
  return {
    pattern,
    allowance: panelIndex === null || panelIndex === undefined
      ? pattern.allowance : pattern.panels[panelIndex].allowanceCm,
  };
}

/** Which way the grain runs on a piece, in degrees anticlockwise from +x. */
export function setGrain(pattern, panelIndex, degrees) {
  pattern.panels[panelIndex].grainDeg = degrees;
  record(pattern, { op: 'grain', panel: panelRef(pattern, panelIndex), degrees });
  return { pattern, grainDeg: degrees };
}

// ------------------------------------------------------- the edit list
//
// The pattern keeps what was done to it, not just what it now looks like. Undo
// keeps whole copies of the pattern and can say nothing about WHAT changed;
// this list can, and -- the point of it -- can be applied to a piece unfolded
// for a different body, which is the fit test this project exists to make
// possible.

/** The edits, as rows a person can read. */
export function editList(pattern) {
  return (pattern.edits || []).map((e, i) => {
    const where = (s) => (Array.isArray(s) ? `(${s[0].toFixed(1)}, ${s[1].toFixed(1)})`
      : (s && s.run !== undefined
        ? `${Math.round((s.t === undefined ? 0.5 : s.t) * 100)}% along ${s.run}`
          + (s.offsetCm ? `, ${s.offsetCm} cm in` : '')
        : ''));
    const what = {
      dart: () => `${e.intakeDeg} deg dart at ${where(e.on || e.at)}, pointing ${e.bisectDeg} deg`,
      spread: () => `${e.spreadDeg} deg spread at ${where(e.on || e.at)}, cut towards ${e.towardsDeg} deg`,
      move: () => `moved by (${e.dx}, ${e.dy}) cm`,
      turn: () => `turned ${e.degrees} deg`,
      mirror: () => `mirrored (${e.mode})`,
      split: () => 'cut in two',
      join: () => `joined to ${e.with}`,
      true: () => `trued dart ${e.dart}`,
      allowance: () => 'allowance ' + ['seam', 'top', 'bottom']
        .filter((k) => e[k] !== undefined).map((k) => `${k} ${e[k]} cm`).join(', '),
      grain: () => `grain at ${e.degrees} deg`,
    }[e.op];
    return { n: i + 1, op: e.op, piece: String(e.panel), what: what ? what() : e.op };
  });
}

/**
 * Apply a list of edits to a pattern -- the same one, or another one.
 *
 * Each edit names its piece and, where it has one, the construction its apex
 * was taken from. An edit whose piece is missing, or whose apex cannot be
 * found on it, is SKIPPED and reported: a replay that silently drops a dart
 * would be worse than one that fails, because the garment would come out
 * fitting and nobody would know which dart was missing.
 */
export function replayEdits(pattern, edits, { stopOnError = false } = {}) {
  const applied = [], skipped = [];
  for (const e of edits || []) {
    if (e.op === 'allowance' && (e.panel === null || e.panel === undefined)) {
      setAllowance(pattern, e);
      applied.push(e.op);
      if (pattern.edits && pattern.edits.length) pattern.edits.pop();
      continue;
    }
    const pi = resolvePanel(pattern, e.panel);
    if (pi < 0) { skipped.push(`${e.op}: no piece ${e.panel}`); if (stopOnError) break; continue; }
    try {
      // the construction if the edit has one, the coordinate if it does not
      const at = e.on || e.at;
      if (e.op === 'dart') takeOutWedge(pattern, pi, { apex: at, bisectDeg: e.bisectDeg, intakeDeg: e.intakeDeg });
      else if (e.op === 'spread') letInWedge(pattern, pi, { apex: at, towardsDeg: e.towardsDeg, spreadDeg: e.spreadDeg });
      else if (e.op === 'move') movePiece(pattern, pi, e);
      else if (e.op === 'turn') turnPiece(pattern, pi, e);
      else if (e.op === 'mirror') mirrorPiece(pattern, pi, { line: e.line, mode: e.mode });
      else if (e.op === 'split') splitPiece(pattern, pi, e);
      else if (e.op === 'true') trueDart(pattern, pi, e.dart);
      else if (e.op === 'grain') setGrain(pattern, pi, e.degrees);
      else if (e.op === 'allowance') setAllowance(pattern, { ...e, panelIndex: pi });
      else if (e.op === 'join') {
        const bi = resolvePanel(pattern, e.with);
        if (bi < 0) throw new Error(`no piece ${e.with} to join to`);
        joinPieces(pattern, pi, bi, { toleranceCm: e.toleranceCm });
      } else throw new Error(`no such edit ${e.op}`);
      applied.push(e.op);
      // the replay records its own edits as it goes; drop the duplicate
      if (pattern.edits && pattern.edits.length) pattern.edits.pop();
    } catch (err) {
      skipped.push(`${e.op} on ${e.panel}: ${err.message}`);
      if (stopOnError) break;
    }
  }
  pattern.edits = (edits || []).slice(0, applied.length);
  return { pattern: annotateSeams(pattern), applied: applied.length, skipped };
}

// ------------------------------------------------ what is not built yet
//
// The tools a pattern CAD has and this editor does not, named HERE rather than
// in the viewer, for two reasons. The headless path then refuses them in the
// same words the dialog box uses, instead of the two drifting apart (rule 7);
// and a tool cannot appear in the menu without appearing in this list, which
// is the thing that keeps the menu honest about what it does.
//
// The list is empty today. It was nine entries long for about an hour.
//
// The inventory these came out of is docs/03-prior-art.md section 12,
// docs/14-editing.md section 6 says which of them the mesh and the vertex ids
// allow, and todos/19-todo.md is the queue.

/** The tools that do something. Everything else is in PLANNED. */
export const IMPLEMENTED = ['select', 'dart', 'spread', 'turn', 'move', 'mirror', 'split', 'join'];

export const PLANNED = [
  // Empty, and kept rather than deleted: everything that was listed here on
  // 2026-10-17 -- turn, move, mirror, join, cut, true the darts, the edit
  // list, replay and the made-up properties -- is built, and the next tool
  // that is wanted goes in here first so the menu can offer it before it
  // works. The machinery is five lines; the discipline is the point.
];

const byId = new Map(PLANNED.map((t) => [t.id, t]));

export const isPlanned = (id) => byId.has(id);

/** The label a menu shows for a tool, planned or not. */
export const toolLabel = (id) => (byId.has(id) ? byId.get(id).label : id);

/**
 * What to say when someone presses a tool that is not built.
 *
 * It says what the tool will do and what it is waiting on, because "not
 * implemented" on its own tells the person nothing about whether to wait for
 * it or work round it.
 */
export function plannedMessage(id) {
  const t = byId.get(id);
  if (!t) return `${id}: no such tool.`;
  return `${t.label.toUpperCase()} -- not built yet.\n\n`
    + `${t.what}\n\n${t.waiting}\n\n`
    + 'Queued in todos/19-todo.md. The inventory it came from is '
    + 'docs/03-prior-art.md section 12; docs/14-editing.md section 6 says what '
    + 'the mesh and the vertex ids allow.';
}
