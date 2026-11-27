// The joining engine: a static, physics-free kinematic assembly of library
// tiles.
//
// SUPERSEDED PREMISE (2026-11-26). The standard-triangle library -- 3-4-5 right,
// isoceles, equilateral -- was the project's initial idea, and the project has
// deviated from it: garments are now drafted as cloth pattern pieces, edited on
// the cutting table, sewn and draped. If a bug, a failing test or an obstacle to
// a new feature points at this code, the first hypothesis is that it is old code
// no longer contributing to the project, and the fix may be to retire it rather
// than to repair it. ALWAYS CHECK THAT WITH THE USER FIRST: this is a hypothesis
// about the project's direction, not a fact about the code, and nobody has
// measured what still depends on it. See CLAUDE.md rule 10 and the knowledge-tree
// node "The standard-triangle library is retired".
//
// You never give a tile a position. You give it a RELATION: "take this edge of
// the existing shell, attach tile X to it, with its side of matching length on
// that edge, folded by phi degrees out of the neighbouring tile's plane".
// Because the tile's three side lengths are fixed, that relation determines the
// new vertex exactly -- the third vertex lies on a circle about the shared edge,
// and phi picks the point on it. One tile, one degree of freedom, which is the
// rigidity result of docs/01-geometry.md section 4 made operational.
//
// Vertices are welded on contact (within `weldTol`), which is how the shell
// closes up and how angle defect starts accumulating at a vertex.

import {
  sub, add, mul, dot, cross, norm, len, dist, cp, DEG, RAD, clamp,
} from './geom.js';
import { byId, LIBRARY } from './tiles.js';

const ekey = (i, j) => (i < j ? `${i}_${j}` : `${j}_${i}`);

export class Assembly {
  /** @param {object} opts  u = module size in cm; weldTol in cm */
  constructor({ u = 2.0, weldTol = 0.45 } = {}) {
    this.u = u;
    this.weldTol = weldTol;
    this.verts = [];        // [x,y,z]
    this.pinned = [];       // bool per vertex
    this.tiles = [];        // { tileId, v:[i,j,k], sides:[cm,cm,cm] }
    this.edges = new Map(); // ekey -> { a, b, target, tiles:[tileIndex,...] }
  }

  // ------------------------------------------------------------- primitives

  addVertex(p) {
    for (let i = 0; i < this.verts.length; i++) {
      if (dist(this.verts[i], p) <= this.weldTol) return i;   // weld
    }
    this.verts.push(cp(p));
    this.pinned.push(false);
    return this.verts.length - 1;
  }

  findVertex(p, tol = this.weldTol) {
    for (let i = 0; i < this.verts.length; i++) if (dist(this.verts[i], p) <= tol) return i;
    return -1;
  }

  /** Register a triangle. `v` are vertex indices; side i is opposite vertex i. */
  addTile(tileId, v) {
    const t = byId[tileId];
    if (!t) throw new Error(`unknown tile ${tileId}`);
    const sides = t.sides.map((s) => s * this.u);
    const idx = this.tiles.length;
    this.tiles.push({ tileId, v: [...v], sides });
    const pairs = [[v[1], v[2], sides[0]], [v[2], v[0], sides[1]], [v[0], v[1], sides[2]]];
    for (const [a, b, target] of pairs) {
      const k = ekey(a, b);
      let e = this.edges.get(k);
      if (!e) {
        e = { a: Math.min(a, b), b: Math.max(a, b), target, targets: [target], tiles: [] };
        this.edges.set(k, e);
      } else {
        // Two tiles can disagree about how long their shared edge should be --
        // that is the edge-length quantisation limit of docs/01-geometry.md
        // section 10.5 showing up. Compromise, and record the disagreement.
        e.targets.push(target);
        e.target = e.targets.reduce((x, y) => x + y, 0) / e.targets.length;
        e.conflict = Math.max(...e.targets) - Math.min(...e.targets);
      }
      e.tiles.push(idx);
    }
    return idx;
  }

  /**
   * Register a triangle whose side lengths are given explicitly rather than
   * taken from the tile library. This is what a sewn PATTERN needs: its
   * triangles came off a flat panel, not out of the library, and the pattern's
   * own measurements are what the fabric will hold the garment to.
   */
  addRawTile(v, sides, label = 'raw') {
    const idx = this.tiles.length;
    this.tiles.push({ tileId: null, label, v: [...v], sides: [...sides] });
    const pairs = [[v[1], v[2], sides[0]], [v[2], v[0], sides[1]], [v[0], v[1], sides[2]]];
    for (const [a, b, target] of pairs) {
      const k = ekey(a, b);
      let e = this.edges.get(k);
      if (!e) {
        e = { a: Math.min(a, b), b: Math.max(a, b), target, targets: [target], tiles: [] };
        this.edges.set(k, e);
      } else {
        e.targets.push(target);
        e.target = e.targets.reduce((x, y) => x + y, 0) / e.targets.length;
        e.conflict = Math.max(...e.targets) - Math.min(...e.targets);
      }
      e.tiles.push(idx);
    }
    return idx;
  }

  // ----------------------------------------------------------------- seeding

  /**
   * Place the first tile in the tangent plane of a surface at (u,v), then nudge
   * it out to the ease offset.
   */
  seedOnSurface(surface, tileId, uu, vv, { ease = 0.6, rotate = 0 } = {}) {
    const t = byId[tileId];
    const sides = t.sides.map((s) => s * this.u);
    const [du, dv, nr] = surface.frame(uu, vv);
    const origin = add(surface.point(uu, vv), mul(nr, ease));
    // lay the triangle out in 2D: vertex0 at origin, side2 (= |v0 v1|) along +x
    const c2 = sides[2], b1 = sides[1], a0 = sides[0];
    const p0 = [0, 0];
    const p1 = [c2, 0];
    const x = (c2 * c2 + b1 * b1 - a0 * a0) / (2 * c2);
    const y = Math.sqrt(Math.max(0, b1 * b1 - x * x));
    const p2 = [x, y];
    const ca = Math.cos(rotate * RAD), sa = Math.sin(rotate * RAD);
    const to3 = (p) => {
      const px = p[0] * ca - p[1] * sa, py = p[0] * sa + p[1] * ca;
      return add(origin, add(mul(du, px), mul(dv, py)));
    };
    const ids = [p0, p1, p2].map((p) => this.addVertex(to3(p)));
    return this.addTile(tileId, ids);
  }

  // ------------------------------------------------------------- the relation

  boundaryEdges() {
    return [...this.edges.values()].filter((e) => e.tiles.length === 1);
  }

  /** The vertex of `tileIndex` that is not on edge (a,b). */
  oppositeVertex(tileIndex, a, b) {
    return this.tiles[tileIndex].v.find((x) => x !== a && x !== b);
  }

  /**
   * Candidate position of the new third vertex when `tileId` is attached to the
   * edge (a,b) with the given fold angle.
   *
   * @param phiDeg  0 = coplanar continuation of the neighbour tile (flat),
   *                positive folds outward (away from the body), negative inward.
   * @param flip    swaps which of the tile's two free sides lands on vertex a.
   * @returns {{pos, sideIndex, r1, r2}|null}
   */
  proposeVertex(edge, tileId, phiDeg, flip = false) {
    const t = byId[tileId];
    const A = this.verts[edge.a], B = this.verts[edge.b];
    const d = dist(A, B);
    const sides = t.sides.map((s) => s * this.u);
    // which side of the tile matches the shared edge length?
    let sideIndex = -1, bestErr = Infinity;
    sides.forEach((s, i) => { const e = Math.abs(s - d); if (e < bestErr) { bestErr = e; sideIndex = i; } });
    if (bestErr > this.weldTol) return null;        // no side fits this edge

    // the two remaining sides, in tile order
    const o1 = (sideIndex + 1) % 3, o2 = (sideIndex + 2) % 3;
    // side o1 is opposite tile-vertex o1; the new vertex is `sideIndex`'s
    // opposite vertex, so its distances to the two edge ends are sides[o1],
    // sides[o2] in one assignment or the other.
    let r1 = sides[o2], r2 = sides[o1];             // r1 = |new,A|, r2 = |new,B|
    if (flip) { const s = r1; r1 = r2; r2 = s; }

    const e = mul(sub(B, A), 1 / d);
    const tt = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h2 = r1 * r1 - tt * tt;
    if (h2 <= 0) return null;                        // triangle inequality fails
    const h = Math.sqrt(h2);
    const foot = add(A, mul(e, tt));

    // In-plane reference direction: away from the neighbour tile's apex, so
    // phi = 0 lays the new tile flat against the old one.
    const nbr = edge.tiles[0];
    const P = this.verts[this.oppositeVertex(nbr, edge.a, edge.b)];
    const Pfoot = add(A, mul(e, dot(sub(P, A), e)));
    let p1 = sub(Pfoot, P);
    if (len(p1) < 1e-9) return null;
    p1 = norm(p1);
    const p2 = norm(cross(e, p1));
    const phi = phiDeg * RAD;
    const pos = add(foot, add(mul(p1, h * Math.cos(phi)), mul(p2, h * Math.sin(phi))));
    return { pos, sideIndex, r1, r2, flip, foot, radius: h, axis: e, basis: [p1, p2] };
  }

  /**
   * Attach a tile to an existing edge. This is the single "join" operation.
   * Returns the new tile index, or -1 if the relation is unsatisfiable.
   */
  attach(edge, tileId, phiDeg, flip = false) {
    const prop = this.proposeVertex(edge, tileId, phiDeg, flip);
    if (!prop) return -1;
    const t = byId[tileId];
    const ci = this.addVertex(prop.pos);
    // Vertex order must put the right side opposite the right vertex.
    // sideIndex is the shared edge; its opposite vertex is the NEW one.
    const v = [];
    v[prop.sideIndex] = ci;
    const o1 = (prop.sideIndex + 1) % 3, o2 = (prop.sideIndex + 2) % 3;
    // side o1 is opposite vertex o1, and |new,B| = sides[o1] => vertex o1 is A... :
    // |v[o1], v[o2]| must equal sides[sideIndex]; and |v[sideIndex], v[o2]| = sides[o1].
    if (!prop.flip) { v[o1] = edge.a; v[o2] = edge.b; } else { v[o1] = edge.b; v[o2] = edge.a; }
    return this.addTile(tileId, v);
  }

  // ------------------------------------------------------------- diagnostics

  /**
   * Tile corner angles incident on each vertex.
   *
   * `nominal: true` uses the library tile's ideal angles -- what the shell
   * would be if every seam were exactly its target length. The default uses
   * the ACTUAL 3D geometry, which is what the body really imposes and what a
   * pattern has to absorb as darts. The two differ by however much seam strain
   * the quantiser left behind, which is several per cent, and that is a lot of
   * degrees once it is summed around a vertex.
   */
  angleSums({ nominal = false } = {}) {
    const sums = new Array(this.verts.length).fill(0);
    const counts = new Array(this.verts.length).fill(0);
    for (const tl of this.tiles) {
      let ang;
      if (nominal) {
        ang = byId[tl.tileId].angles;
      } else {
        const P = tl.v.map((i) => this.verts[i]);
        const L = [dist(P[1], P[2]), dist(P[2], P[0]), dist(P[0], P[1])];
        ang = [0, 1, 2].map((i) => {
          const a = L[i], b = L[(i + 1) % 3], c = L[(i + 2) % 3];
          const x = (b * b + c * c - a * a) / (2 * b * c);
          return Math.acos(x < -1 ? -1 : x > 1 ? 1 : x);
        });
      }
      for (let i = 0; i < 3; i++) { sums[tl.v[i]] += ang[i]; counts[tl.v[i]]++; }
    }
    return { sums, counts };
  }

  /** Which vertices are interior (every incident edge has two tiles)? */
  interiorFlags() {
    const flag = new Array(this.verts.length).fill(true);
    for (const e of this.edges.values()) {
      if (e.tiles.length < 2) { flag[e.a] = false; flag[e.b] = false; }
    }
    return flag;
  }

  /**
   * Discrete Gaussian curvature K(v) = 2*pi - sum(theta), in degrees.
   * Only meaningful at interior vertices; boundary vertices get null.
   */
  angleDefects(opts = {}) {
    const { sums } = this.angleSums(opts);
    const interior = this.interiorFlags();
    return sums.map((s, i) => (interior[i] ? (2 * Math.PI - s) * DEG : null));
  }

  /** Edge strain: (actual - target) / target, per edge. */
  edgeStrains() {
    const out = [];
    for (const e of this.edges.values()) {
      const L = dist(this.verts[e.a], this.verts[e.b]);
      out.push({ e, L, strain: (L - e.target) / e.target });
    }
    return out;
  }

  stats(surface = null, ease = 0.6) {
    const strains = this.edgeStrains();
    const absS = strains.map((s) => Math.abs(s.strain));
    const defects = this.angleDefects().filter((d) => d !== null);
    const s = {
      tiles: this.tiles.length,
      vertices: this.verts.length,
      edges: this.edges.size,
      boundaryEdges: this.boundaryEdges().length,
      interiorVertices: defects.length,
      dof: 3 * this.verts.length - this.edges.size - 6,
      areaCm2: this.tiles.reduce((a, t) => {
        if (t.tileId) return a + byId[t.tileId].area * this.u * this.u;
        const P = t.v.map((i) => this.verts[i]);
        return a + 0.5 * len(cross(sub(P[1], P[0]), sub(P[2], P[0])));
      }, 0),
      seamLengthCm: [...this.edges.values()].reduce((a, e) => a + e.target, 0),
      conflictEdges: [...this.edges.values()].filter((e) => (e.conflict || 0) > 1e-6).length,
      maxConflictCm: Math.max(0, ...[...this.edges.values()].map((e) => e.conflict || 0)),
      maxStrain: absS.length ? Math.max(...absS) : 0,
      rmsStrain: absS.length ? Math.sqrt(absS.reduce((a, x) => a + x * x, 0) / absS.length) : 0,
      meanAbsDefectDeg: defects.length ? defects.reduce((a, d) => a + Math.abs(d), 0) / defects.length : 0,
      totalDefectDeg: defects.reduce((a, d) => a + d, 0),
    };
    if (surface) {
      let sum = 0, max = 0, worstInside = 0;
      for (const p of this.verts) {
        const c = surface.closestOnOffset(p, ease);
        const d = Math.abs(c.signed);
        sum += d * d; if (d > max) max = d;
        if (c.signed < worstInside) worstInside = c.signed;
      }
      s.rmsFitCm = Math.sqrt(sum / Math.max(1, this.verts.length));
      s.maxFitCm = max;
      s.deepestPenetrationCm = -worstInside;
    }
    return s;
  }

  /** Tile-count histogram by library id. */
  tileHistogram() {
    const h = {};
    for (const t of this.tiles) {
      const k = t.tileId || t.label || 'raw';
      h[k] = (h[k] || 0) + 1;
    }
    return h;
  }

  // ---------------------------------------------------------------- exports

  toOBJ(comment = '') {
    const L = [`# triangulated bodice shell${comment ? ' - ' + comment : ''}`,
      `# module u = ${this.u} cm; ${this.tiles.length} tiles, ${this.verts.length} vertices`];
    for (const p of this.verts) L.push(`v ${p[0].toFixed(4)} ${p[1].toFixed(4)} ${p[2].toFixed(4)}`);
    for (const t of this.tiles) {
      L.push(`g ${t.tileId || t.label || 'raw'}`, `f ${t.v[0] + 1} ${t.v[1] + 1} ${t.v[2] + 1}`);
    }
    return L.join('\n') + '\n';
  }

  toJSON() {
    return JSON.stringify({
      u: this.u,
      verts: this.verts,
      tiles: this.tiles.map((t) => ({ tileId: t.tileId, v: t.v })),
    });
  }

  static fromJSON(s) {
    const o = typeof s === 'string' ? JSON.parse(s) : s;
    const a = new Assembly({ u: o.u });
    a.verts = o.verts.map(cp);
    a.pinned = o.verts.map(() => false);
    for (const t of o.tiles) a.addTile(t.tileId, t.v);
    return a;
  }
}

export { ekey };
