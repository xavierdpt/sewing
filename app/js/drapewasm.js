// Drape in the browser, with no side-car.
//
// Same shape as remote.js's drapeRemote: take a welded assembly and a body
// surface, give back settled vertices in the SAME ORDER, so the caller does
// not care which of the three backends produced them. That symmetry is the
// point -- it makes them comparable, and it makes switching reversible.
//
// WHAT THIS IS NOT. The side-car runs Blender, which tests triangle against
// triangle through a BVH and has self-collision. This runs sewcloth, which
// tests points against a signed distance field and has no self-collision at
// all. A skirt folding onto itself will pass through itself here and will
// not there. The trade is latency: Blender takes ~30 s for a six-second
// fall, this takes milliseconds a frame, which is the difference between
// watching a drape and waiting for one.

import { SDF, trianglesOf } from './sdf.js';
import { WasmCloth, loadSewcloth } from './wasmcloth.js';

let modulePromise = null;

/** The module is loaded once and kept: instantiating wasm costs more than
 *  every drape that follows it. */
export function sewclothModule(url) {
  if (!modulePromise) modulePromise = loadSewcloth(url);
  return modulePromise;
}

/** Supply the module instead of loading it. The browser build is an ES
 *  module; node tests load the CommonJS one and hand it over here, so the
 *  drape path itself is exercised rather than mocked. */
export function setSewclothModule(mod) {
  modulePromise = Promise.resolve(mod);
}

const fieldCache = new WeakMap();

/** The body's field, built once per surface and kept against it. Rebuilding
 *  a 0.9 MB grid for every drape would cost more than the drape. */
export function fieldFor(surface, { cell = 1.0, nu = 96, nv = 64 } = {}) {
  const hit = fieldCache.get(surface);
  if (hit && hit.cell === cell) return hit.sdf;
  const sdf = new SDF(trianglesOf(surface, nu, nv), { cell });
  fieldCache.set(surface, { cell, sdf });
  return sdf;
}

/**
 * @param asm       the welded assembly: verts and edges
 * @param surface   the body, or null to drape against nothing
 * @param opts.seconds   simulated seconds
 * @param opts.fps       frames per simulated second
 * @param opts.substeps  solver substeps per frame
 * @param opts.pinned    vertex indices held in place
 * @param opts.onFrame   called with (verts, frameIndex) as it goes, so the
 *                       viewer can show the fall rather than its result
 * @returns {verts, frames, ms, report}
 */
export async function drapeWasm(asm, surface, opts = {}) {
  const {
    // EIGHT, and the four below it is a measurement not a taste. On the
    // four-panel skirt at 5 cm edges, 4 substeps leaves 2 vertices 0.378 cm
    // INSIDE the body; 8 leaves none, at 0.081 cm clear. 8, 16 and 32 agree
    // to three decimals, so it is converged at 8. The cost is 2.75 ms a
    // frame against a 16.7 ms real-time budget.
    seconds = 6, fps = 30, substeps = 8, pinned = [],
    cell = 1.0, onFrame = null, fabric = {},
  } = opts;

  // SELF-COLLISION DISTANCE FROM THE MESH, not from a constant. It wants to
  // be a fraction of the edge length: larger and neighbouring vertices fight
  // each other, smaller and two layers slide through between samples. The
  // garment knows its own edge length, so ask it rather than guess.
  const self = { ...fabric };
  if (self.selfCollision && !(self.selfDistance > 0)) {
    let total = 0, count = 0;
    for (const e of (asm.edges.values ? asm.edges.values() : asm.edges)) {
      const a = asm.verts[e.a], b = asm.verts[e.b];
      total += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      count++;
    }
    self.selfDistance = count ? (total / count) * 0.6 : 0;
  }

  const mod = await sewclothModule(opts.moduleUrl);
  const sdf = surface ? fieldFor(surface, { cell }) : null;

  const cloth = new WasmCloth(mod, {
    verts: asm.verts,
    edges: asm.edges.values ? asm.edges.values() : asm.edges,
    sdf,
    fabric: self,
  });
  for (const i of pinned) cloth.pin(i, true);

  const frames = Math.max(1, Math.round(seconds * fps));
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  for (let f = 0; f < frames; f++) {
    cloth.step(1 / fps, substeps);
    if (onFrame) onFrame(cloth.positions(), f);
  }
  const ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;

  // Copied out, not handed over: the view dies with the cloth, and a caller
  // holding it after dispose() would be reading freed memory.
  const flat = cloth.positions();
  const verts = new Array(asm.verts.length);
  for (let i = 0; i < verts.length; i++) {
    verts[i] = [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]];
  }
  const report = cloth.report();
  cloth.dispose();

  return { verts, frames, ms, msPerFrame: ms / frames, report };
}
