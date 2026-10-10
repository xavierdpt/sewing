// Saving and loading the dress form.
//
// A fitted body is work: measurements taken with a tape, a posture and a
// belly chosen by eye, an asymmetry nobody's size chart has. Losing it on a
// page reload is the kind of loss that makes people stop measuring properly.
//
// What is saved is the MEASUREMENT SET -- `body.m`, the small flat object
// everything else is derived from -- and nothing else. The mesh, the rings
// and the landmark table are rebuilt from it by `Body.build()`, so a form
// saved today still loads after the body model changes, which a saved mesh
// would not.
//
// No three.js here: the viewer and `node` both read and write these files.

import { DEFAULT_BODY } from './body.js';

export const FORM_FORMAT = 'triangulated-bodice-form/1';

/**
 * @param {import('./body.js').Body} body
 * @param {object} [meta]  free-form notes: a name, who it is for, a date
 */
export function exportFormJSON(body, meta = {}) {
  return {
    format: FORM_FORMAT,
    saved: new Date().toISOString().slice(0, 10),
    meta,
    pose: body.poseName || null,
    m: { ...body.m },
  };
}

/**
 * Read a saved form back.
 *
 * Unknown keys are dropped rather than carried through: a key that is not in
 * DEFAULT_BODY means nothing to `build()`, and silently keeping it would let
 * a typo ride along in every later save of the same form.
 *
 * @returns {{ m: object, pose: string|null, meta: object, dropped: string[] }}
 */
export function importFormJSON(data) {
  const d = typeof data === 'string' ? JSON.parse(data) : data;
  if (!d || d.format !== FORM_FORMAT) {
    throw new Error(`not a dress form file (format: ${(d && d.format) || 'missing'})`);
  }
  if (!d.m || typeof d.m !== 'object') throw new Error('the form has no measurements');

  const m = {};
  const dropped = [];
  for (const [k, v] of Object.entries(d.m)) {
    if (!(k in DEFAULT_BODY)) { dropped.push(k); continue; }
    if (typeof DEFAULT_BODY[k] === 'number' && !Number.isFinite(+v)) {
      throw new Error(`measurement ${k} is not a number: ${JSON.stringify(v)}`);
    }
    m[k] = typeof DEFAULT_BODY[k] === 'number' ? +v : v;
  }
  if (dropped.length) console.warn(`ignored unknown measurements: ${dropped.join(', ')}`);
  return { m, pose: d.pose || null, meta: d.meta || {}, dropped };
}

/** Apply a loaded form to a Body in place, poses and all. */
export function applyForm(body, loaded) {
  body.update(loaded.m);
  if (loaded.pose) body.poseName = loaded.pose;
  return body;
}

/** A filename that says which body it is, without a dialog to type one in. */
export function formFileName(body, name = '') {
  const M = body.cm();
  const slug = (name || 'form').trim().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '');
  return `${slug}-${Math.round(M.bust)}-${Math.round(M.waist)}-${Math.round(M.lowHip)}.json`;
}
