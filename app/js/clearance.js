// How far the cloth is from the skin, everywhere -- the instrument for
// questions like "is the dress form showing through?".
//
// The viewer used to answer that with `deepestPenetrationCm`, which sampled
// VERTICES. It read 0.00 cm while the body was plainly visible through a
// half-sewn skirt, because every vertex was outside and the triangles between
// them were not. A single worst-case number over the wrong sample set is the
// least useful thing you can measure.
//
// So: sample the cloth SURFACE on a barycentric grid over every triangle,
// take the signed distance to the body at each sample, and report the
// distribution. Negative is inside the body. The interesting facts are not
// the minimum but the shape of the tail -- how much AREA is inside, and by how
// much -- because that is what you see.
//
// Three.js-free, like every geometry module here, so the headless trace and
// the viewer measure the same thing with the same code.

import { BodyCollider } from './cloth.js';

/**
 * Barycentric sample points for one triangle, as [w0, w1, w2] weights.
 *
 * A uniform grid of order n: every (i, j, k) with i + j + k = n, so n = 1 is
 * the three corners, n = 2 adds the edge midpoints, n = 3 gives ten points
 * including the centroid. Corners and edges are where contact actually
 * happens, so the low orders are not a crude version of the high ones -- they
 * are the ones that matter, in order.
 */
export function barycentricGrid(n = 3) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n - i; j++) {
      const k = n - i - j;
      out.push([i / n, j / n, k / n]);
    }
  }
  return out;
}

const percentile = (sorted, q) => {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
};

/**
 * The clearance field: signed distance from the cloth surface to the body,
 * sampled over every triangle.
 *
 * @param order  barycentric grid order; 3 is ten samples per triangle
 * @returns distances in cm, negative inside, plus the summary that matters
 */
export function clearance(asm, surface, { order = 3, collider = null } = {}) {
  const col = collider || new BodyCollider(surface);
  const bary = barycentricGrid(order);
  const V = asm.verts;
  const all = [];
  let insideArea = 0, totalArea = 0;
  const worst = [];

  for (let t = 0; t < asm.tiles.length; t++) {
    const tri = asm.tiles[t];
    const [A, B, C] = tri.v.map((i) => V[i]);
    // the triangle's CURRENT area, not its cut area: this is about where the
    // cloth is now, not what it was cut to
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const area = 0.5 * Math.hypot(cx, cy, cz);
    totalArea += area;

    let nInside = 0;
    let triWorst = Infinity;
    for (const [w0, w1, w2] of bary) {
      const p = [
        A[0] * w0 + B[0] * w1 + C[0] * w2,
        A[1] * w0 + B[1] * w1 + C[1] * w2,
        A[2] * w0 + B[2] * w1 + C[2] * w2,
      ];
      let d = col.signedAt(p);
      if (!Number.isFinite(d)) d = 99;        // far outside the field
      all.push(d);
      if (d < 0) nInside++;
      if (d < triWorst) triWorst = d;
    }
    // the fraction of this triangle's samples that are inside, as area
    insideArea += area * (nInside / bary.length);
    if (triWorst < 0) worst.push({ tri: t, cm: +triWorst.toFixed(3) });
  }

  all.sort((a, b) => a - b);
  worst.sort((a, b) => a.cm - b.cm);
  const inside = all.filter((d) => d < 0);
  return {
    samples: all.length,
    trianglesTouched: worst.length,
    // the tail, which is the part you can see
    deepestCm: +(all.length ? all[0] : 0).toFixed(3),
    insideSamples: inside.length,
    insidePct: +(100 * inside.length / Math.max(1, all.length)).toFixed(2),
    insideAreaCm2: +insideArea.toFixed(1),
    insideAreaPct: +(100 * insideArea / Math.max(1e-9, totalArea)).toFixed(2),
    meanInsideCm: inside.length
      ? +(inside.reduce((a, d) => a + d, 0) / inside.length).toFixed(3) : 0,
    // and the distribution, which says whether the garment fits at all
    p01Cm: +percentile(all, 0.01).toFixed(2),
    p05Cm: +percentile(all, 0.05).toFixed(2),
    medianCm: +percentile(all, 0.50).toFixed(2),
    p95Cm: +percentile(all, 0.95).toFixed(2),
    worstTriangles: worst.slice(0, 10),
  };
}

/**
 * A one-line form, for printing once per frame without flooding the log.
 */
export function clearanceLine(c) {
  return `inside ${c.insideAreaPct} % of the cloth area`
    + ` (${c.insideSamples}/${c.samples} samples), deepest ${c.deepestCm} cm,`
    + ` median clearance ${c.medianCm} cm`;
}

/**
 * Where the body comes through, as an OBJ of just the offending triangles --
 * so "show me" is a file you can open rather than a screenshot you squint at.
 */
export function offendersOBJ(asm, worstTriangles) {
  const L = ['# cloth triangles with part of the body through them'];
  const map = new Map();
  const id = (vi) => {
    if (!map.has(vi)) {
      const p = asm.verts[vi];
      map.set(vi, map.size + 1);
      L.push(`v ${p[0].toFixed(4)} ${p[1].toFixed(4)} ${p[2].toFixed(4)}`);
    }
    return map.get(vi);
  };
  const faces = [];
  for (const { tri } of worstTriangles) {
    const v = asm.tiles[tri].v;
    faces.push(`f ${id(v[0])} ${id(v[1])} ${id(v[2])}`);
  }
  return `${L.concat(faces).join('\n')}\n`;
}
