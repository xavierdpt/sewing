// Turning a tiled shell into a sewing pattern.
//
// This is the step that makes the whole method useful: the triangulation was
// the measuring instrument, and what you actually cut is a handful of large
// panels with darts. See docs/01-geometry.md section 8.
//
//   1. coarsen()   merge near-coplanar tiles into panels
//   2. cutPaths()  slit each panel from its boundary to every interior vertex
//                  that carries angle defect -- those slits become the darts
//   3. flatten()   unfold the panel by walking a spanning tree of its triangles
//   4. nest()      shelf-pack the panels onto fabric
//
// Step 3 is EXACT. Every triangle is already flat, so its 2D copy is congruent
// to its 3D copy to machine precision -- there is no conformal/area trade-off
// of the kind that LSCM or ABF has to make, because there is no smooth doubly
// curved panel to approximate. All of the approximation was spent earlier, on
// faceting. That is the one place this method beats every alternative on theory
// rather than convenience.

import { sub, add, mul, dot, cross, norm, len, dist, DEG, clamp } from './geom.js';
// SUPERSEDED PREMISE (2026-11-26): the standard-triangle library is the project's
// initial idea, which the project has deviated from. An issue here is probably old
// code that no longer contributes -- but confirm that with the user before acting
// on it. See CLAUDE.md rule 10 and `app/js/tiles.js`.
import { byId } from './tiles.js';

const ekey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

// --------------------------------------------------------------- 1. coarsen

/** Outward unit normal of tile t. */
function tileNormal(asm, t, surface = null) {
  const P = asm.tiles[t].v.map((i) => asm.verts[i]);
  let n = norm(cross(sub(P[1], P[0]), sub(P[2], P[0])));
  const c = mul(add(add(P[0], P[1]), P[2]), 1 / 3);
  const ref = surface ? surface.closestPoint(c).normal : [c[0], 0, c[2]];
  if (dot(n, ref) < 0) n = mul(n, -1);
  return n;
}

/** Tiles sharing an edge with tile t. */
function buildDualAdjacency(asm) {
  const adj = asm.tiles.map(() => []);
  for (const e of asm.edges.values()) {
    if (e.tiles.length !== 2) continue;
    const [a, b] = e.tiles;
    adj[a].push({ tile: b, edge: e });
    adj[b].push({ tile: a, edge: e });
  }
  return adj;
}

/**
 * Greedy region growing: merge tiles into panels while the running average
 * normal stays within `normalTol` degrees.
 *
 * `maxPanels` re-runs with a looser tolerance until the count comes down, so
 * you can ask for "about eight panels" rather than guessing an angle.
 */
export function coarsen(asm, { normalTol = 22, maxPanels = null, surface = null } = {}) {
  const run = (tolDeg) => {
    const cosTol = Math.cos(tolDeg * Math.PI / 180);
    const adj = buildDualAdjacency(asm);
    const N = asm.tiles.map((_, t) => tileNormal(asm, t, surface));
    const label = new Array(asm.tiles.length).fill(-1);
    const panels = [];
    for (let seed = 0; seed < asm.tiles.length; seed++) {
      if (label[seed] >= 0) continue;
      const id = panels.length;
      const tiles = [seed];
      label[seed] = id;
      let acc = [...N[seed]];
      const queue = [seed];
      while (queue.length) {
        const t = queue.shift();
        for (const { tile: u } of adj[t]) {
          if (label[u] >= 0) continue;
          const avg = norm(acc);
          if (dot(N[u], avg) < cosTol || dot(N[u], N[seed]) < Math.cos(2 * tolDeg * Math.PI / 180)) continue;
          label[u] = id;
          tiles.push(u);
          acc = add(acc, N[u]);
          queue.push(u);
        }
      }
      panels.push({ id, tiles, normal: norm(acc) });
    }
    return { panels, label };
  };

  let tol = normalTol;
  let r = run(tol);
  if (maxPanels) {
    while (r.panels.length > maxPanels && tol < 80) {
      tol += 4;
      r = run(tol);
    }
  }
  r.normalTol = tol;
  return r;
}

/**
 * Cut the shell into vertical strips -- gores.
 *
 * This matters more than it looks. A panel can only be flattened without
 * self-overlap if the total angle defect it ENCLOSES is near zero, and a body
 * is not developable, so a large blobby panel is unflattenable no matter how
 * many darts you cut: its curvature is spread over dozens of vertices, each
 * individually too small to justify a dart, collectively fatal.
 *
 * A strip one grid cell wide has NO interior vertices at all -- every vertex
 * sits on its left or right edge -- so it flattens exactly, with zero darts and
 * zero overlap. That is precisely what a gore is, and why gored skirts and
 * princess-seam bodices are built the way they are. Widening the strip trades
 * seams for darts, continuously.
 *
 * Requires a shell from buildGridShell(), which tags each tile with its cell.
 */
export function coarsenStrips(asm, { stripWidth = 1, wrap = true } = {}) {
  const cols = asm.meta ? asm.meta.cols : null;
  if (!asm.tiles.length || asm.tiles[0].cell === undefined) {
    throw new Error('coarsenStrips needs a grid shell (tiles carry no cell tag)');
  }
  const groups = new Map();
  const label = new Array(asm.tiles.length).fill(-1);
  asm.tiles.forEach((tl, t) => {
    const g = Math.floor(tl.cell.i / stripWidth);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
    label[t] = g;
  });
  const keys = [...groups.keys()].sort((a, b) => a - b);
  const panels = keys.map((k, idx) => {
    groups.get(k).forEach((t) => { label[t] = idx; });
    return { id: idx, tiles: groups.get(k), normal: null, stripIndex: k };
  });
  return { panels, label, normalTol: null, stripWidth };
}

// ----------------------------------------------------- 2. panel topology

/** Edges of the panel, classified. */
function panelEdges(asm, tiles) {
  const inPanel = new Set(tiles);
  const use = new Map();                 // ekey -> { e, tiles:[...] }
  for (const t of tiles) {
    const v = asm.tiles[t].v;
    for (const [a, b] of [[v[1], v[2]], [v[2], v[0]], [v[0], v[1]]]) {
      const k = ekey(a, b);
      if (!use.has(k)) use.set(k, { a: Math.min(a, b), b: Math.max(a, b), tiles: [] });
      use.get(k).tiles.push(t);
    }
  }
  const boundary = [], interior = [];
  for (const [k, u] of use) (u.tiles.length === 1 ? boundary : interior).push({ k, ...u });
  return { use, boundary, interior, inPanel };
}

/**
 * Angle defect of each vertex that is interior to this panel, in degrees.
 * This is the angle the panel cannot hold flat -- i.e. the dart intake.
 */
function panelDefects(asm, tiles) {
  const { boundary } = panelEdges(asm, tiles);
  const onBoundary = new Set();
  for (const e of boundary) { onBoundary.add(e.a); onBoundary.add(e.b); }
  const sums = new Map();
  for (const t of tiles) {
    const tl = asm.tiles[t];
    const tile = byId[tl.tileId];
    const P = tl.v.map((i) => asm.verts[i]);
    // use the ACTUAL geometry, not the nominal library angles, so the dart
    // intake matches the shell that was measured
    const L = [dist(P[1], P[2]), dist(P[2], P[0]), dist(P[0], P[1])];
    for (let i = 0; i < 3; i++) {
      const a = L[i], b = L[(i + 1) % 3], c = L[(i + 2) % 3];
      const ang = Math.acos(clamp((b * b + c * c - a * a) / (2 * b * c), -1, 1));
      sums.set(tl.v[i], (sums.get(tl.v[i]) || 0) + ang);
    }
  }
  const out = [];
  for (const [vi, s] of sums) {
    if (onBoundary.has(vi)) continue;
    out.push({ v: vi, defectDeg: (2 * Math.PI - s) * DEG });
  }
  return out;
}

/**
 * Shortest edge path from each defect-carrying interior vertex out to the panel
 * boundary. These edges get slit, and the slit opens into a dart when the panel
 * is unfolded -- apex at the interior vertex, widening to the panel edge, which
 * is exactly how a bust dart is shaped.
 */
export function cutPaths(asm, tiles, { minDefectDeg = 2.5 } = {}) {
  const { boundary, use } = panelEdges(asm, tiles);
  const onBoundary = new Set();
  for (const e of boundary) { onBoundary.add(e.a); onBoundary.add(e.b); }

  const nbr = new Map();
  for (const [, u] of use) {
    if (!nbr.has(u.a)) nbr.set(u.a, []);
    if (!nbr.has(u.b)) nbr.set(u.b, []);
    nbr.get(u.a).push(u.b);
    nbr.get(u.b).push(u.a);
  }

  const cuts = new Set();
  const darts = [];
  for (const d of panelDefects(asm, tiles)) {
    if (Math.abs(d.defectDeg) < minDefectDeg) continue;
    // BFS to the nearest boundary vertex
    const prev = new Map([[d.v, null]]);
    const q = [d.v];
    let hit = null;
    while (q.length && hit === null) {
      const cur = q.shift();
      for (const n of (nbr.get(cur) || [])) {
        if (prev.has(n)) continue;
        prev.set(n, cur);
        if (onBoundary.has(n)) { hit = n; break; }
        q.push(n);
      }
    }
    if (hit === null) continue;
    const path = [];
    for (let cur = hit; cur !== null && prev.get(cur) !== undefined; cur = prev.get(cur)) {
      path.push(cur);
      if (cur === d.v) break;
    }
    for (let i = 0; i + 1 < path.length; i++) cuts.add(ekey(path[i], path[i + 1]));
    darts.push({ apex: d.v, toBoundary: hit, intakeDeg: d.defectDeg, path });
  }
  return { cuts, darts };
}

// ---------------------------------------------------------- 3. flatten

function place2D(s0, s1, s2) {
  // s_i is the side opposite vertex i
  const x = (s2 * s2 + s1 * s1 - s0 * s0) / (2 * s2);
  const y = Math.sqrt(Math.max(0, s1 * s1 - x * x));
  return [[0, 0], [s2, 0], [x, y]];
}

let POINT_ID = 0;
const mkPt = (x, y) => ({ x, y, id: POINT_ID++ });

/**
 * Unfold a panel. Exact per triangle: every 2D triangle is congruent to its 3D
 * original. Returns 2D corner points, the outline loops (darts show up as
 * notches), and diagnostics.
 */
export function flatten(asm, tiles, { cuts = new Set() } = {}) {
  const adj = buildDualAdjacency(asm);
  const inPanel = new Set(tiles);
  const corner = new Map();              // tileIndex -> Map(vertexIndex -> point)

  // spanning tree over the panel's triangles, preferring not to cross a cut
  const order = [];
  const seen = new Set();
  const seed = tiles[0];
  const start = (t0, allowCuts) => {
    const q = [t0];
    seen.add(t0);
    while (q.length) {
      const t = q.shift();
      order.push(t);
      for (const { tile: u, edge } of adj[t]) {
        if (!inPanel.has(u) || seen.has(u)) continue;
        if (!allowCuts && cuts.has(ekey(edge.a, edge.b))) continue;
        seen.add(u);
        corner.set(u, { parent: t, edge });
        q.push(u);
      }
    }
  };
  start(seed, false);
  // anything a cut isolated gets reattached by allowing one cut crossing
  let guard = 0;
  while (seen.size < tiles.length && guard++ < tiles.length) {
    const next = tiles.find((t) => !seen.has(t));
    if (next === undefined) break;
    const link = adj[next].find(({ tile: u }) => seen.has(u) && inPanel.has(u));
    if (link) {
      seen.add(next);
      corner.set(next, { parent: link.tile, edge: link.edge });
      cuts.delete(ekey(link.edge.a, link.edge.b));
      order.push(next);
      start(next, false);
    } else {
      seen.add(next);
      order.push(next);               // detached island, placed on its own
    }
  }

  const pts = new Map();                 // tileIndex -> { vertexIndex: point }
  const meta = new Map(order.map((t) => [t, corner.get(t)]));

  const sides3d = (t) => {
    const P = asm.tiles[t].v.map((i) => asm.verts[i]);
    return [dist(P[1], P[2]), dist(P[2], P[0]), dist(P[0], P[1])];
  };

  for (const t of order) {
    const v = asm.tiles[t].v;
    const S = sides3d(t);
    const link = meta.get(t);
    if (!link || !pts.has(link.parent)) {
      const p = place2D(S[0], S[1], S[2]);
      pts.set(t, { [v[0]]: mkPt(p[0][0], p[0][1]), [v[1]]: mkPt(p[1][0], p[1][1]), [v[2]]: mkPt(p[2][0], p[2][1]) });
      continue;
    }
    const pp = pts.get(link.parent);
    const a = link.edge.a, b = link.edge.b;
    const A = pp[a], B = pp[b];
    const c = v.find((x) => x !== a && x !== b);
    const P3 = asm.verts;
    const rA = dist(P3[c], P3[a]), rB = dist(P3[c], P3[b]);
    const dx = B.x - A.x, dy = B.y - A.y;
    const d = Math.hypot(dx, dy) || 1e-9;
    const ex = dx / d, ey = dy / d;
    const tt = (rA * rA - rB * rB + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, rA * rA - tt * tt));
    const fx = A.x + ex * tt, fy = A.y + ey * tt;
    const nx = -ey, ny = ex;
    // the parent's own third corner tells us which side is already occupied
    const pc = asm.tiles[link.parent].v.find((x) => x !== a && x !== b);
    const PC = pp[pc];
    const sideParent = Math.sign((PC.x - A.x) * ey - (PC.y - A.y) * ex) || 1;
    const cand1 = [fx + nx * h, fy + ny * h];
    const s1 = Math.sign((cand1[0] - A.x) * ey - (cand1[1] - A.y) * ex) || 1;
    const chosen = (s1 === sideParent) ? [fx - nx * h, fy - ny * h] : cand1;
    // SHARE the parent's point objects: that is what makes a non-cut seam weld
    pts.set(t, { [a]: A, [b]: B, [c]: mkPt(chosen[0], chosen[1]) });
  }

  // ---- outline: every edge of the panel that is NOT a shared tree edge
  const treeEdges = new Set();
  for (const t of order) {
    const link = meta.get(t);
    if (link && pts.has(link.parent)) treeEdges.add(ekey(link.edge.a, link.edge.b));
  }
  const segs = [];
  for (const t of order) {
    const v = asm.tiles[t].v;
    const P = pts.get(t);
    // order this triangle's corners counter-clockwise from its own 2D coords,
    // so we never depend on how the tile happened to be wound in 3D
    const area = (P[v[1]].x - P[v[0]].x) * (P[v[2]].y - P[v[0]].y)
               - (P[v[2]].x - P[v[0]].x) * (P[v[1]].y - P[v[0]].y);
    const o = area >= 0 ? [v[0], v[1], v[2]] : [v[0], v[2], v[1]];
    for (let i = 0; i < 3; i++) {
      const a = o[i], b = o[(i + 1) % 3];
      const k = ekey(a, b);
      const shared = treeEdges.has(k) && (() => {
        // only a tree edge BETWEEN THESE TWO tiles welds
        const other = adj[t].find(({ edge }) => ekey(edge.a, edge.b) === k);
        if (!other || !inPanel.has(other.tile)) return false;
        const lt = meta.get(t), lo = meta.get(other.tile);
        return (lt && lt.parent === other.tile) || (lo && lo.parent === t);
      })();
      if (!shared) segs.push({ from: P[a], to: P[b], va: a, vb: b, tile: t });
    }
  }

  // chain segments into closed loops
  const outgoing = new Map();
  for (const s of segs) {
    if (!outgoing.has(s.from.id)) outgoing.set(s.from.id, []);
    outgoing.get(s.from.id).push(s);
  }
  const used = new Set();
  const loops = [];
  for (const s0 of segs) {
    if (used.has(s0)) continue;
    const loop = [];
    let cur = s0, guard2 = 0;
    while (cur && !used.has(cur) && guard2++ < segs.length + 5) {
      used.add(cur);
      loop.push(cur);
      const cands = outgoing.get(cur.to.id) || [];
      cur = cands.find((x) => !used.has(x));
    }
    if (loop.length >= 3) loops.push(loop);
  }
  loops.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));

  // diagnostics: the unfold should be isometric to float precision
  let maxEdgeErr = 0;
  for (const t of order) {
    const v = asm.tiles[t].v, P = pts.get(t), S = sides3d(t);
    const L2 = [
      Math.hypot(P[v[1]].x - P[v[2]].x, P[v[1]].y - P[v[2]].y),
      Math.hypot(P[v[2]].x - P[v[0]].x, P[v[2]].y - P[v[0]].y),
      Math.hypot(P[v[0]].x - P[v[1]].x, P[v[0]].y - P[v[1]].y),
    ];
    for (let i = 0; i < 3; i++) maxEdgeErr = Math.max(maxEdgeErr, Math.abs(L2[i] - S[i]));
  }

  return { tiles: order, pts, loops, segs, maxEdgeErr, overlaps: countOverlaps(asm, order, pts) };
}

function signedArea(loop) {
  let a = 0;
  for (const s of loop) a += s.from.x * s.to.y - s.to.x * s.from.y;
  return a / 2;
}

function triOverlap(A, B) {
  for (const T of [A, B]) {
    for (let i = 0; i < 3; i++) {
      const p = T[i], q = T[(i + 1) % 3];
      const nx = -(q.y - p.y), ny = q.x - p.x;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const v of A) { const d = v.x * nx + v.y * ny; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
      for (const v of B) { const d = v.x * nx + v.y * ny; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
      if (aMax <= bMin + 1e-7 || bMax <= aMin + 1e-7) return false;
    }
  }
  return true;
}

function countOverlaps(asm, order, pts) {
  const tri = order.map((t) => asm.tiles[t].v.map((i) => pts.get(t)[i]));
  const box = tri.map((T) => [
    Math.min(...T.map((p) => p.x)), Math.min(...T.map((p) => p.y)),
    Math.max(...T.map((p) => p.x)), Math.max(...T.map((p) => p.y)),
  ]);
  let n = 0;
  for (let i = 0; i < tri.length; i++) {
    for (let j = i + 1; j < tri.length; j++) {
      if (box[i][2] < box[j][0] || box[j][2] < box[i][0]
       || box[i][3] < box[j][1] || box[j][3] < box[i][1]) continue;
      const shared = tri[i].filter((p) => tri[j].includes(p)).length;
      if (shared >= 2) continue;                 // adjacent, legitimately touching
      if (triOverlap(tri[i], tri[j])) n++;
    }
  }
  return n;
}

/**
 * Rotate an unfolded panel so its long axis is vertical and its top is up.
 *
 * The unfold starts from an arbitrary seed triangle, so panels come out at
 * random angles. That is not cosmetic: the grainline has to run along the
 * panel's length, and slanted panels nest terribly.
 *
 * Principal axis by PCA, then flipped using the 3D height of the vertices so
 * that up on the pattern is up on the body.
 */
export function alignPanel(asm, flat) {
  const seen = new Set();
  const items = [];
  for (const t of flat.tiles) {
    const pts = flat.pts.get(t);
    for (const vi of Object.keys(pts)) {
      const pt = pts[vi];
      if (seen.has(pt.id)) continue;
      seen.add(pt.id);
      items.push({ pt, y3: asm.verts[vi][1] });
    }
  }
  if (items.length < 3) return;
  const n = items.length;
  let mx = 0, my = 0;
  for (const it of items) { mx += it.pt.x; my += it.pt.y; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const it of items) {
    const dx = it.pt.x - mx, dy = it.pt.y - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  // principal eigenvector of [[sxx,sxy],[sxy,syy]]
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  // rotate so that axis points along +y
  const rot = Math.PI / 2 - theta;
  const c = Math.cos(rot), si = Math.sin(rot);
  for (const it of items) {
    const dx = it.pt.x - mx, dy = it.pt.y - my;
    it.pt.x = dx * c - dy * si;
    it.pt.y = dx * si + dy * c;
  }
  // flip vertically if the pattern's up disagrees with the body's up
  let cov = 0;
  const my3 = items.reduce((a, it) => a + it.y3, 0) / n;
  const my2 = items.reduce((a, it) => a + it.pt.y, 0) / n;
  for (const it of items) cov += (it.pt.y - my2) * (it.y3 - my3);
  if (cov < 0) for (const it of items) { it.pt.y = -it.pt.y; it.pt.x = -it.pt.x; }
}

// ------------------------------------------------------------- 4. assemble

/** Build every panel of a shell, flattened and ready to lay out. */
export function makePattern(asm, { mode = 'strips', stripWidth = 1,
  normalTol = 22, maxPanels = null, surface = null, minDefectDeg = 2.5 } = {}) {
  const { panels, label, normalTol: usedTol } = mode === 'strips'
    ? coarsenStrips(asm, { stripWidth })
    : coarsen(asm, { normalTol, maxPanels, surface });
  const out = [];
  for (const p of panels) {
    const { cuts, darts } = cutPaths(asm, p.tiles, { minDefectDeg });
    const flat = flatten(asm, p.tiles, { cuts });
    alignPanel(asm, flat);
    const loop = flat.loops[0] || [];
    const poly = loop.map((s) => ({ x: s.from.x, y: s.from.y }));
    out.push({
      id: p.id,
      name: `P${String(p.id + 1).padStart(2, '0')}`,
      tiles: p.tiles,
      tileCount: p.tiles.length,
      darts,
      dartIntakeDeg: darts.reduce((a, d) => a + Math.abs(d.intakeDeg), 0),
      poly,
      loops: flat.loops,
      pts: flat.pts,
      flat,
      areaCm2: Math.abs(polyArea(poly)),
      maxEdgeErr: flat.maxEdgeErr,
      overlaps: flat.overlaps,
      boundaryVerts: loop.map((s) => s.va),
    });
  }
  return { panels: out, label, normalTol: usedTol, mode, stripWidth };
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function bbox(poly) {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Outward offset by `s` along the angle bisector at each vertex (seam
 * allowance). `s` may be one number for the whole outline, or an array with
 * one number per vertex -- which is what lets a hem take 2 cm where the seams
 * beside it take 1, instead of the whole piece taking whichever is wrong.
 */
export function offsetPoly(poly, s, miter = 3.0) {
  const n = poly.length;
  if (n < 3) return poly;
  const sAt = Array.isArray(s) ? (i) => (s[i] === undefined ? 0 : s[i]) : () => s;
  const ccw = polyArea(poly) > 0;
  const sign = ccw ? 1 : -1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    const e1 = normalize2(p.x - a.x, p.y - a.y);
    const e2 = normalize2(b.x - p.x, b.y - p.y);
    const n1 = { x: e1.y * sign, y: -e1.x * sign };
    const n2 = { x: e2.y * sign, y: -e2.x * sign };
    const si = sAt(i);
    let bx = n1.x + n2.x, by = n1.y + n2.y;
    const bl = Math.hypot(bx, by);
    if (bl < 1e-9) { out.push({ x: p.x + n1.x * si, y: p.y + n1.y * si }); continue; }
    bx /= bl; by /= bl;
    const cosHalf = Math.max(0.2, bx * n1.x + by * n1.y);
    const d = Math.min(si / cosHalf, si * miter);
    out.push({ x: p.x + bx * d, y: p.y + by * d });
  }
  return out;
}
const normalize2 = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

/** Shelf-pack panels (plus seam allowance) onto fabric of the given width. */
export function nest(panels, { fabricWidthCm = 140, gapCm = 1.5, seamAllowanceCm = 1.0 } = {}) {
  const items = panels.map((p) => {
    const grown = offsetPoly(p.poly, seamAllowanceCm);
    const b = bbox(grown.length ? grown : p.poly);
    return { p, grown, w: b.x1 - b.x0 + gapCm, h: b.y1 - b.y0 + gapCm, b };
  }).sort((a, b) => b.h - a.h);

  let shelfY = gapCm, shelfH = 0, cursor = gapCm;
  const placed = [];
  for (const it of items) {
    if (cursor + it.w > fabricWidthCm && cursor > gapCm) {
      shelfY += shelfH; cursor = gapCm; shelfH = 0;
    }
    placed.push({ ...it, dx: cursor - it.b.x0, dy: shelfY - it.b.y0 });
    cursor += it.w;
    shelfH = Math.max(shelfH, it.h);
  }
  return { placed, widthCm: fabricWidthCm, heightCm: shelfY + shelfH + gapCm };
}
