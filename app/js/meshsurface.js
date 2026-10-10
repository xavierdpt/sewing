// Adapter that makes an arbitrary triangle mesh (an OBJ: a body scan, the CC0
// MakeHuman bodice in app/models/bodice.obj, a padded dress form you
// photogrammetered) expose exactly the same interface as Torso, so the tiling
// and relaxation code does not care which it is given.
//
// Required interface: point(u,v), normal(u,v), frame(u,v), closestPoint(p),
// closestOnOffset(p, ease), girthAt(v), mesh().

import { sub, add, mul, dot, cross, norm, len, clamp } from './geom.js';

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection). */
function closestOnTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp2 = sub(p, c), d5 = dot(ab, cp2), d6 = dot(ac, cp2);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  }
  const denom = 1 / (va + vb + vc);
  return add(a, add(mul(ab, vb * denom), mul(ac, vc * denom)));
}

export function parseOBJ(text) {
  const positions = [], indices = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const q = line.trim().split(/\s+/);
      positions.push([+q[1], +q[2], +q[3]]);
    } else if (line.startsWith('f ')) {
      const idx = line.trim().split(/\s+/).slice(1).map((t) => {
        const n = parseInt(t.split('/')[0], 10);
        return n > 0 ? n - 1 : positions.length + n;
      });
      for (let k = 1; k < idx.length - 1; k++) indices.push([idx[0], idx[k], idx[k + 1]]);
    }
  }
  return { positions, indices };
}

export class MeshSurface {
  constructor(objTextOrData, { cell = 4.0 } = {}) {
    const d = typeof objTextOrData === 'string' ? parseOBJ(objTextOrData) : objTextOrData;
    this.pos = d.positions;
    this.tris = d.indices;
    this.cell = cell;
    this._computeNormals();
    this._buildHash();
    const ys = this.pos.map((p) => p[1]);
    this.yMin = Math.min(...ys);
    this.yMax = Math.max(...ys);
  }

  _computeNormals() {
    this.triNormal = this.tris.map(([i, j, k]) =>
      norm(cross(sub(this.pos[j], this.pos[i]), sub(this.pos[k], this.pos[i]))));
    // area-weighted vertex normals, then force outward (away from the y axis)
    const vn = this.pos.map(() => [0, 0, 0]);
    this.tris.forEach(([i, j, k], t) => {
      const a = 0.5 * len(cross(sub(this.pos[j], this.pos[i]), sub(this.pos[k], this.pos[i])));
      for (const v of [i, j, k]) {
        vn[v][0] += this.triNormal[t][0] * a;
        vn[v][1] += this.triNormal[t][1] * a;
        vn[v][2] += this.triNormal[t][2] * a;
      }
    });
    this.vertNormal = vn.map((n, i) => {
      let m = norm(n);
      const r = [this.pos[i][0], 0, this.pos[i][2]];
      if (dot(m, r) < 0) m = mul(m, -1);
      return m;
    });
    // consistent outward triangle normals too
    this.triNormal = this.triNormal.map((n, t) => {
      const c = this.triCentroid(t);
      return dot(n, [c[0], 0, c[2]]) < 0 ? mul(n, -1) : n;
    });
  }

  triCentroid(t) {
    const [i, j, k] = this.tris[t];
    return mul(add(add(this.pos[i], this.pos[j]), this.pos[k]), 1 / 3);
  }

  _buildHash() {
    this.hash = new Map();
    const c = this.cell;
    const key = (x, y, z) => `${Math.floor(x / c)},${Math.floor(y / c)},${Math.floor(z / c)}`;
    this._key = key;
    this.tris.forEach((tri, t) => {
      // insert into every cell the triangle's AABB touches
      const ps = tri.map((i) => this.pos[i]);
      const lo = [0, 1, 2].map((d) => Math.floor(Math.min(...ps.map((p) => p[d])) / c));
      const hi = [0, 1, 2].map((d) => Math.floor(Math.max(...ps.map((p) => p[d])) / c));
      for (let i = lo[0]; i <= hi[0]; i++)
        for (let j = lo[1]; j <= hi[1]; j++)
          for (let k = lo[2]; k <= hi[2]; k++) {
            const kk = `${i},${j},${k}`;
            if (!this.hash.has(kk)) this.hash.set(kk, []);
            this.hash.get(kk).push(t);
          }
    });
  }

  closestPoint(p) {
    const c = this.cell;
    const cx = Math.floor(p[0] / c), cy = Math.floor(p[1] / c), cz = Math.floor(p[2] / c);
    let bestQ = null, bestD2 = Infinity, bestT = -1;
    for (let r = 1; r <= 8; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
        if (r > 1 && Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) < r) continue;
        const bucket = this.hash.get(`${cx + i},${cy + j},${cz + k}`);
        if (!bucket) continue;
        for (const t of bucket) {
          const [a, b, cc] = this.tris[t].map((x) => this.pos[x]);
          const q = closestOnTri(p, a, b, cc);
          const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
          if (d2 < bestD2) { bestD2 = d2; bestQ = q; bestT = t; }
        }
      }
      // one extra ring past the first hit, so we do not stop on a far face of a near cell
      if (bestQ && Math.sqrt(bestD2) < (r - 1) * c) break;
    }
    if (!bestQ) {                                    // brute force fallback
      for (let t = 0; t < this.tris.length; t++) {
        const [a, b, cc] = this.tris[t].map((x) => this.pos[x]);
        const q = closestOnTri(p, a, b, cc);
        const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
        if (d2 < bestD2) { bestD2 = d2; bestQ = q; bestT = t; }
      }
    }
    const n = this.triNormal[bestT];
    return { point: bestQ, normal: n, tri: bestT, dist: Math.sqrt(bestD2), signed: dot(sub(p, bestQ), n) };
  }

  closestOnOffset(p, ease = 0.6) {
    const c = this.closestPoint(p);
    return { point: add(c.point, mul(c.normal, ease)), normal: c.normal, signed: c.signed - ease };
  }

  /** u = 0 at centre front, increasing to the wearer's left. Matches Torso. */
  static dir(u) { const a = u * Math.PI * 2; return [-Math.sin(a), 0, Math.cos(a)]; }

  /** Outermost ray hit from the central axis -- a cylindrical parametrisation. */
  point(u, v) {
    const y = this.yMin + clamp(v, 0, 1) * (this.yMax - this.yMin);
    const o = [0, y, 0], d = MeshSurface.dir(u);
    let bestT = -1;
    for (let t = 0; t < this.tris.length; t++) {
      const [a, b, c] = this.tris[t].map((x) => this.pos[x]);
      const e1 = sub(b, a), e2 = sub(c, a);
      const h = cross(d, e2), det = dot(e1, h);
      if (Math.abs(det) < 1e-9) continue;
      const f = 1 / det, s = sub(o, a);
      const uu = f * dot(s, h);
      if (uu < 0 || uu > 1) continue;
      const q = cross(s, e1);
      const vv = f * dot(d, q);
      if (vv < 0 || uu + vv > 1) continue;
      const tt = f * dot(e2, q);
      if (tt > 1e-6 && tt > bestT) bestT = tt;
    }
    if (bestT < 0) return [0, y, 0];
    return add(o, mul(d, bestT));
  }

  normal(u, v) { return this.closestPoint(this.point(u, v)).normal; }

  frame(u, v) {
    const e = 2e-3;
    const du = norm(sub(this.point(u + e, v), this.point(u - e, v)));
    const n = this.normal(u, v);
    const dv = norm(cross(n, du));
    return [du, dv, n];
  }

  girthAt(v, steps = 360) {
    let p = 0, prev = this.point(0, v);
    for (let i = 1; i <= steps; i++) {
      const q = this.point(i / steps, v);
      p += len(sub(q, prev)); prev = q;
    }
    return p;
  }

  mesh() {
    const positions = [], normals = [], indices = [];
    this.pos.forEach((p, i) => {
      positions.push(p[0], p[1], p[2]);
      const n = this.vertNormal[i];
      normals.push(n[0], n[1], n[2]);
    });
    this.tris.forEach((t) => indices.push(t[0], t[1], t[2]));
    return { positions, normals, indices, uvs: null };
  }
}
