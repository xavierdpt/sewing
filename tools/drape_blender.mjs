// Check this project's cloth solver against Blender's, on the same mesh and
// the same body -- the comparison docs/11-cloth.md asks for.
//   node tools/drape_blender.mjs
import { Body } from '../app/js/body.js';
import { Cloth } from '../app/js/cloth.js';
import { flaredSkirtPattern, waistRing, hemProfile } from '../app/js/skirt.js';
import { layOut, weldStitched } from '../app/js/assemble.js';
import { floorOf } from '../app/js/droptest.js';
import { drapeWithBlender, available } from '../sim/drape.mjs';

if (!available()) {
  console.error('blender is not on PATH -- install it to run this comparison');
  process.exit(1);
}

const b = new Body();
b.includeArms = true; b.includeLegs = true;
const waistV = b.landmarkV('waist');
const ring = waistRing(b, { waistV, ease: 1.0 });
const pattern = flaredSkirtPattern({
  panels: 4, waistCm: ring.circumferenceCm, hemCm: 160, lengthCm: 55,
  gather: 1.0, edge: 3.0, waistV,
});

// ---- sew it up with the in-repo solver (both runs start from the same garment)
const laid = layOut(pattern, b, { standoffCm: 6 });
const sew = new Cloth(laid.asm, b, {
  fabric: 'cotton poplin', gravityScale: 0, stitches: laid.stitches,
  selfCollision: false, substeps: 10, sewSpeedCmPerSec: 12,
});
sew.stitchStrength = 1;
sew.startSewing();
while (sew.isSewing()) sew.step(1 / 60);
const w = weldStitched(laid.asm, sew.stitches, { velocities: sew.vel, closedCm: 0.25 });
const waistIds = new Set();
for (const p of pattern.panels) {
  for (const r of p.runs || []) {
    if (r.kind !== 'top') continue;
    for (const i of r.pts) {
      const v3 = p.pts[i].v3;
      if (laid.v3Of.has(v3)) waistIds.add(w.map[laid.v3Of.get(v3)]);
    }
  }
}
console.log(`sewn: ${w.asm.verts.length} vertices, ${w.asm.tiles.length} triangles,`
  + ` ${waistIds.size} pinned at the waist\n`);

const snapshot = w.asm.verts.map((p) => [p[0], p[1], p[2]]);
const restore = () => { w.asm.verts.forEach((p, i) => { p[0] = snapshot[i][0]; p[1] = snapshot[i][1]; p[2] = snapshot[i][2]; }); };

// ---- A: this project's solver
restore();
for (const i of waistIds) w.asm.pinned[i] = true;
const mine = new Cloth(w.asm, b, {
  fabric: 'cotton poplin', floorY: floorOf(b), substeps: 10,
});
const t0 = Date.now();
const settle = mine.settle({ maxSeconds: 6 });
const mineSecs = +((Date.now() - t0) / 1000).toFixed(1);
const mp = mine.penetration();
const mineHem = hemProfile(w.asm);
const mineVerts = w.asm.verts.map((p) => [p[0], p[1], p[2]]);

// ---- B: Blender
restore();
const bl = drapeWithBlender(w.asm, b, {
  fabric: 'cotton poplin', seconds: 3, pinned: [...waistIds], selfCollision: true,
});
// measure Blender's result with OUR metric, so the two numbers are comparable
bl.verts.forEach((p, i) => { w.asm.verts[i][0] = p[0]; w.asm.verts[i][1] = p[1]; w.asm.verts[i][2] = p[2]; });
const probe = new Cloth(w.asm, b, { fabric: 'cotton poplin', floorY: floorOf(b) });
const bp = probe.penetration();
const blHem = hemProfile(w.asm);

const row = (name, secs, pen, hem, verts) => ({
  solver: name,
  wallSeconds: secs,
  'inside: vertices': `${pen.vertexCm} cm`,
  'inside: edges': `${pen.edgeCm} cm`,
  'inside: faces': `${pen.faceCm} cm`,
  'samples inside': pen.insideSamples,
  hemCm: hem.hemLengthCm,
  folds: hem.folds,
  foldDepthCm: hem.foldDepthCm,
  lowestYcm: +Math.min(...verts.map((p) => p[1])).toFixed(1),
});
console.table([
  row('this project (XPBD)', mineSecs, mp, mineHem, mineVerts),
  row('Blender (C)', bl.seconds, bp, blHem, bl.verts),
]);
console.log(`\nthe garment weighs ${bl.settings.totalKg * 1000} g either way`
  + ` (${bl.settings.gsm} gsm), which is the one thing both solvers agree on by construction.`);
console.log(`this project settled: ${!!settle.settled}`);
