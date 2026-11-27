// The Peirce cantilever: bending length as a textile lab measures it.
//
// A strip is clamped at one end and allowed to droop. The specimen is slid
// out until THE TIP reaches 41.5 degrees below horizontal, and the bending
// length is half that free length. The 41.5 degrees is Peirce's, chosen so
// that `c = L/2` falls out of the small-deflection solution.
//
// WHY THIS LIVES IN app/js AND NOT IN tools/. It was in `tools/fabric.mjs`,
// and `test/run.mjs` had a SECOND cantilever of its own -- a different
// measurement wearing the same name. The gate's version clamps a fixed 16 cm
// overhang and reports the arclength at which the CHORD from the clamp
// crosses 41.5 degrees, which todos/18-validation.md 6.9 withdrew on
// 2026-10-11 as not a material property: the strip's whole shape depends on
// how much of it is hanging. `tools/fabric.mjs` was fixed that day; the gate
// was not, and went on passing `a fabric bends by as much as it was asked to`
// at 1.77 cm while the material property read 0.93 cm against an asked 1.7
// (todos/18-validation.md 6.13). One measurement, one implementation, importable
// by both -- the same rule that keeps the viewer and the headless path on the
// same code.
import { rectanglePattern } from './testpieces.js';
import { sewFlat } from './patternio.js';
import { Cloth, FABRICS } from './cloth.js';

const DEG = Math.PI / 180;

/**
 * Published Peirce bending lengths, cm, by fabric.
 *
 * Moved here from `tools/fabric.mjs` on 2026-10-18 so the viewer can quote
 * the same band the tool does. A second copy in the page would be a second
 * thing to update, and the pattern of this project's defects is that the
 * copy nobody updates is the one being read.
 *
 * Office paper is in the table on purpose: it is the reference for "this is
 * behaving like card", and the question that opened this work was whether
 * the cloth behaves like linen or like cardboard.
 */
export const PUBLISHED_BEND = {
  'cotton poplin': [1.5, 2.0],
  linen: [2.0, 2.6],
  'wool crepe': [1.6, 2.2],
  'silk habotai': [0.9, 1.4],
  'cotton jersey': [1.1, 1.8],
  denim: [2.8, 3.8],
  'interfaced twill': [4.0, 6.0],
  '(80 gsm office paper)': [5.0, 7.0],
};

/** Peirce's angle. `c = L/2` is derived for this value and no other. */
export const PEIRCE_DEG = 41.5;

/**
 * Substeps, and why the default is 20 rather than the solver's own 10.
 *
 * THE MEASUREMENT IS NOT CONVERGED IN SUBSTEPS. Cotton poplin, same fabric,
 * same auto mesh, measured 2026-10-18:
 *
 *     substeps 10  ->  c = 0.571 cm
 *     substeps 20  ->  c = 0.930 cm
 *
 * A 63 % change in a material property from a solver setting. 20 is what
 * `tools/fabric.mjs` has always used and therefore what every recorded
 * bending number in todos/18-validation.md was taken at, so it is the default
 * here: a module whose default silently differed from the instrument's would
 * make the two disagree again, which is the exact fault this file was
 * extracted to end. It is NOT a claim that 20 is enough --
 * `--calibrated` uses 160, and todos/18-validation.md 8.5 accepts the
 * non-convergence as a known deficit.
 */
export const SUBSTEPS = 20;

/**
 * The tip angle of a clamped strip of a given free length.
 *
 * @returns {number|null} degrees below horizontal, or null if the centre line
 *   could not be found (a specimen too short for the mesh)
 */
export function tipAngle(fabric, L, {
  bend = null, edge = 0.2, widthCm = 5, substeps = SUBSTEPS, bendSweeps = 8,
  stretchSweeps = null, maxSeconds = 10, bendScale = null,
} = {}) {
  const clampCm = Math.max(3, L);
  const pattern = rectanglePattern({ width: widthCm, height: L + clampCm, edge });
  const asm = sewFlat(pattern, { y: 0 });
  const z0 = -(L + clampCm) / 2;
  const clampTo = z0 + clampCm;
  asm.verts.forEach((p, i) => { asm.pinned[i] = p[2] <= clampTo + 1e-6; });

  // The centreline is chosen on the FLAT strip, before anything moves: after
  // the droop the vertices are no longer at tidy coordinates and selecting
  // them by their deformed positions quietly selects nothing.
  const xs = [...new Set(asm.verts.map((p) => +p[0].toFixed(5)))];
  const xMid = xs.reduce((a, x) => (Math.abs(x) < Math.abs(a) ? x : a), xs[0]);
  const line = asm.verts
    .map((p, i) => ({ i, x: p[0], z: p[2] }))
    .filter((q) => Math.abs(q.x - xMid) < 1e-6 && q.z >= clampTo - 1e-6)
    .sort((a, b) => a.z - b.z)
    .map((q) => q.i);
  if (line.length < 3) return null;

  // No drag and no floor: the specimen hangs in still air off the edge of a
  // table, and a floor within reach would be measuring the table.
  const sim = new Cloth(asm, null, {
    fabric, bend, substeps, bendSweeps, selfCollision: false, floorY: null,
    terminalCmPerSec: 0, linearDragPerSec: 1.0,
    ...(bendScale !== null ? { bendScale } : {}),
    ...(stretchSweeps ? { stretchSweeps } : {}),
  });
  sim.settle({ maxSeconds });
  const o = asm.verts[line[0]], t = asm.verts[line[line.length - 1]];
  const dh = Math.hypot(t[0] - o[0], t[2] - o[2]);
  return Math.atan2(o[1] - t[1], Math.max(1e-9, dh)) / DEG;
}

/**
 * Bending length, by bisecting the free length until the tip reads 41.5 deg.
 *
 * @param {string} fabric
 * @param {object} [opts]
 * @param {number} [opts.bend]  override the preset's bending length
 * @param {number} [opts.rows]  elements across the ASKED bending length. The
 *   mesh must not depend on the unknown: sizing it as `L / rows` makes the
 *   measurement chase its own tail, because a shorter trial gives a finer
 *   mesh, a finer mesh gives a limper cloth (todos/18-validation.md 6.8), and a
 *   limper cloth droops at a shorter length still. Silk habotai ran away to a
 *   0.45 cm overhang on 0.037 cm triangles.
 * @param {number} [opts.edge]  fixed element size, overriding `rows`. Note
 *   that `rows` holds `edge / c` CONSTANT across fabrics, which is why the
 *   cantilever never saw the mesh dependence it was calibrating against
 *   (todos/18-validation.md 6.12).
 * @param {number} [opts.maxEvals] settle budget, in trials
 */
export function peirce(fabric, {
  bend = null, rows = 12, edge = null, maxEvals = 24, widthCm = 5,
  substeps = SUBSTEPS, bendSweeps = 8, stretchSweeps = null, maxSeconds = 10,
  bendScale = null,
} = {}) {
  let evals = 0;
  const ask = bend ?? FABRICS[fabric].bendLengthCm;
  const eff = edge ?? Math.max(0.02, ask / rows);
  const at = (L) => {
    evals++;
    return tipAngle(fabric, L, {
      bend, edge: eff, widthCm, substeps, bendSweeps, stretchSweeps, maxSeconds,
      bendScale,
    });
  };

  // Centred on the answer Peirce's own definition predicts, L = 2c, rather
  // than reaching five times past it: the trials at large L carry the whole
  // cost, because the mesh is fixed and the specimen is what grows.
  let lo = Math.max(0.3, 1.2 * ask), hi = Math.max(lo * 1.5, 3.2 * ask);
  let aLo = at(lo), aHi = at(hi);
  while (aLo !== null && aLo > PEIRCE_DEG && lo > 0.15 && evals < maxEvals) {
    hi = lo; aHi = aLo; lo /= 2; aLo = at(lo);
  }
  while (aHi !== null && aHi < PEIRCE_DEG && hi < 80 && evals < maxEvals) {
    lo = hi; aLo = aHi; hi *= 2; aHi = at(hi);
  }
  if (aLo === null || aHi === null || aLo > PEIRCE_DEG || aHi < PEIRCE_DEG) {
    return { bendLengthCm: null, overhangCm: null, evals, bracketed: false };
  }
  while (evals < maxEvals && (hi - lo) > 0.01 * Math.max(0.3, lo)) {
    const span = aHi - aLo;
    let mid = span > 1e-9 ? lo + (PEIRCE_DEG - aLo) * (hi - lo) / span : (lo + hi) / 2;
    mid = Math.min(hi - 1e-4, Math.max(lo + 1e-4, mid));
    const a = at(mid);
    if (a === null) break;
    if (a < PEIRCE_DEG) { lo = mid; aLo = a; } else { hi = mid; aHi = a; }
  }
  const L = (lo + hi) / 2;
  return {
    converged: (hi - lo) <= 0.01 * Math.max(0.3, lo),
    bracketCm: +(hi - lo).toFixed(3),
    bendLengthCm: +(L / 2).toFixed(3),
    overhangCm: +L.toFixed(2),
    rowCm: +eff.toFixed(3),
    rowsSpanningL: +(L / eff).toFixed(1),
    evals,
    bracketed: true,
  };
}
