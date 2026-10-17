// Put the garment as it stands after W into Blender's own window, to be
// looked at rather than scored.
//
//   node tools/to_blender.mjs                 J, W (wasm), weld -> out/afterW.json
//   node tools/to_blender.mjs --open          and open it in Blender
//   node tools/to_blender.mjs --open --play   and start the solve
//   node tools/to_blender.mjs --no-darts --edge 2.5
//
// WHY THIS EXISTS. `sim/blender_show.py` has always been able to open a drape
// job in Blender's window -- same collider, same cloth modifier, same
// thicknesses as the side-car solves with -- and its own header says the
// thing it could not do was PRODUCE one from the garment. This is that
// missing half: arrange, sew, weld, and write the job, so that what Blender
// is asked to drape is exactly what the viewer would have dropped.
//
// It is for the question "is this what real cloth does?", which no number
// this project computes can answer on its own: the hem profile says 4 folds
// and 11 cm deep whether or not a person would call that a skirt. The oracle
// is Blender; this is how to go and look at it.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { Body } from '../app/js/body.js';
import { flaredSkirtPattern, waistRing } from '../app/js/skirt.js';
import { layOut, weldStitched } from '../app/js/assemble.js';
import { dartedSkirt } from '../app/js/skirtdarts.js';
import { Cloth } from '../app/js/cloth.js';
import { buildJob } from '../app/js/drapejob.js';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? +args[args.indexOf(n) + 1] : d);
const open = args.includes('--open');
const play = args.includes('--play');
const darts = !args.includes('--no-darts');
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'out/afterW.json';

const b = new Body();
b.includeArms = true; b.includeLegs = true;
const waistV = b.landmarkV('waist');
const ring = waistRing(b, { waistV, ease: 1.0 });
const draftAt = (waistCm) => flaredSkirtPattern({
  panels: flag('--panels', 4), waistCm,
  hemCm: flag('--hem', 160), lengthCm: flag('--length', 55),
  gather: 1.0, edge: flag('--edge', 3.0), waistV,
});

// ---- J
const pattern = darts
  ? dartedSkirt(draftAt, { waistCm: ring.circumferenceCm, scale: flag('--dart-scale', 2) }).pattern
  : draftAt(ring.circumferenceCm);
const laid = layOut(pattern, b, { standoffCm: flag('--standoff', 6) });

// ---- W, in wasm, exactly as the viewer now sews
const require = createRequire(import.meta.url);
const factory = require('../src/sewcloth/build/sewcloth.cjs');
const mod = await factory({ wasmBinary: readFileSync('src/sewcloth/build/sewcloth.wasm') });
const { setSewclothModule } = await import('../app/js/drapewasm.js');
setSewclothModule(mod);
const { sewWasm } = await import('../app/js/sewwasm.js');
const sewn = await sewWasm(laid.asm, laid.stitches, b, {
  sewSpeedCmPerSec: flag('--speed', 12), maxSeconds: 10,
});
console.log(`W: ${sewn.frames} frames, widest seam ${sewn.maxGapCm} cm`
  + `, ${sewn.stalled ? 'stopped improving' : 'feed spent'}`);

// ---- weld what closed, pin the waist, and hand it over
const welded = weldStitched(laid.asm, laid.stitches, { closedCm: 0.25 });
const waistIds = new Set();
for (const p of pattern.panels) for (const r of p.runs || []) {
  if (r.kind !== 'top') continue;
  for (const i of r.pts) if (laid.v3Of.has(p.pts[i].v3)) waistIds.add(welded.map[laid.v3Of.get(p.pts[i].v3)]);
}
// A Cloth only to borrow its fabric table for the job; nothing is stepped.
void Cloth;
const job = buildJob(welded.asm, b, {
  fabric: args.includes('--fabric') ? args[args.indexOf('--fabric') + 1] : 'cotton poplin',
  seconds: flag('--seconds', 6),
  pinned: [...waistIds],
  selfCollision: true,
});
mkdirSync('out', { recursive: true });
writeFileSync(out, JSON.stringify(job));
console.log(`${welded.asm.verts.length} vertices, ${welded.asm.tiles.length} triangles,`
  + ` ${waistIds.size} pinned at the waist -> ${out}`);
console.log(`  blender --factory-startup --python sim/blender_show.py -- ${out}${play ? ' --play' : ''}`);

if (open) {
  const argv = ['--factory-startup', '--python', 'sim/blender_show.py', '--', out];
  if (play) argv.push('--play');
  const child = spawn('blender', argv, { stdio: 'inherit', detached: true });
  child.unref();
  console.log('Blender is opening. The skirt is the cloth object; press space to solve.');
}
