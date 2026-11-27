// Check this project's cloth solver against Blender's, on the same mesh and
// the same body -- the comparison docs/11-cloth.md asks for.
//   node tools/drape_blender.mjs
//   node tools/drape_blender.mjs --fabric 'interfaced twill'
//   node tools/drape_blender.mjs --all        # every preset, one row each
//   node tools/drape_blender.mjs --edges 1.5,3,4.5   # one fabric, three meshes
//
// THE FABRIC IS A FLAG BECAUSE THE ANSWER DEPENDS ON IT. Hard-coded to cotton
// poplin, this tool reported hem, fold count and hang height agreeing with
// Blender and fold depth disagreeing by 2.03x (3.48 cm against 7.07 cm) --
// and could not say whether that gap is the same for a limp silk and a
// stiffened twill. todos/18-validation.md 6.8 records the solver's bending as
// miscalibrated AND MESH-DEPENDENT, so the gap is expected to vary with
// stiffness; a comparison that cannot sweep the stiffness cannot test that.
//
// THE EDGE LENGTH IS A FLAG FOR THE SAME REASON, AND IT IS THE SHARPER TEST.
// The sweep above says the gap grows with stiffness. What it cannot say is
// whether that is a stiffness error or a MESH error wearing a stiffness
// costume, and there is one measurement that separates them: the same denim
// reads 1.2x TOO LIMP on a Peirce cantilever at 0.275 cm rows and 12.5x too
// stiff to fold on this skirt at 3.0 cm triangles -- opposite signs, same
// nominal bending, meshes a factor of ten apart. So a single compliance
// correction cannot be right. What is wanted is how the solver's EFFECTIVE
// bending varies with edge length, which is what `--edges` measures.
import fs from 'node:fs';
import { Body } from '../app/js/body.js';
import { Cloth, FABRICS } from '../app/js/cloth.js';
import { flaredSkirtPattern, waistRing, hemProfile } from '../app/js/skirt.js';
import { layOut, weldStitched } from '../app/js/assemble.js';
import { floorOf } from '../app/js/droptest.js';
import { drapeWithBlender, available } from '../sim/drape.mjs';

if (!available()) {
  console.error('blender is not on PATH -- install it to run this comparison');
  process.exit(1);
}

// The bending scale the FIXTURE is sewn at. A fixed experimental constant,
// not a solver setting: it exists so the sewn garment is reproducible across
// changes to `BEND_SCALE` in bending.js. Changing this number invalidates
// comparison with every figure recorded before it changed, so don't.
const SEW_BEND_SCALE = 1.8;
const noCollider = process.argv.includes('--no-collider');

const args = process.argv.slice(2);
const flag = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const fabrics = args.includes('--all')
  ? Object.keys(FABRICS)
  : [flag('--fabric', 'cotton poplin')];
for (const f of fabrics) {
  if (!FABRICS[f]) {
    console.error(`no such fabric: ${f}\nhave: ${Object.keys(FABRICS).join(', ')}`);
    process.exit(2);
  }
}
const edges = String(flag('--edges', flag('--edge', '3'))).split(',').map(Number);
// Settle budget, seconds of simulated time. A FLAG BECAUSE 6 S IS NOT ENOUGH
// AT A FINE MESH AND A RUN THAT HAS NOT SETTLED IS NOT A MEASUREMENT: the
// first --edges sweep reported denim at 1.5 cm triangles with `settled:
// false` after 319 s of wall time, and that row's fold depth was then
// compared against Blender's converged one as though the two were
// commensurable. They are not. `settled` is printed beside every row for the
// same reason -- the number is meaningless without it.
const settleSeconds = +flag('--settle', 6);
for (const e of edges) {
  if (!(e > 0.4 && e < 12)) { console.error(`edge out of range: ${e} cm`); process.exit(2); }
}

// Print as the work completes, not at the end. A Blender bake is ~50 s and a
// sweep is one per fabric per mesh, so a run that reported only on exit would
// be silent for an hour. `fs.writeSync` rather than console.log, because
// stdout is asynchronous when it is a pipe and this loop never yields -- the
// bug that made tools/fabric.mjs look hung for thirty minutes.
const say = (line) => fs.writeSync(1, line);

const b = new Body();
b.includeArms = true; b.includeLegs = true;
const waistV = b.landmarkV('waist');

/**
 * Draft, lay out and sew the same skirt at a given triangle edge length.
 *
 * Rebuilt per edge rather than once: the mesh IS the variable here, so the
 * garment cannot be hoisted out of the loop the way it was when the edge was
 * fixed at 3 cm.
 */
function buildGarment(edgeCm) {
  const ring = waistRing(b, { waistV, ease: 1.0 });
  const pattern = flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm, hemCm: 160, lengthCm: 55,
    gather: 1.0, edge: edgeCm, waistV,
  });
  const laid = layOut(pattern, b, { standoffCm: 6 });
  // THE SEWN GARMENT IS THE EXPERIMENT'S FIXTURE AND MUST NOT MOVE.
  //
  // Both solvers drape whatever this sews, so anything that changes the sewn
  // shape changes BOTH columns -- including Blender's, which is supposed to
  // be the fixed point the comparison is measured against. The fabric was
  // already pinned here for that reason. `BEND_SCALE` escaped it by being a
  // module constant rather than an option, and when it went from 30 to 1.8
  // on 2026-10-18 Blender's own denim reading moved from 4.34 to 1.32 on a
  // solver nobody had touched (todos/18-validation.md 6.15). Pinned
  // explicitly now, so a change to the shipped constant leaves this fixture
  // and therefore Blender's column alone.
  //
  // This is a partial fix. It pins the one term known to have moved the
  // fixture; any other change to sewing -- stretch compliance, the feed, the
  // stitch model -- would move it again. The complete answer is to cache the
  // welded assembly to a file and drape THAT, which is still queued.
  const sew = new Cloth(laid.asm, b, {
    fabric: 'cotton poplin', gravityScale: 0, stitches: laid.stitches,
    selfCollision: false, substeps: 10, sewSpeedCmPerSec: 12,
    bendScale: SEW_BEND_SCALE,
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
  const snapshot = w.asm.verts.map((p) => [p[0], p[1], p[2]]);
  const restore = () => {
    w.asm.verts.forEach((p, i) => { p[0] = snapshot[i][0]; p[1] = snapshot[i][1]; p[2] = snapshot[i][2]; });
  };
  say(`mesh ${edgeCm} cm: sewn ${w.asm.verts.length} vertices,`
    + ` ${w.asm.tiles.length} triangles, ${waistIds.size} pinned at the waist\n`);
  return { w, waistIds, restore };
}

const row = (name, fabric, secs, pen, hem, verts) => ({
  solver: name,
  fabric,
  wallSeconds: secs,
  'inside: vertices': `${pen.vertexCm} cm`,
  'inside: edges': `${pen.edgeCm} cm`,
  'inside: faces': `${pen.faceCm} cm`,
  'samples inside': pen.insideSamples,
  hemCm: hem.hemLengthCm,
  folds: hem.folds,
  foldDepthCm: hem.foldDepthCm,
  'mean fold': hem.meanFoldDepthCm,
  'deepest / shallowest': hem.foldDepthsCm.length
    ? `${hem.foldDepthsCm[0]} / ${hem.foldDepthsCm[hem.foldDepthsCm.length - 1]}` : '--',
  'every fold, cm': hem.foldDepthsCm.join(' '),
  lowestYcm: +Math.min(...verts.map((p) => p[1])).toFixed(1),
});

/** Both solvers on one fabric, from one sewn garment at one mesh. */
function compare(fabric, edgeCm, { w, waistIds, restore }) {
  // ---- A: this project's solver
  restore();
  for (const i of waistIds) w.asm.pinned[i] = true;
  // --no-collider: OURS drapes in free air while Blender keeps the body.
  // NOT a fair comparison and not meant to be -- it is the discriminator for
  // todos/18-validation.md 6.16, where the same repaired cloth UNDER-drapes on
  // the Cusick disc and OVER-folds on this skirt. The rigs differ in that the
  // disc has no collider; if removing it moves our fold depth toward the
  // oracle's, contact is implicated. Read our column against our own
  // with-collider run, never against Blender's.
  const mine = new Cloth(w.asm, noCollider ? null : b,
    { fabric, floorY: floorOf(b), substeps: 10 });
  const t0 = Date.now();
  const settle = mine.settle({ maxSeconds: settleSeconds });
  const mineSecs = +((Date.now() - t0) / 1000).toFixed(1);
  const mp = mine.penetration();
  const mineHem = hemProfile(w.asm);
  const mineVerts = w.asm.verts.map((p) => [p[0], p[1], p[2]]);

  // ---- B: Blender
  restore();
  const bl = drapeWithBlender(w.asm, b, {
    fabric, seconds: 3, pinned: [...waistIds], selfCollision: true,
  });
  // measure Blender's result with OUR metric, so the two numbers are comparable
  bl.verts.forEach((p, i) => { w.asm.verts[i][0] = p[0]; w.asm.verts[i][1] = p[1]; w.asm.verts[i][2] = p[2]; });
  const probe = new Cloth(w.asm, b, { fabric, floorY: floorOf(b) });
  const bp = probe.penetration();
  const blHem = hemProfile(w.asm);

  return {
    rows: [
      row('this project (XPBD)', fabric, mineSecs, mp, mineHem, mineVerts),
      row('Blender (C)', fabric, bl.seconds, bp, blHem, bl.verts),
    ],
    // The gap, as a ratio, because that is the thing being swept: a constant
    // ratio across the presets is a calibration error in one place, and a
    // ratio that tracks stiffness is the mesh-dependence of 6.8.
    gap: {
      fabric,
      'edge cm': edgeCm,
      bendLengthCm: FABRICS[fabric].bendLengthCm,
      'fold depth, ours': mineHem.foldDepthCm,
      'fold depth, blender': blHem.foldDepthCm,
      'blender / ours': blHem.foldDepthCm > 0 && mineHem.foldDepthCm > 0
        ? +(blHem.foldDepthCm / mineHem.foldDepthCm).toFixed(2) : '--',
      // the same ratio on the per-fold mean, which one outlying fold cannot set
      'mean fold, ours': mineHem.meanFoldDepthCm,
      'mean fold, blender': blHem.meanFoldDepthCm,
      'mean ratio': blHem.meanFoldDepthCm > 0 && mineHem.meanFoldDepthCm > 0
        ? +(blHem.meanFoldDepthCm / mineHem.meanFoldDepthCm).toFixed(2) : '--',
      'spread, ours': mineHem.foldDepthSpreadCm,
      'spread, blender': blHem.foldDepthSpreadCm,
      'folds, ours': mineHem.folds,
      'folds, blender': blHem.folds,
      settled: !!settle.settled,
      gsm: bl.settings.gsm,
    },
  };
}

const all = [];
for (const edgeCm of edges) {
  const g = buildGarment(edgeCm);
  for (const fabric of fabrics) {
    const t = Date.now();
    const r = compare(fabric, edgeCm, g);
    all.push(r);
    // one line as each pairing resolves, so an hour-long sweep can be watched
    say(`  ${String(edgeCm).padStart(4)} cm  ${fabric.padEnd(18)}`
      + ` ours ${String(r.gap['mean fold, ours']).padStart(6)}`
      + `  blender ${String(r.gap['mean fold, blender']).padStart(6)}`
      + `  ratio ${String(r.gap['mean ratio']).padStart(6)}`
      + `  ${r.gap.settled ? 'settled' : 'NOT SETTLED -- not a measurement'}`
      + `   [${((Date.now() - t) / 1000).toFixed(0)}s]\n`);
  }
}
say('\n');
console.table(all.flatMap((r) => r.rows));
if (all.length > 1) {
  console.log('\nthe gap, by mesh and by stiffness:');
  console.table([...all.map((r) => r.gap)]
    .sort((x, y) => (x['edge cm'] - y['edge cm']) || (x.bendLengthCm - y.bendLengthCm)));
}
if (edges.length > 1) {
  // THE QUESTION THE SWEEP EXISTS TO ANSWER. A ratio that is flat down each
  // column is a stiffness error, fixable with one compliance scale. A ratio
  // that moves with the edge length is the mesh-dependence of 6.8, and no
  // single scale fixes it.
  console.log('\nmean-fold ratio (blender / ours), fabric x mesh:');
  const byFabric = {};
  for (const r of all) {
    const g = r.gap;
    (byFabric[g.fabric] ||= { fabric: g.fabric, bendCm: g.bendLengthCm })[`${g['edge cm']} cm`] = g['mean ratio'];
  }
  console.table(Object.values(byFabric).sort((x, y) => x.bendCm - y.bendCm));
}
console.log('\nthe garment weighs the same in both solvers by construction;'
  + ' the areal density is the one input neither can disagree about.');
