// Minimal vector helpers. Vectors are plain [x,y,z] arrays so that every
// geometry module stays free of three.js and can run under plain node.

export const v3  = (x = 0, y = 0, z = 0) => [x, y, z];
export const cp  = (a) => [a[0], a[1], a[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len  = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];
export const addTo = (a, b, s = 1) => { a[0] += b[0] * s; a[1] += b[1] * s; a[2] += b[2] * s; return a; };

export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Angle at the corner opposite side `a`, in a triangle with sides a,b,c. */
export function cornerAngle(a, b, c) {
  return Math.acos(clamp((b * b + c * c - a * a) / (2 * b * c), -1, 1));
}

/** Heron's formula. */
export function triArea(a, b, c) {
  const s = (a + b + c) / 2;
  return Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
}

/**
 * Orthonormal frame with `n` as the third axis.
 */
export function frameFromNormal(n) {
  const nn = norm(n);
  const up = Math.abs(nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const t = norm(cross(up, nn));
  const b = cross(nn, t);
  return [t, b, nn];
}

/** Catmull-Rom through an array of scalars, t in [0, n-1]. */
export function catmull(vals, t) {
  const n = vals.length;
  const i = clamp(Math.floor(t), 0, n - 2);
  const f = clamp(t - i, 0, 1);
  const p0 = vals[Math.max(0, i - 1)], p1 = vals[i];
  const p2 = vals[i + 1], p3 = vals[Math.min(n - 1, i + 2)];
  return 0.5 * ((2 * p1) + (-p0 + p2) * f +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
    (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}

/**
 * Monotone cubic interpolation (Fritsch-Carlson) through equally spaced values.
 *
 * Catmull-Rom overshoots wherever the data turns sharply, and the ring stack of
 * a torso turns very sharply indeed between the shoulder and the neck -- which
 * produced a body with wings. A monotone interpolant cannot overshoot, so the
 * surface stays inside the measurements that define it.
 */
export function monotone(vals, t) {
  const n = vals.length;
  if (n < 2) return vals[0] ?? 0;
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push(vals[i + 1] - vals[i]);
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      m[i] = (d[i - 1] + d[i]) / 2;
      const lim = 3 * Math.min(Math.abs(d[i - 1]), Math.abs(d[i]));
      if (Math.abs(m[i]) > lim) m[i] = Math.sign(m[i]) * lim;
    }
  }
  const i = clamp(Math.floor(t), 0, n - 2);
  const u = clamp(t - i, 0, 1);
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vals[i]
       + (u3 - 2 * u2 + u) * m[i]
       + (-2 * u3 + 3 * u2) * vals[i + 1]
       + (u3 - u2) * m[i + 1];
}

export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
