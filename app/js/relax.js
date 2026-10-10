// Static relaxation: no physics, no time integration, no mass. Just constraint
// projection, Gauss-Seidel, exactly as in ShapeUp / projective dynamics.
//
// Three constraint families:
//   1. every tile edge wants its exact library length           (hard, stiff)
//   2. every vertex wants to lie on the body's ease surface      (soft, tunable)
//   3. no vertex may be inside the body                          (hard, one-sided)
//
// "Let it fall onto the bodice" is a small downward nudge applied before each
// projection sweep; the constraints then resist it. That is a quasi-static
// descent, which is what you want for a fitting -- it settles rather than
// bouncing, and it is deterministic.

import { sub, add, mul, dot, norm, len, dist } from './geom.js';

export const DEFAULTS = {
  iters: 40,
  edgePasses: 3,
  edgeStiffness: 1.0,
  attract: 0.35,        // pull toward the ease surface
  push: 1.0,            // push out of the body (0..1, 1 = fully)
  gravity: 0.0,         // cm of downward nudge per iteration
  ease: 0.6,            // cm of wearing ease
  tangentDrift: 0.0,    // allow sliding along the surface (0..1)
  faceClearance: 0.5,   // keep whole TILES off the body, not just their corners
  faceSamples: 4,       // interior points sampled per tile
};

export function relax(asm, surface, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const V = asm.verts;
  const edges = [...asm.edges.values()];
  const history = [];
  const BARY = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
  const samples = BARY.slice(0, Math.max(1, Math.min(4, o.faceSamples)));

  for (let it = 0; it < o.iters; it++) {
    // ---- 1. the nudge. "Let it fall onto the bodice": a small downward step
    // that the constraints below then resist. Quasi-static, deterministic.
    if (o.gravity) {
      for (let i = 0; i < V.length; i++) if (!asm.pinned[i]) V[i][1] -= o.gravity;
    }

    // ---- 2. pull each corner toward the ease surface
    if (surface && o.attract > 0) {
      for (let i = 0; i < V.length; i++) {
        if (asm.pinned[i]) continue;
        const p = V[i];
        const c = surface.closestOnOffset(p, o.ease);
        const target = o.tangentDrift > 0 ? c.point : add(p, mul(c.normal, -c.signed));
        p[0] += (target[0] - p[0]) * o.attract;
        p[1] += (target[1] - p[1]) * o.attract;
        p[2] += (target[2] - p[2]) * o.attract;
      }
    }

    // ---- 3. face clearance.
    // A flat tile chord sags about h^2/(8R) below the surface it spans, so a
    // shell whose CORNERS all clear the body can still have its faces cutting
    // into a bust or a shoulder. Sample inside each tile and lift it out.
    if (surface && o.faceClearance > 0) {
      for (const tl of asm.tiles) {
        const [i, j, k] = tl.v;
        let worst = 0, wn = null;
        for (const bc of samples) {
          const p = [0, 1, 2].map((d) => V[i][d] * bc[0] + V[j][d] * bc[1] + V[k][d] * bc[2]);
          const c = surface.closestOnOffset(p, o.ease);
          if (c.signed < worst) { worst = c.signed; wn = c.normal; }
        }
        if (worst < 0 && wn) {
          const s = -worst * o.faceClearance;
          for (const vi of [i, j, k]) {
            if (asm.pinned[vi]) continue;
            V[vi][0] += wn[0] * s; V[vi][1] += wn[1] * s; V[vi][2] += wn[2] * s;
          }
        }
      }
    }

    // ---- 4. edge lengths. Late in the sweep, because a tile that has been
    // lifted off the body must still be the exact shape it was cut as.
    for (let pass = 0; pass < o.edgePasses; pass++) {
      for (const e of edges) {
        const a = V[e.a], b = V[e.b];
        const d = sub(b, a);
        const L = len(d);
        if (L < 1e-9) continue;
        const corr = ((L - e.target) / L) * 0.5 * o.edgeStiffness;
        const pa = asm.pinned[e.a], pb = asm.pinned[e.b];
        const wa = pa ? 0 : (pb ? 2 : 1);
        const wb = pb ? 0 : (pa ? 2 : 1);
        for (let m = 0; m < 3; m++) {
          const c = d[m] * corr;
          a[m] += c * wa;
          b[m] -= c * wb;
        }
      }
    }

    // ---- 5. non-penetration, last and one-sided. Nothing after this may push
    // a corner back inside the body, so this is the constraint that holds.
    if (surface && o.push > 0) {
      for (let i = 0; i < V.length; i++) {
        if (asm.pinned[i]) continue;
        const p = V[i];
        const c = surface.closestOnOffset(p, o.ease);
        if (c.signed < 0) {
          const s = -c.signed * o.push;
          p[0] += c.normal[0] * s; p[1] += c.normal[1] * s; p[2] += c.normal[2] * s;
        }
      }
    }

    if (o.trace) history.push(asm.stats(surface, o.ease));
  }
  return { stats: asm.stats(surface, o.ease), history };
}

/**
 * Gap between the shell and the ACTUAL body (not the ease surface), per corner.
 * With flat tiles over a curved body the corners must stand off by roughly the
 * ease plus the chord sag, so this -- not distance to the offset surface -- is
 * the number that says whether the shell fits.
 */
export function clearanceReport(asm, surface) {
  let min = Infinity, max = -Infinity, sum = 0;
  for (const p of asm.verts) {
    const g = surface.closestPoint(p).signed;
    if (g < min) min = g;
    if (g > max) max = g;
    sum += g;
  }
  return { minGapCm: min, maxGapCm: max, meanGapCm: sum / asm.verts.length };
}

/**
 * Alternate relaxation with re-quantisation to the tile library until the
 * assignment stops changing -- the full local/global loop. `quantizeFn` is
 * lattice.quantize, passed in to keep this module dependency-free.
 */
export function settle(asm, surface, quantizeFn, {
  rounds = 6, relaxOpts = {}, quantizeOpts = {},
} = {}) {
  let cur = asm;
  const log = [];
  for (let r = 0; r < rounds; r++) {
    const res = relax(cur, surface, relaxOpts);
    const next = quantizeFn(cur, quantizeOpts);
    log.push({
      round: r,
      ...res.stats,
      reassigned: next.meta ? next.meta.changed : 0,
      meanTileErr: next.meta ? next.meta.meanTileErr : null,
    });
    cur = next;
    if (next.meta && next.meta.changed === 0) break;
  }
  const final = relax(cur, surface, relaxOpts);
  log.push({ round: 'final', ...final.stats });
  return { asm: cur, log };
}

/**
 * Deepest penetration of any tile FACE into the body, which is the number that
 * actually tells you whether the shell clears the bust.
 */
export function faceClearanceReport(asm, surface, ease = 0.6) {
  const BARY = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
  let worst = 0, count = 0;
  for (const tl of asm.tiles) {
    const P = tl.v.map((i) => asm.verts[i]);
    let bad = false;
    for (const bc of BARY) {
      const p = [0, 1, 2].map((d) => P[0][d] * bc[0] + P[1][d] * bc[1] + P[2][d] * bc[2]);
      const c = surface.closestOnOffset(p, ease);
      if (c.signed < worst) worst = c.signed;
      if (c.signed < -0.05) bad = true;
    }
    if (bad) count++;
  }
  return { deepestFaceCm: -worst, tilesCuttingIn: count };
}

/** Convert the biggest strains into a report you can act on. */
export function worstEdges(asm, n = 10) {
  return asm.edgeStrains()
    .sort((a, b) => Math.abs(b.strain) - Math.abs(a.strain))
    .slice(0, n)
    .map((s) => ({
      a: s.e.a, b: s.e.b,
      targetCm: +s.e.target.toFixed(2),
      actualCm: +s.L.toFixed(2),
      strainPct: +(s.strain * 100).toFixed(1),
    }));
}
