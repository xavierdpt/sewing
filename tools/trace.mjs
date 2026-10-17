// Trace the whole arrange -> sew -> weld -> drape workflow, in numbers.
//   node tools/trace.mjs                  this project's solver throughout
//   node tools/trace.mjs --sidecar        hand the drape to the side-car
//   node tools/trace.mjs --wasm           drape with sewcloth, as the viewer does
//   node tools/trace.mjs --wasm --cell 0.5   and with a finer body field
//   node tools/trace.mjs --darts          cut asymmetric darts first
//   node tools/trace.mjs --sew-wasm       sew in wasm instead of cloth.js
//   node tools/trace.mjs --json out.json  machine-readable, for diffing runs
//   node tools/trace.mjs --above 20       lift the arrangement 20 cm first
//   node tools/trace.mjs --no-pin         do not pin the waist before the drape
//   node tools/trace.mjs --fabric linen   any key of cloth.js FABRICS
//
// This is what the viewer's J, W and X do, with the state of the garment
// printed at every phase instead of looked at. The headline column is
// CLEARANCE: the signed distance from the cloth surface to the skin, sampled
// over every triangle rather than at its corners (app/js/clearance.js). A
// worst-case number over vertices alone reads 0.00 cm while the body is
// visibly through the cloth; the area fraction inside the body does not.
import { writeFileSync } from 'node:fs';
import { Body } from '../app/js/body.js';
import { Cloth, BodyCollider } from '../app/js/cloth.js';
import { flaredSkirtPattern, waistRing, hemProfile } from '../app/js/skirt.js';
import { layOut, weldStitched } from '../app/js/assemble.js';
import { floorOf } from '../app/js/droptest.js';
import { clearance, offendersOBJ } from '../app/js/clearance.js';
import { asymmetricDarts } from '../app/js/skirtdarts.js';

const args = process.argv.slice(2);
const useSidecar = args.includes('--sidecar');
// The viewer's own drape backend (app/js/drapewasm.js), run from here. Without
// this the table measured a solver the viewer no longer uses for X, which is
// rule 7 with the roles reversed: the headless path has to be able to do what
// the viewer does, or the viewer's clipping cannot be measured at all.
const useWasm = args.includes('--wasm');
// The body field's cell, in cm. sewcloth tests points against a sampled SDF,
// so this is the resolution at which the body exists as far as X is
// concerned -- the number to sweep when the body comes through.
const cellCm = args.includes('--cell') ? +args[args.indexOf('--cell') + 1] : 1.0;
const withDarts = args.includes('--darts');
// W, through sewcloth instead of cloth.js. The two sew the same garment with
// the same algorithm -- the constant-rate feed -- in two implementations, so
// this is the switch that holds them against each other on a real pattern
// rather than on a two-vertex test (docs/19-todo.md item 1 step 4).
const sewInWasm = args.includes('--sew-wasm');
const jsonAt = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const objAt = args.includes('--obj') ? args[args.indexOf('--obj') + 1] : null;
// The arrangement the pieces are sewn in. Lifting it is what someone does by
// hand with "up / down" before pressing W, and it changes what X means: the
// garment is welded where it was put, not where it belongs.
const aboveCm = args.includes('--above') ? +args[args.indexOf('--above') + 1] : 0;
const pinWaist = !args.includes('--no-pin');
const fabric = args.includes('--fabric') ? args[args.indexOf('--fabric') + 1] : 'cotton poplin';

const b = new Body();
b.includeArms = true; b.includeLegs = true;
const collider = new BodyCollider(b);
const waistV = b.landmarkV('waist');
const ring = waistRing(b, { waistV, ease: 1.0 });
const pattern = flaredSkirtPattern({
  panels: 4, waistCm: ring.circumferenceCm, hemCm: 160, lengthCm: 55,
  gather: 1.0, edge: 3.0, waistV,
});

if (withDarts) {
  const cut = asymmetricDarts(pattern);
  console.log(`${cut.darts.length} asymmetric darts, `
    + `${cut.removedCm2} cm2 taken out, intakes `
    + `${cut.darts.map((d) => d.intakeDeg).join(', ')} deg`);
}

const rows = [];
const mark = (phase, asm, sim, extra = {}) => {
  const c = clearance(asm, b, { collider });
  // Where the garment IS, not just how it fits: a garment that never fell is
  // invisible in the clearance columns -- it has no contact to report -- and
  // reads as a perfect drape. The waist height says whether it fell at all.
  const ys = asm.verts.map((p) => p[1]);
  const row = {
    phase,
    seconds: sim ? +sim.time.toFixed(2) : 0,
    vertices: asm.verts.length,
    'top y cm': +Math.max(...ys).toFixed(1),
    'low y cm': +Math.min(...ys).toFixed(1),
    // the clearance tail: what you would see
    'inside area %': c.insideAreaPct,
    'deepest cm': c.deepestCm,
    'median gap cm': c.medianCm,
    'p05 gap cm': c.p05Cm,
    'tris touched': c.trianglesTouched,
    ...extra,
  };
  rows.push(row);
  return c;
};

// ---- J: arrange. rigid placement, nothing simulated.
const laid = layOut(pattern, b, { standoffCm: 6 });
if (aboveCm) for (const v of laid.asm.verts) v[1] += aboveCm;
const gapOf = (verts, st) => {
  const p = verts[st.a], q = verts[st.b];
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
};
const strain = (asm) => +(100 * Math.max(...asm.edgeStrains().map((x) => Math.abs(x.strain)))).toFixed(3);
mark('J arranged', laid.asm, null, {
  'seam gap cm': +Math.max(...laid.stitches.map((st) => gapOf(laid.asm.verts, st))).toFixed(2),
  'strain %': strain(laid.asm),
});

// ---- W: sew. the seams are fed closed at a constant rate.
if (sewInWasm) {
  const { createRequire } = await import('node:module');
  const { readFileSync } = await import('node:fs');
  const require = createRequire(import.meta.url);
  const factory = require('../src/sewcloth/build/sewcloth.cjs');
  const mod = await factory({ wasmBinary: readFileSync('src/sewcloth/build/sewcloth.wasm') });
  const { setSewclothModule } = await import('../app/js/drapewasm.js');
  setSewclothModule(mod);
  const { sewWasm } = await import('../app/js/sewwasm.js');
  const out = await sewWasm(laid.asm, laid.stitches, b, {
    fabric, sewSpeedCmPerSec: 12, maxSeconds: 8,
  });
  mark('W sewn (sewcloth-wasm)', laid.asm, null, {
    'seam gap cm': out.maxGapCm,
    'to go cm': out.feedLeftCm,
    'strain %': strain(laid.asm),
    wall: +(out.ms / 1000).toFixed(1),
    'ms/frame': +out.msPerFrame.toFixed(1),
  });
  console.log(`sewn in wasm: ${out.frames} frames, `
    + `${out.msPerFrame.toFixed(1)} ms/frame`);
  console.table(out.seams);
}

const sew = new Cloth(laid.asm, b, {
  fabric, gravityScale: 0, stitches: laid.stitches,
  selfCollision: false, substeps: 10, sewSpeedCmPerSec: 12, edgeCollision: true,
});
sew.stitchStrength = 1;
sew.startSewing();
// With --sew-wasm the seams are already closed, by sewcloth, above: the Cloth
// is still built because the weld wants its stitch list and its velocities,
// but it must not sew the garment a second time.
let f = 0;
if (!sewInWasm) {
  while (sew.isSewing() && f < 3000) {
    sew.step(1 / 60); f++;
    // a sample mid-way, because the half-sewn state is the one that looks worst
    if (f === 60) {
      mark('W sewing (1 s)', laid.asm, sew, {
        'seam gap cm': +sew.maxStitchGap().toFixed(2),
        'to go cm': +sew.remainingFeedCm().toFixed(1),
        'tension gf': +Math.max(0, ...sew.stitches.filter((s) => s.active).map((s) => s.tensionGf)).toFixed(0),
      });
    }
  }
  mark('W sewn', laid.asm, sew, {
    'seam gap cm': +sew.maxStitchGap().toFixed(3),
    'to go cm': +sew.remainingFeedCm().toFixed(1),
    'strain %': strain(laid.asm),
  });
} else {
  sew.stopSewing();
}

// ---- weld
const w = weldStitched(laid.asm, sew.stitches, { velocities: sew.vel, closedCm: 0.25 });
const waistIds = new Set();
for (const p of pattern.panels) for (const r of p.runs || []) {
  if (r.kind !== 'top') continue;
  for (const i of r.pts) if (laid.v3Of.has(p.pts[i].v3)) waistIds.add(w.map[laid.v3Of.get(p.pts[i].v3)]);
}
if (pinWaist) for (const i of waistIds) w.asm.pinned[i] = true;
mark('welded', w.asm, null, { 'welded %': w.weldedPct });

// ---- X: drape
let final;
if (useSidecar) {
  const { drapeWithBlender } = await import('../sim/drape.mjs');
  const r = drapeWithBlender(w.asm, b, {
    fabric, seconds: 6, pinned: pinWaist ? [...waistIds] : [], selfCollision: true,
  });
  r.verts.forEach((p, i) => { w.asm.verts[i][0] = p[0]; w.asm.verts[i][1] = p[1]; w.asm.verts[i][2] = p[2]; });
  final = mark(`X draped (${r.backend || 'blender'})`, w.asm, null, { wall: r.seconds });
} else if (useWasm) {
  // the viewer's path, module and all: the ESM build is for the browser, so
  // node loads the CommonJS one and hands it over (app/js/drapewasm.js).
  const { createRequire } = await import('node:module');
  const { readFileSync } = await import('node:fs');
  const require = createRequire(import.meta.url);
  const factory = require('../src/sewcloth/build/sewcloth.cjs');
  const mod = await factory({ wasmBinary: readFileSync('src/sewcloth/build/sewcloth.wasm') });
  const { drapeWasm, setSewclothModule } = await import('../app/js/drapewasm.js');
  setSewclothModule(mod);
  const out = await drapeWasm(w.asm, b, {
    seconds: 6, fps: 30, substeps: 8, cell: cellCm,
    pinned: pinWaist ? [...waistIds] : [],
    fabric: { friction: 0.4 },
  });
  out.verts.forEach((p, i) => { w.asm.verts[i][0] = p[0]; w.asm.verts[i][1] = p[1]; w.asm.verts[i][2] = p[2]; });
  final = mark(`X draped (sewcloth-wasm, ${cellCm} cm field)`, w.asm, null, {
    wall: +(out.ms / 1000).toFixed(1),
    'ms/frame': +out.msPerFrame.toFixed(1),
  });
} else {
  const drop = new Cloth(w.asm, b, {
    fabric, floorY: floorOf(b), substeps: 10,
  });
  const t0 = Date.now();
  const settle = drop.settle({ maxSeconds: 6 });
  final = mark('X draped (this project)', w.asm, drop, {
    wall: +((Date.now() - t0) / 1000).toFixed(1),
    settled: !!settle.settled,
  });
}

console.log(`fabric ${fabric}, arranged ${aboveCm} cm above where it belongs, `
  + `waist ${pinWaist ? 'pinned' : 'free'}`);
console.table(rows);
const hem = hemProfile(w.asm);
console.log(`hem ${hem.hemLengthCm} cm (cut 160), ${hem.folds} folds,`
  + ` depth ${hem.foldDepthCm} cm`);
console.log(`\nworst ten triangles, cm inside the body:`);
console.log('  ' + final.worstTriangles.map((t) => `#${t.tri}:${t.cm}`).join('  ') || '  (none)');

if (objAt) {
  writeFileSync(objAt, offendersOBJ(w.asm, final.worstTriangles));
  console.log(`\noffending triangles written to ${objAt}`);
}
if (jsonAt) {
  writeFileSync(jsonAt, JSON.stringify({ rows, final, hem }, null, 2));
  console.log(`trace written to ${jsonAt}`);
}
