// The tile library from docs/01-geometry.md.
//
// Sides are given in MODULE units; multiply by `u` (cm) for real lengths.
// Side i is the side OPPOSITE vertex i, which is the convention used
// throughout assembly.js.

import { cornerAngle, triArea, DEG } from './geom.js';

const T = (id, kind, sides, note = '') => {
  const [a, b, c] = sides;
  const angles = [cornerAngle(a, b, c), cornerAngle(b, c, a), cornerAngle(c, a, b)];
  return {
    id, kind, sides, note,
    angles,                                   // radians, angles[i] at vertex i
    anglesDeg: angles.map((x) => x * DEG),
    area: triArea(a, b, c),
    perimeter: a + b + c,
  };
};

export const LIBRARY = [
  T('R345',  'right',       [3, 4, 5],  'the generator'),
  T('R6810', 'right',       [6, 8, 10], 'coarse regions; = 4x R345 in area'),
  T('E3',    'equilateral', [3, 3, 3]),
  T('E4',    'equilateral', [4, 4, 4]),
  T('E5',    'equilateral', [5, 5, 5]),
  T('I334',  'isoceles',    [3, 3, 4]),
  T('I443',  'isoceles',    [4, 4, 3]),
  T('I553',  'isoceles',    [5, 5, 3]),
  T('I554',  'isoceles',    [5, 5, 4]),
  T('I556',  'isoceles',    [5, 5, 6], 'two R345 joined on the 4-side'),
  T('I558',  'isoceles',    [5, 5, 8], 'two R345 joined on the 3-side'),
  T('I445',  'isoceles',    [4, 4, 5]),
  T('I335',  'isoceles',    [3, 3, 5]),
];

export const byId = Object.fromEntries(LIBRARY.map((t) => [t.id, t]));

/** Distinct corner angles in the library, in degrees, deduped to 0.01 deg. */
export function angleAlphabet() {
  const s = new Map();
  for (const t of LIBRARY) {
    t.anglesDeg.forEach((a) => s.set(a.toFixed(2), a));
  }
  return [...s.values()].sort((a, b) => a - b);
}

/**
 * Enumerate every multiset of library corner angles that sums to exactly 360
 * degrees -- i.e. every FLAT vertex this library can build.
 * Validates the closure rule derived in docs/01-geometry.md section 2.
 */
export function flatVertices({ maxDegree = 9, tol = 1e-6 } = {}) {
  const alpha = angleAlphabet();
  const out = [];
  const rec = (startIdx, remaining, picked) => {
    if (Math.abs(remaining) < tol) { out.push([...picked]); return; }
    if (picked.length >= maxDegree || remaining < alpha[0] - tol) return;
    for (let i = startIdx; i < alpha.length; i++) {
      if (alpha[i] > remaining + tol) break;
      picked.push(alpha[i]);
      rec(i, remaining - alpha[i], picked);
      picked.pop();
    }
  };
  rec(0, 360, []);
  return out;
}

/** Tiles whose side set contains a side of the given module length. */
export function tilesWithSide(sideLen, tol = 1e-9) {
  const r = [];
  for (const t of LIBRARY) {
    t.sides.forEach((s, i) => {
      if (Math.abs(s - sideLen) < tol) r.push({ tile: t, sideIndex: i });
    });
  }
  return r;
}

/** All distinct side lengths in the library. */
export const SIDE_LENGTHS = [...new Set(LIBRARY.flatMap((t) => t.sides))].sort((a, b) => a - b);
