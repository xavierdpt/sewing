// Round-trip a real garment through the running side-car, over HTTP.
//   python3 sim/server.py &
//   node tools/check_sidecar.mjs
//
// This exercises everything the viewer does except the browser's own fetch:
// the same job builder (app/js/drapejob.js), the same endpoint, the same
// backend. If this passes and the viewer does not, the fault is in the glue,
// which is a much smaller place to look.
import { Body } from '../app/js/body.js';
import { Cloth } from '../app/js/cloth.js';
import { flaredSkirtPattern, waistRing } from '../app/js/skirt.js';
import { layOut, weldStitched } from '../app/js/assemble.js';
import { buildJob } from '../app/js/drapejob.js';
import { clearance, clearanceLine } from '../app/js/clearance.js';

const URL = process.argv[2] || 'http://127.0.0.1:8778';

const health = await fetch(`${URL}/health`).then((r) => r.json()).catch(() => null);
if (!health) {
  console.error(`no side-car at ${URL}.  Start it:  python3 sim/server.py`);
  process.exit(1);
}
console.log(`side-car up: ${JSON.stringify(health.backends)}`);

const b = new Body();
b.includeArms = true; b.includeLegs = true;
const waistV = b.landmarkV('waist');
const ring = waistRing(b, { waistV, ease: 1.0 });
const pattern = flaredSkirtPattern({
  panels: 4, waistCm: ring.circumferenceCm, hemCm: 160, lengthCm: 55,
  gather: 1.0, edge: 3.0, waistV,
});
const laid = layOut(pattern, b, { standoffCm: 6 });
const sew = new Cloth(laid.asm, b, {
  fabric: 'cotton poplin', gravityScale: 0, stitches: laid.stitches,
  selfCollision: false, substeps: 10, sewSpeedCmPerSec: 12,
});
sew.stitchStrength = 1; sew.startSewing();
while (sew.isSewing()) sew.step(1 / 60);
const w = weldStitched(laid.asm, sew.stitches, { velocities: sew.vel, closedCm: 0.25 });
const waistIds = new Set();
for (const p of pattern.panels) for (const r of p.runs || []) {
  if (r.kind !== 'top') continue;
  for (const i of r.pts) if (laid.v3Of.has(p.pts[i].v3)) waistIds.add(w.map[laid.v3Of.get(p.pts[i].v3)]);
}
const before = clearance(w.asm, b);
console.log(`before: ${clearanceLine(before)}`);

const job = buildJob(w.asm, b, {
  fabric: 'cotton poplin', seconds: 6, pinned: [...waistIds], selfCollision: true,
});
const t0 = Date.now();
const res = await fetch(`${URL}/drape`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(job),
});
const out = await res.json();
if (!res.ok) { console.error(`side-car error: ${out.error}`); process.exit(1); }
if (out.verts.length !== w.asm.verts.length) {
  console.error(`got ${out.verts.length} vertices, expected ${w.asm.verts.length}`);
  process.exit(1);
}
out.verts.forEach((p, i) => {
  w.asm.verts[i][0] = p[0]; w.asm.verts[i][1] = p[1]; w.asm.verts[i][2] = p[2];
});
const after = clearance(w.asm, b);
console.log(`after:  ${clearanceLine(after)}`);
console.log(`backend ${out.backend}, ${out.wallSeconds}s solve,`
  + ` ${((Date.now() - t0) / 1000).toFixed(1)}s round trip`);

const ok = after.insideAreaPct === 0 && after.trianglesTouched === 0;
console.log(ok
  ? '\nPASS  nothing of the body is through the cloth'
  : `\nFAIL  ${after.insideAreaPct} % of the cloth area is still inside the body`);
process.exit(ok ? 0 : 1);
