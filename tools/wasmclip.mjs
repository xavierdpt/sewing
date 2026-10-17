// Where does the body come through, when the VIEWER drapes it?
//
//   node tools/wasmclip.mjs            the four-panel skirt, 1 cm field
//   node tools/wasmclip.mjs --cell 0.5
//   node tools/wasmclip.mjs --thickness 0.8 --substeps 16
//   node tools/wasmclip.mjs --edge 2.0      a finer garment mesh
//
// `tools/trace.mjs --wasm` says HOW MUCH comes through. This says WHAT comes
// through, which is the question that chooses the fix: the clearance field is
// measured twice over the same draped garment -- once against the whole body
// and once against the torso alone -- and the difference is the part of the
// clipping the wasm backend could not have prevented, because its collider
// does not contain it.
//
// app/js/drapewasm.js builds its field from `trianglesOf(surface)`, which
// walks the parametric torso only. cloth.js's BodyCollider adds the arms and
// legs as analytic capsules on top of its own level set (see its `_limbs`).
// So the two solvers do not collide against the same body, and this is the
// instrument that says so in centimetres.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Body } from '../app/js/body.js';
import { Cloth, BodyCollider } from '../app/js/cloth.js';
import { flaredSkirtPattern, waistRing } from '../app/js/skirt.js';
import { layOut, weldStitched } from '../app/js/assemble.js';
import { clearance } from '../app/js/clearance.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => (args.includes(name) ? +args[args.indexOf(name) + 1] : dflt);
const cell = flag('--cell', 1.0);
// The three other levers on how much comes through: how thick the cloth
// thinks it is, how often contact is resolved, and how big its triangles are.
// 0 means "do not pass one": drapewasm then applies its own floor, which is
// what the viewer gets.
const thickness = flag('--thickness', 0);
const substeps = flag('--substeps', 8);
const edge = flag('--edge', 3.0);

const b = new Body();
b.includeArms = true; b.includeLegs = true;
const waistV = b.landmarkV('waist');
const ring = waistRing(b, { waistV, ease: 1.0 });
const pattern = flaredSkirtPattern({
  panels: 4, waistCm: ring.circumferenceCm, hemCm: 160, lengthCm: 55,
  gather: 1.0, edge, waistV,
});

// J and W, as trace.mjs does them
const laid = layOut(pattern, b, { standoffCm: 6 });
const sew = new Cloth(laid.asm, b, {
  fabric: 'cotton poplin', gravityScale: 0, stitches: laid.stitches,
  selfCollision: false, substeps: 10, sewSpeedCmPerSec: 12, edgeCollision: true,
});
sew.stitchStrength = 1;
sew.startSewing();
for (let f = 0; sew.isSewing() && f < 3000; f++) sew.step(1 / 60);
const w = weldStitched(laid.asm, sew.stitches, { velocities: sew.vel, closedCm: 0.25 });
const waistIds = new Set();
for (const p of pattern.panels) for (const r of p.runs || []) {
  if (r.kind !== 'top') continue;
  for (const i of r.pts) if (laid.v3Of.has(p.pts[i].v3)) waistIds.add(w.map[laid.v3Of.get(p.pts[i].v3)]);
}
for (const i of waistIds) w.asm.pinned[i] = true;

// X, through the viewer's own backend
const require = createRequire(import.meta.url);
const factory = require('../src/sewcloth/build/sewcloth.cjs');
const mod = await factory({ wasmBinary: readFileSync('src/sewcloth/build/sewcloth.wasm') });
const { drapeWasm, setSewclothModule } = await import('../app/js/drapewasm.js');
setSewclothModule(mod);
const out = await drapeWasm(w.asm, b, {
  seconds: 6, fps: 30, substeps, cell,
  pinned: [...waistIds],
  fabric: thickness ? { friction: 0.4, thickness } : { friction: 0.4 },
});
out.verts.forEach((p, i) => {
  w.asm.verts[i][0] = p[0]; w.asm.verts[i][1] = p[1]; w.asm.verts[i][2] = p[2];
});

const rowOf = (what, c) => ({
  measured_against: what,
  'inside area %': c.insideAreaPct,
  'deepest cm': c.deepestCm,
  'p05 gap cm': c.p05Cm,
  'tris touched': c.trianglesTouched,
});
const rows = [rowOf('the whole body: torso + arm and leg capsules', clearance(w.asm, b, { collider: new BodyCollider(b) }))];
b.includeArms = false; b.includeLegs = false;
rows.push(rowOf('the torso alone: the rest is limb', clearance(w.asm, b, { collider: new BodyCollider(b) })));
console.log(`sewcloth drape: ${cell} cm field, ${thickness || 'floored'} cm thick, ${substeps} substeps,`
  + ` ${edge} cm triangles, ${w.asm.verts.length} verts, ${out.msPerFrame.toFixed(1)} ms/frame`);
console.table(rows);
