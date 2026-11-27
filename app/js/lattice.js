// Building a tiled shell on a surface.
//
// SUPERSEDED IN PART (2026-11-26). The tile library this file snaps to is the
// project's initial idea and the project has deviated from it, so `bestTile` and
// the per-triangle tile registration below are probably old code that no longer
// contributes. `buildGridShell` itself is NOT: the pattern path calls it as a
// plain quad grid (`u: 1, cols: gores, rows: patternRows`) and ignores which tile
// each triangle was assigned. So an issue in the tile half may be worth retiring
// rather than repairing, and an issue in the grid half is live code -- which of
// the two it is, and what to do about it, is checked with the user before any
// change. See CLAUDE.md rule 10 and `app/js/tiles.js`.
//
// Key observation: a quad of 4u x 3u split on its diagonal is exactly two 3-4-5
// triangles (sides 4u, 3u, 5u). So the natural lattice for this library is a
// 4u x 3u grid, and "tile the bodice in 3-4-5 triangles" means "lay a 4u x 3u
// grid over the body and split every cell". Everything after that is fitting.

import { sub, add, mul, dot, cross, norm, len, dist } from './geom.js';
import { Assembly } from './assembly.js';
import { LIBRARY, byId, SIDE_LENGTHS } from './tiles.js';
import { ekey } from './assembly.js';

// Superseded premise: see the top of this file. `bestTile` serves the tile
// library, not the pattern path.
/**
 * Best library tile for a triangle with the given actual side lengths.
 * Returns { tileId, perm, err } where perm maps tile vertex slot -> input slot,
 * and err is the RMS relative side-length error.
 *
 * Side i of a tile is opposite vertex i, so a cyclic rotation of the sides is a
 * rotation of the triangle and a swap is a reflection -- six correspondences.
 */
export function bestTile(sides, { allow = null, weight = null } = {}) {
  const PERMS = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1], [2, 1, 0], [1, 0, 2]];
  let best = null;
  for (const t of LIBRARY) {
    if (allow && !allow.includes(t.id)) continue;
    for (const perm of PERMS) {
      let e = 0;
      for (let i = 0; i < 3; i++) {
        const target = t.sides[i] * (weight ? weight.u : 1);
        const actual = sides[perm[i]];
        e += ((actual - target) / target) ** 2;
      }
      e = Math.sqrt(e / 3);
      if (!best || e < best.err) best = { tileId: t.id, perm, err: e };
    }
  }
  return best;
}

/**
 * Lay a (cols x rows) grid in the surface's (u,v) domain, push it out to the
 * ease offset, split every cell into two triangles, and register each triangle
 * as the closest library tile.
 *
 * The grid wraps in u (a closed tube) unless `wrap` is false, in which case it
 * is an open panel from uLo to uHi -- which is what you want for a front bodice.
 */
export function buildGridShell(surface, {
  u = 2.0, cols = null, rows = null, vLo = 0.02, vHi = 0.98,
  uLo = 0, uHi = 1, wrap = true, ease = 0.6, allow = null,
} = {}) {
  // Size the grid so cells are about 4u wide by 3u tall, in real centimetres.
  // Mean girth across the band, not the mid slice: a bodice is much wider at
  // the bust than at the waist and a single slice mis-sizes the grid.
  let girth = 0;
  const NS = 7;
  for (let k = 0; k < NS; k++) girth += surface.girthAt(vLo + (vHi - vLo) * (k + 0.5) / NS);
  girth = (girth / NS) * (wrap ? 1 : (uHi - uLo));
  const height = len(sub(surface.point(uLo, vHi), surface.point(uLo, vLo)));
  cols = cols || Math.max(4, Math.round(girth / (4 * u)));
  rows = rows || Math.max(2, Math.round(height / (3 * u)));

  const asm = new Assembly({ u, weldTol: Math.min(0.45, 0.25 * u) });
  // Where on the body each vertex came from. Carried into the pattern as a
  // placement hint, so a pattern can later be offered up to a DIFFERENT body
  // in the right place -- which is what balance marks do on a paper pattern.
  asm.gridUV = [];
  const grid = [];                      // grid[j][i] -> vertex index
  const nU = wrap ? cols : cols + 1;
  for (let j = 0; j <= rows; j++) {
    const row = [];
    const v = vLo + (vHi - vLo) * (j / rows);
    for (let i = 0; i < nU; i++) {
      const uu = uLo + (uHi - uLo) * (i / cols);
      const c = surface.closestOnOffset(surface.point(uu % 1, v), ease);
      const vi = asm.addVertex(c.point);
      asm.gridUV[vi] = [uu % 1, v];
      row.push(vi);
    }
    grid.push(row);
  }

  // Split each cell. Alternate the diagonal so the tiling is not biased, which
  // also keeps vertex degrees near 6.
  const quads = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const i2 = wrap ? (i + 1) % nU : i + 1;
      const a = grid[j][i], b = grid[j][i2], c = grid[j + 1][i], d = grid[j + 1][i2];
      // remember which grid cell each triangle came from: panels.js uses it to
      // cut the shell into vertical strips (gores), which is the only panel
      // shape that flattens without self-overlap on a doubly curved body
      const cell = { i, j };
      if ((i + j) % 2 === 0) quads.push({ tri: [a, b, d], cell }, { tri: [a, d, c], cell });
      else quads.push({ tri: [a, b, c], cell }, { tri: [b, d, c], cell });
    }
  }

  let errSum = 0;
  for (const { tri, cell } of quads) {
    if (new Set(tri).size < 3) continue;                 // degenerate after welding
    const P = tri.map((i) => asm.verts[i]);
    const sides = [dist(P[1], P[2]), dist(P[2], P[0]), dist(P[0], P[1])];
    // The tile identity assigned here is the superseded premise (top of file);
    // the pattern path uses the grid, not the tile. Do not repair this without
    // asking the user whether it should be retired instead.
    const b = bestTile(sides, { allow, weight: { u } });
    errSum += b.err;
    // perm maps tile slot -> input slot
    const ti = asm.addTile(b.tileId, [tri[b.perm[0]], tri[b.perm[1]], tri[b.perm[2]]]);
    asm.tiles[ti].cell = cell;
  }
  asm.meta = { cols, rows, wrap, ease, girth, height, meanTileErr: errSum / quads.length };
  return asm;
}

/**
 * Re-assign every tile to the library member that best matches its CURRENT
 * geometry -- the quantisation half of the local/global loop. Run relax(),
 * then this, then relax() again, and repeat: that is the dithering scheme from
 * docs/01-geometry.md section 9.
 *
 * With `diffuse` on, the residual side-length error of each tile is pushed onto
 * its not-yet-assigned neighbours (error diffusion) instead of being discarded.
 */
export function quantize(asm, { allow = null, rounds = 3, snapWeight = 6.0 } = {}) {
  const u = asm.u;
  const sides = SIDE_LENGTHS.map((s) => s * u);
  const snap = (L) => sides.reduce((a, b) => (Math.abs(b - L) < Math.abs(a - L) ? b : a), sides[0]);

  // Phase A: give every edge ONE target, by snapping its current length to the
  // nearest side length the library offers. Shared edges therefore cannot
  // disagree -- the disagreement in the naive version came from each tile
  // snapping independently.
  const actual = new Map(), target = new Map();
  for (const e of asm.edges.values()) {
    const k = ekey(e.a, e.b);
    const L = dist(asm.verts[e.a], asm.verts[e.b]);
    actual.set(k, L);
    target.set(k, snap(L));
  }

  const PERMS = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1], [2, 1, 0], [1, 0, 2]];
  const ids = allow || LIBRARY.map((t) => t.id);
  let chosen = [];

  for (let r = 0; r < rounds; r++) {
    // Phase B: pick each tile to agree with its edges' agreed targets, with the
    // tile's own fit to the real geometry as a tie-break.
    chosen = asm.tiles.map((tl) => {
      const keys = [[tl.v[1], tl.v[2]], [tl.v[2], tl.v[0]], [tl.v[0], tl.v[1]]].map((p) => ekey(...p));
      const act = keys.map((k) => actual.get(k));
      const tgt = keys.map((k) => target.get(k));
      let best = null;
      for (const id of ids) {
        const t = byId[id];
        for (const perm of PERMS) {
          let cost = 0;
          for (let i = 0; i < 3; i++) {
            const want = t.sides[i] * u;
            cost += snapWeight * Math.abs(want - tgt[perm[i]]) / u
                  + Math.abs(want - act[perm[i]]) / u;
          }
          if (!best || cost < best.cost) best = { cost, tileId: id, perm, keys };
        }
      }
      return best;
    });

    // Phase C: re-agree each edge's target as the mean of what its tiles now
    // want, re-snapped. Converges in two or three rounds.
    const demand = new Map();
    chosen.forEach((c, ti) => {
      const t = byId[c.tileId];
      for (let i = 0; i < 3; i++) {
        const k = c.keys[c.perm[i]];
        if (!demand.has(k)) demand.set(k, []);
        demand.get(k).push(t.sides[i] * u);
      }
    });
    let moved = 0;
    for (const [k, ds] of demand) {
      const want = snap(ds.reduce((a, b) => a + b, 0) / ds.length);
      if (want !== target.get(k)) { target.set(k, want); moved++; }
    }
    if (moved === 0) break;
  }

  const fresh = new Assembly({ u: asm.u, weldTol: asm.weldTol });
  fresh.verts = asm.verts.map((p) => [p[0], p[1], p[2]]);
  fresh.pinned = asm.pinned.slice();
  fresh.gridUV = asm.gridUV;
  let changed = 0, errSum = 0;
  chosen.forEach((c, ti) => {
    const tl = asm.tiles[ti];
    if (c.tileId !== tl.tileId) changed++;
    const t = byId[c.tileId];
    const act = c.keys.map((k) => actual.get(k));
    let e = 0;
    for (let i = 0; i < 3; i++) e += ((act[c.perm[i]] - t.sides[i] * u) / (t.sides[i] * u)) ** 2;
    errSum += Math.sqrt(e / 3);
    const added = fresh.addTile(c.tileId, [tl.v[c.perm[0]], tl.v[c.perm[1]], tl.v[c.perm[2]]]);
    fresh.tiles[added].cell = tl.cell;
  });
  fresh.meta = { ...(asm.meta || {}), changed, meanTileErr: errSum / Math.max(1, asm.tiles.length) };
  return fresh;
}

/**
 * Greedy frontier growth -- the explicit "specify the relation" mode. Starting
 * from a seed tile, repeatedly take a boundary edge and attach the library tile
 * and fold angle whose new vertex sits closest to the body's ease surface,
 * preferring assignments that weld onto an existing vertex (closing the shell)
 * and that do not blow the 360-degree budget at either end of the edge.
 */
export function growOntoSurface(asm, surface, {
  maxTiles = 220, ease = 0.6, allow = null,
  foldLo = -75, foldHi = 75, foldStep = 2.5, weldBonus = 1.2,
} = {}) {
  const ids = (allow || LIBRARY.map((t) => t.id));
  let added = 0, rejected = 0;
  while (asm.tiles.length < maxTiles) {
    const frontier = asm.boundaryEdges();
    if (!frontier.length) break;
    // work on the boundary edge whose midpoint hugs the body best
    frontier.sort((p, q) => {
      const mp = (e) => mul(add(asm.verts[e.a], asm.verts[e.b]), 0.5);
      return Math.abs(surface.closestOnOffset(mp(p), ease).signed)
           - Math.abs(surface.closestOnOffset(mp(q), ease).signed);
    });
    let placed = false;
    for (const edge of frontier) {
      let best = null;
      for (const id of ids) {
        for (const flip of [false, true]) {
          for (let phi = foldLo; phi <= foldHi; phi += foldStep) {
            const prop = asm.proposeVertex(edge, id, phi, flip);
            if (!prop) break;                       // this tile has no matching side
            const off = surface.closestOnOffset(prop.pos, ease);
            let score = Math.abs(off.signed);
            if (off.signed < -0.2) score += 4 * -off.signed;      // inside the body: bad
            const weld = asm.findVertex(prop.pos);
            if (weld >= 0) score -= weldBonus;                     // closing up: good
            // do not overfill a vertex past 360 degrees
            const { sums } = asm.angleSums({ nominal: true });
            const t = byId[id];
            const need = [edge.a, edge.b].map((vi, k) => {
              const slot = prop.flip ? [1, 0][k] : k;
              const corner = t.angles[(prop.sideIndex + 1 + slot) % 3];
              return (sums[vi] + corner) * 180 / Math.PI;
            });
            const over = Math.max(0, ...need.map((d) => d - 360.5));
            score += over * 0.05;
            if (!best || score < best.score) best = { score, id, phi, flip };
          }
        }
      }
      if (best && best.score < 1.6) {
        if (asm.attach(edge, best.id, best.phi, best.flip) >= 0) { added++; placed = true; break; }
      }
      rejected++;
    }
    if (!placed) break;
  }
  return { added, rejected, tiles: asm.tiles.length };
}
