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

import { SDF } from './sdf.js';
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
 *  a 0.9 MB grid for every drape would cost more than the drape.
 *
 *  SDF.fromBody, not a field of the torso's triangles: the arms and the legs
 *  are capsules that are not on the parametric surface, and a field built
 *  from the surface alone does not contain them. That is not a detail of
 *  resolution -- it is the body being absent. Draped against the torso-only
 *  field the skirt put 7.08 % of its area inside the figure, 8.97 cm at the
 *  worst, and 92 % of that was limb (`node tools/wasmclip.mjs`). */
export function fieldFor(surface, { cell = 1.0, nu = 96, nv = 64 } = {}) {
  const hit = fieldCache.get(surface);
  if (hit && hit.cell === cell) return hit.sdf;
  const sdf = SDF.fromBody(surface, { cell, nu, nv });
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

  // DISTANCES FROM THE MESH, not from constants. Both of the ones below want
  // to be a fraction of the edge length, because both are about what happens
  // BETWEEN the points the solver samples.
  const self = { ...fabric };
  let total = 0, count = 0;
  for (const e of (asm.edges.values ? asm.edges.values() : asm.edges)) {
    const a = asm.verts[e.a], b = asm.verts[e.b];
    total += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    count++;
  }
  const meanEdge = count ? total / count : 0;
  // Self-collision distance: larger and neighbouring vertices fight each
  // other, smaller and two layers slide through between samples.
  if (self.selfCollision && !(self.selfDistance > 0)) {
    self.selfDistance = meanEdge * 0.6;
  }
  // CONTACT THICKNESS HAS A FLOOR, set by the two things that decide what
  // happens between the samples: the garment's triangle and the body's cell.
  // sewcloth tests points -- vertices and edge midpoints -- so the inside of
  // a triangle is never asked about, and it sags between the points that
  // were. How far it can sag before it is visible scales with the triangle,
  // which is why a constant is the wrong shape of answer.
  //
  // The body is a sampled field as well, so the margin has to clear the
  // field's own error near the skin, which is of order its cell.
  //
  // Measured by `node tools/wasmclip.mjs`, four-panel skirt, whole-body
  // field at 1 cm, as area of cloth inside the body / deepest sample:
  //
  //     triangles   thickness 0.35 cm      thickness 0.80 cm
  //     2 cm        0.69 % / 1.12 cm       0.00 % / nothing inside
  //     3 cm        0.80 % / 1.08 cm       0.00 % / nothing inside
  //     5 cm        --                     0.00 % / nothing inside
  //
  // Same milliseconds a frame either way: 8.6 at 3 cm, 21.8 at 2 cm. So this
  // costs nothing and it is the difference between a clean drape and a
  // visibly clipping one. The viewer's own 0.4 cm thickness is a figure for
  // the cloth, not a sampling margin, and it is raised rather than
  // overridden: a caller asking for more than the floor gets what it asked.
  const floor = Math.max(meanEdge * 0.25, cell * 0.8);
  if (!(self.thickness >= floor)) self.thickness = +floor.toFixed(3);

  const mod = await sewclothModule(opts.moduleUrl);
  const built = buildDrapeCloth(mod, asm, surface, { ...opts, fabric: self, cell });
  const cloth = built.cloth;
  const frames = Math.max(1, Math.round(seconds * fps));
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  for (let f = 0; f < frames; f++) {
    cloth.step(1 / fps, substeps);
    if (onFrame) onFrame(cloth.positions(), f);
  }
  const ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
  const out = readBack(cloth, asm, { frames, ms });
  cloth.dispose();
  return out;
}

/**
 * The same cloth, built but NOT stepped.
 *
 * Pulled out of `drapeWasm` because a drape that runs to completion inside one
 * function call blocks the page for as long as it takes -- 180 frames at
 * 74 ms is thirteen seconds of frozen HUD, and then the finished garment
 * appears without ever having been seen to fall. Reported exactly that way:
 * *"X freezes the hud for about 15 seconds, then displays the end results
 * instead of animating it"*. The viewer steps this one from its own render
 * loop instead, one frame at a time, the way it now sews; the headless
 * callers keep the loop, because nothing is watching them.
 */
export function buildDrapeCloth(mod, asm, surface, opts = {}) {
  const { cell = 1.0, pinned = [], fabric = {} } = opts;
  const sdf = surface ? fieldFor(surface, { cell }) : null;
  const cloth = new WasmCloth(mod, {
    verts: asm.verts,
    edges: asm.edges.values ? asm.edges.values() : asm.edges,
    sdf,
    fabric,
  });
  // DOWN IS -Y HERE. sewcloth's default agrees as of 2026-10-17, and this
  // says so anyway: when it did not, every drape in the viewer pulled the
  // cloth along the body's back and the garment came out flat at the front
  // with the cloth piled up behind. A one-line assumption that nothing
  // repeated is a one-line assumption nobody checks.
  cloth.setGravity(0, -981, 0);
  for (const i of pinned) cloth.pin(i, true);
  return { cloth, sdf };
}

/** Copy the solver's positions out, with the report. Copied, not handed over:
 *  the view dies with the cloth, and a caller holding it after dispose()
 *  would be reading freed memory. */
export function readBack(cloth, asm, { frames = 0, ms = 0 } = {}) {
  const flat = cloth.positions();
  const verts = new Array(asm.verts.length);
  for (let i = 0; i < verts.length; i++) {
    verts[i] = [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]];
  }
  return {
    verts, frames, ms, msPerFrame: frames ? ms / frames : 0, report: cloth.report(),
  };
}
