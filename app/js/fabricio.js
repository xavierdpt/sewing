// Making, saving and loading a cloth.
//
// The seven presets in `cloth.js` are examples, not a catalogue. Someone with
// a bolt of something on the table wants to put ITS numbers in and see how it
// hangs, and until now the only way was to edit `FABRICS` in the source.
//
// WHAT A FABRIC IS HERE, AND WHY IT IS NOT BLENDER'S PARAMETER SET.
//
// Every field below is a quantity you can measure, look up, or hand to a
// textile lab and get back:
//
//   gsm            a kitchen scale and a 10 cm square
//   bendLengthCm   ASTM D1388: slide a strip off a table until the tip
//                  droops 41.5 degrees; half that length. `tests >
//                  cantilever (Peirce)` runs the same test on the simulated
//                  cloth, so the two numbers are directly comparable
//   maxStrain      a tensile test, or the published floor for the class
//   shearLockDeg   a square of cloth and a protractor
//   friction, damp the two that are not independently measurable here, and
//                  are marked as such
//
// Blender's cloth settings are the alternative and were considered: 61
// properties on `ClothSettings` plus 13 on `ClothCollisionSettings`. They are
// dimensionless solver gains -- `tension_stiffness = 15`, `bending_stiffness
// = 0.5` -- with no unit and no published value for any real cloth.
//
// 2026-10-18 settled the argument on evidence rather than taste. The presets
// looked wrong for days; the cause was `BEND_SCALE`, a solver constant, out
// by a factor of 16 (docs/18-validation.md 6.12). It was findable because
// `bendLengthCm` has a published range to be wrong against: poplin read
// 3.93 cm where the literature says 1.5-2.0. **There is no published band for
// `tension_stiffness = 15`**, so the same defect expressed in Blender's
// parameters would have been invisible. A fabric record whose numbers cannot
// be wrong is a fabric record that cannot find a bug.
//
// So the physical set is what is authored, and anything Blender needs is
// DERIVED from it -- `clothSettings()` in drapejob.js already does exactly
// that -- with room for a per-fabric override where the derivation is known
// to be poor. The override layer is not built yet; this file is the record
// and its storage.
//
// Storage follows `formio.js` exactly, because a saved cloth and a saved
// dress form are the same kind of thing: slow to produce, cheap to lose, and
// worth nothing if the format drifts.
//
// No three.js: the viewer and node both read and write these.

import { FABRICS } from './cloth.js';

export const FABRIC_FORMAT = 'triangulated-bodice-fabric/1';

/**
 * The authored fields, with the ranges a slider should offer and a note on
 * where each number comes from. `measurable` is false for the two that are
 * tuning rather than measurement, so the UI can say so instead of implying
 * a tape measure exists for them.
 */
export const FABRIC_FIELDS = {
  gsm: {
    min: 20, max: 600, step: 5, measurable: true,
    note: 'areal density: weigh a 10 cm square, multiply by 100',
  },
  bendLengthCm: {
    min: 0.3, max: 8, step: 0.1, measurable: true,
    note: 'Peirce bending length, ASTM D1388. tests > cantilever measures it',
  },
  maxStrain: {
    min: 0.01, max: 0.4, step: 0.005, measurable: true,
    note: 'how far it stretches before it stops: 6.1 % is the measured woven floor',
  },
  shearLockDeg: {
    min: 2, max: 60, step: 1, measurable: true,
    note: 'trellis locking angle: shear a square until the weave jams',
  },
  stretch: {
    min: 1e-8, max: 1e-4, step: 1e-8, measurable: false,
    note: 'membrane compliance. Not independently measured here -- see docs/18 step 4',
  },
  friction: {
    min: 0.05, max: 0.9, step: 0.05, measurable: false,
    note: 'against the body. Tuned, not measured',
  },
  damp: {
    min: 0.3, max: 0.99, step: 0.01, measurable: false,
    note: 'internal viscosity. Tuned against the drop test',
  },
};

/** A new cloth, as a copy of an existing one. */
export function fabricFrom(name, newName) {
  const base = FABRICS[name];
  if (!base) throw new Error(`no such fabric: ${name}`);
  const out = { name: newName || `${name} (copy)` };
  for (const k of Object.keys(FABRIC_FIELDS)) {
    if (base[k] !== undefined) out[k] = base[k];
  }
  return out;
}

/**
 * Check a fabric before it is used.
 *
 * Returns a list of complaints, empty if it is sound. Refusing is the
 * caller's choice -- a cloth outside these ranges is unusual, not
 * impossible, and someone simulating paper or sheet steel has a reason.
 */
export function checkFabric(f) {
  const bad = [];
  if (!f.name || !String(f.name).trim()) bad.push('it needs a name');
  for (const [k, spec] of Object.entries(FABRIC_FIELDS)) {
    const v = f[k];
    if (v === undefined || v === null) { bad.push(`${k} is missing`); continue; }
    if (typeof v !== 'number' || !Number.isFinite(v)) { bad.push(`${k} is not a number`); continue; }
    if (v < spec.min || v > spec.max) {
      bad.push(`${k} is ${v}, outside the usual ${spec.min} to ${spec.max}`);
    }
  }
  return bad;
}

export function exportFabricJSON(f, meta = {}) {
  const out = {
    format: FABRIC_FORMAT,
    saved: new Date().toISOString().slice(0, 10),
    meta,
    name: f.name,
  };
  for (const k of Object.keys(FABRIC_FIELDS)) out[k] = f[k];
  return out;
}

/**
 * Read a saved cloth back.
 *
 * Unknown keys are dropped and reported rather than carried through, the
 * same as `importFormJSON`: a key the solver does not read means nothing,
 * and keeping it silently lets a typo ride along in every later save.
 */
export function importFabricJSON(data) {
  const d = typeof data === 'string' ? JSON.parse(data) : data;
  if (!d || d.format !== FABRIC_FORMAT) {
    throw new Error(`not a fabric file (format: ${(d && d.format) || 'missing'})`);
  }
  const f = { name: d.name || 'unnamed' };
  const dropped = [];
  for (const k of Object.keys(d)) {
    if (['format', 'saved', 'meta', 'name'].includes(k)) continue;
    if (FABRIC_FIELDS[k]) f[k] = d[k]; else dropped.push(k);
  }
  return { fabric: f, meta: d.meta || {}, dropped };
}

/** A filename that says what it is, as `formio.formFileName` does. */
export function fabricFileName(f) {
  const slug = String(f.name || 'fabric').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'fabric'}-${f.gsm}gsm.json`;
}
