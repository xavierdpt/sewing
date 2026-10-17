// Where does the solver spend its time? Ask V8, not a guess.
//
//   node tools/profile.mjs                      the accordion heap
//   node tools/profile.mjs --scenario disc      the yoke disc
//   node tools/profile.mjs --scenario sew       the skirt's seams closing (W)
//   node tools/profile.mjs --scenario sew --darts   and with asymmetric darts
//   node tools/profile.mjs --seconds 2 --top 25
//   node tools/profile.mjs --mode vertex        the old thickness model
//   node tools/profile.mjs --cell 1.0           override the broad-phase cell
//
// This exists because self-collision got 6x slower when thickness became
// geometry, and "it is the broad phase" was a guess. It uses the V8 sampling
// profiler through node's own inspector session -- the same engine behind
// --cpu-prof -- and aggregates SELF time per function, which is the number
// that says what to rewrite. Wall-clock wrappers around methods cannot do
// that: they attribute a callee's cost to its caller and they perturb what
// they measure.
//
// It also prints the broad phase's own counters, because the hot function is
// usually hot for a reason that lives in a count rather than in the code.
// the callback API, not node:inspector/promises: that landed in Node 19 and
// this repo runs on 18
import { Session } from 'node:inspector';
import { Body } from '../app/js/body.js';
import { dropAccordion, dropDisc } from '../app/js/droptest.js';
import { Cloth } from '../app/js/cloth.js';
import { flaredSkirtPattern, waistRing } from '../app/js/skirt.js';
import { layOut } from '../app/js/assemble.js';
import { asymmetricDarts } from '../app/js/skirtdarts.js';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const scenario = flag('--scenario', 'accordion');
const seconds = +flag('--seconds', 3);
const top = +flag('--top', 20);
const mode = flag('--mode', 'slab');
const cell = flag('--cell', null);
const edge = +flag('--edge', 2.0);
const fabric = flag('--fabric', 'silk habotai');

const body = new Body();
body.includeArms = true; body.includeLegs = true;

const run = () => {
  const cloth = { selfCollision: true, selfCollisionMode: mode };
  if (cell) cloth.selfCell = +cell;
  // W, as the viewer runs it: the seams fed closed with gravity off and
  // self-collision off (assemble.js says why), stepped at 1/60 for `seconds`.
  // This is the phase the viewer is slow in, so it is the phase the profile
  // has to be able to see.
  if (scenario === 'sew') {
    const waistV = body.landmarkV('waist');
    const ring = waistRing(body, { waistV, ease: 1.0 });
    const pattern = flaredSkirtPattern({
      panels: 4, waistCm: ring.circumferenceCm, hemCm: 160, lengthCm: 55,
      gather: 1.0, edge, waistV,
    });
    if (args.includes('--darts')) asymmetricDarts(pattern);
    const laid = layOut(pattern, body, { standoffCm: 6 });
    const sew = new Cloth(laid.asm, body, {
      fabric, gravityScale: 0, stitches: laid.stitches, selfCollision: false,
      substeps: +flag('--substeps', 10), sewSpeedCmPerSec: 12, edgeCollision: true,
    });
    sew.stitchStrength = 1;
    sew.startSewing();
    const frames = Math.round(seconds * 60);
    for (let f = 0; f < frames; f++) sew.step(1 / 60);
    return { cloth: sew, asm: laid.asm, frames };
  }
  if (scenario === 'disc') {
    return dropDisc(body, { innerR: 7.5, outerR: 28, edge, dropCm: 4, seconds, fabric, cloth });
  }
  return dropAccordion(body, {
    widthCm: 20, lengthCm: 64, pleatCm: 8, edge, seconds, fabric,
    pleatAngleDeg: 45, cloth: { ...cloth, bend: 0.3 },
  });
};

const session = new Session();
session.connect();
const post = (method, params) => new Promise((res, rej) => {
  session.post(method, params, (err, result) => (err ? rej(err) : res(result)));
});
await post('Profiler.enable');
// 100 us: fine enough to separate the inner loops of one substep, coarse
// enough that the sampler is not itself the workload.
await post('Profiler.setSamplingInterval', { interval: 100 });
await post('Profiler.start');
const t0 = Date.now();
const r = run();
const wallMs = Date.now() - t0;
const { profile } = await post('Profiler.stop');
session.disconnect();

// Self time per node, from the sample counts: V8 gives samples and the deltas
// between them, which is more honest than counting hits.
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const deltas = profile.timeDeltas || [];
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  if (!n) return;
  const cf = n.callFrame;
  const where = cf.url ? `${cf.url.split('/').pop()}:${cf.lineNumber + 1}` : '(native)';
  const k = `${cf.functionName || '(anonymous)'}  ${where}`;
  self.set(k, (self.get(k) || 0) + (deltas[i] || 0) / 1000);
});

const rows = [...self.entries()]
  .map(([k, ms]) => ({ fn: k, ms: +ms.toFixed(0), pct: +(100 * ms / (wallMs || 1)).toFixed(1) }))
  .sort((a, b) => b.ms - a.ms)
  .slice(0, top);

const c = r.cloth;
if (r.frames) {
  console.log(`${r.frames} frames in ${(wallMs / 1000).toFixed(1)} s wall`
    + ` -- ${(wallMs / r.frames).toFixed(1)} ms/frame,`
    + ` ${(1000 * r.frames / wallMs).toFixed(1)} fps`);
}
console.log(`${scenario}: ${seconds} s simulated in ${(wallMs / 1000).toFixed(1)} s wall`
  + `, ${fabric}, ${edge} cm triangles, thickness model '${mode}'`);
console.log(`mesh: ${r.asm.verts.length} vertices, ${r.asm.tiles.length} triangles,`
  + ` ${c.stretch.length} edges`);
// the broad-phase counters only mean something when self-collision is on,
// and the sewing phase deliberately has it off (assemble.js)
if (mode === 'slab' && c.opts && c.opts.selfCollision) {
  const vt = c.vtPairs.length / 2, ee = c.eePairs.length / 2;
  const all = c.stretch.length * (c.stretch.length - 1) / 2;
  console.log(`broad phase: cell ${(c.selfCellUsed || c.cell).toFixed(2)} cm over ${c.selfCells} cells,`
    + ` ${vt} vertex-triangle and ${ee} edge-edge candidates`
    + ` -- ${(vt / r.asm.verts.length).toFixed(1)} per vertex and`
    + ` ${(ee / c.stretch.length).toFixed(1)} per edge,`
    + ` which is ${(100 * ee / all).toFixed(1)} % of every possible edge pair`);
}
console.table(rows);
