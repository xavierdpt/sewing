// Trace the whole arrange -> sew -> weld -> drape workflow, in numbers.
//   node tools/trace.mjs                  this project's solver throughout
//   node tools/trace.mjs --sidecar        hand the drape to the side-car
//   node tools/trace.mjs --json out.json  machine-readable, for diffing runs
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

const args = process.argv.slice(2);
const useSidecar = args.includes('--sidecar');
const jsonAt = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const objAt = args.includes('--obj') ? args[args.indexOf('--obj') + 1] : null;

const b = new Body();
b.includeArms = true; b.includeLegs = true;
const collider = new BodyCollider(b);
const waistV = b.landmarkV('waist');
const ring = waistRing(b, { waistV, ease: 1.0 });
const pattern = flaredSkirtPattern({
  panels: 4, waistCm: ring.circumferenceCm, hemCm: 160, lengthCm: 55,
  gather: 1.0, edge: 3.0, waistV,
});

const rows = [];
const mark = (phase, asm, sim, extra = {}) => {
  const c = clearance(asm, b, { collider });
  const row = {
    phase,
    seconds: sim ? +sim.time.toFixed(2) : 0,
    vertices: asm.verts.length,
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
const sew = new Cloth(laid.asm, b, {
  fabric: 'cotton poplin', gravityScale: 0, stitches: laid.stitches,
  selfCollision: false, substeps: 10, sewSpeedCmPerSec: 12, edgeCollision: true,
});
sew.stitchStrength = 1;
sew.startSewing();
let f = 0;
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

// ---- weld
const w = weldStitched(laid.asm, sew.stitches, { velocities: sew.vel, closedCm: 0.25 });
const waistIds = new Set();
for (const p of pattern.panels) for (const r of p.runs || []) {
  if (r.kind !== 'top') continue;
  for (const i of r.pts) if (laid.v3Of.has(p.pts[i].v3)) waistIds.add(w.map[laid.v3Of.get(p.pts[i].v3)]);
}
for (const i of waistIds) w.asm.pinned[i] = true;
mark('welded', w.asm, null, { 'welded %': w.weldedPct });

// ---- X: drape
let final;
if (useSidecar) {
  const { drapeWithBlender } = await import('../sim/drape.mjs');
  const r = drapeWithBlender(w.asm, b, {
    fabric: 'cotton poplin', seconds: 6, pinned: [...waistIds], selfCollision: true,
  });
  r.verts.forEach((p, i) => { w.asm.verts[i][0] = p[0]; w.asm.verts[i][1] = p[1]; w.asm.verts[i][2] = p[2]; });
  final = mark(`X draped (${r.backend || 'blender'})`, w.asm, null, { wall: r.seconds });
} else {
  const drop = new Cloth(w.asm, b, {
    fabric: 'cotton poplin', floorY: floorOf(b), substeps: 10,
  });
  const t0 = Date.now();
  const settle = drop.settle({ maxSeconds: 6 });
  final = mark('X draped (this project)', w.asm, drop, {
    wall: +((Date.now() - t0) / 1000).toFixed(1),
    settled: !!settle.settled,
  });
}

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
