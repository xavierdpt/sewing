// Arrange the pattern pieces in 3D, stitch them together, then drop them.
//   node tools/assemble.mjs              a 4-panel skirt, all three phases
//   node tools/assemble.mjs compare      arrange-and-stitch vs laid on its cone
import { Body } from '../app/js/body.js';
import { Cloth } from '../app/js/cloth.js';
import { flaredSkirtPattern, placeSkirt, hemProfile, waistRing } from '../app/js/skirt.js';
import { layOut, assembleGarment } from '../app/js/assemble.js';
import { floorOf } from '../app/js/droptest.js';

const mode = process.argv[2] || 'one';
const body = new Body();
const waistV = body.landmarkV('waist');
const ring = waistRing(body, { waistV, ease: 1.0 });
const make = (o) => flaredSkirtPattern({
  panels: 4, waistCm: ring.circumferenceCm, lengthCm: 55, edge: 4.0, waistV, ...o,
});

if (mode === 'one') {
  const cf = +(process.argv[3] ?? 0.5);
  const pattern = make({ circleFraction: cf });
  console.log(`\n${pattern.meta.panels} panels, ${pattern.meta.circleFraction} of a circle, `
    + `hem ${Math.round(pattern.meta.hemCm)} cm, ${pattern.seams.length} seams to sew`);
  const laid = layOut(pattern, body, { standoffCm: 6 });
  console.log(`arranged: ${laid.asm.verts.length} vertices in ${laid.panelOf.length && pattern.panels.length} `
    + `separate pieces, ${laid.stitches.length} stitches to close`);
  const st0 = laid.asm.edgeStrains().map((x) => Math.abs(x.strain));
  console.log(`  strain of the arranged pieces: max `
    + `${(100 * Math.max(...st0)).toExponential(1)} % -- each piece is rolled onto the`
    + ` cylinder, which bends it without stretching it`);
  const r = assembleGarment(pattern, body, {
    fabric: 'linen', standoffCm: 6, stitchSeconds: 2.5, fallSeconds: 8,
    floorY: floorOf(body),
  });
  console.table(r.log);
  console.table(hemProfile(r.asm));
  console.table(r.sim.report());
} else if (mode === 'waistband') {
  // With a waistband the skirt stays at the waist. Without one it is a loose
  // tube: gravity slides it down until the waist seam wedges on the hips,
  // which it cannot pass -- a 78 cm seam against 98 cm hips.
  const pattern = make({ circleFraction: 0.5 });
  for (const pinWaist of [true, false]) {
    const r = assembleGarment(pattern, body, {
      fabric: 'linen', standoffCm: 6, stitchSeconds: 2.5, fallSeconds: 8,
      floorY: floorOf(body), pinWaist,
    });
    const ids = r.asm.meta.waistIds;
    const y = ids.reduce((a, i) => a + r.asm.verts[i][1], 0) / ids.length;
    console.log(`  waistband ${pinWaist ? 'on ' : 'off'}: waist seam ends at y = `
      + `${y.toFixed(1)} cm, peak stretch ${r.sim.report().maxStretchPct}%`
      + `  ${pinWaist ? '(held at the waist)' : '(slid down and wedged on the hips)'}`);
  }
} else if (mode === 'compare') {
  console.log('\nthe same pattern, assembled two ways:\n');
  console.log('  cut              route                      peak stretch  folds  depth  hem len');
  for (const cf of [0.25, 0.5, 1.0]) {
    const pattern = make({ circleFraction: cf });
    const label = cf === 1 ? 'full circle ' : (cf === 0.5 ? 'half circle ' : 'quarter circ');

    // route A: laid straight onto the cone it belongs on, waistband ramped
    const placed = placeSkirt(pattern, body, { ease: 1.0, waistV });
    const simA = new Cloth(placed.asm, body, { fabric: 'linen', floorY: floorOf(body) });
    simA.pinRamp(placed.pinRamp);
    simA.settle({ maxSeconds: 8 });
    const hA = hemProfile(placed.asm);

    // route B: arranged as separate pieces, stitched with gravity off, dropped
    const B = assembleGarment(pattern, body, {
      fabric: 'linen', standoffCm: 6, stitchSeconds: 2.5, fallSeconds: 8,
      floorY: floorOf(body),
    });
    const hB = hemProfile(B.asm);
    console.log(`  ${label}  laid on its cone            `
      + `${simA.report().maxStretchPct.toFixed(1).padStart(5)}%  ${String(hA.folds).padStart(4)}  `
      + `${hA.foldDepthCm.toFixed(1).padStart(5)}  ${hA.hemLengthCm.toFixed(0).padStart(6)}`);
    console.log(`  ${label}  arranged, stitched, dropped `
      + `${B.sim.report().maxStretchPct.toFixed(1).padStart(5)}%  ${String(hB.folds).padStart(4)}  `
      + `${hB.foldDepthCm.toFixed(1).padStart(5)}  ${hB.hemLengthCm.toFixed(0).padStart(6)}`
      + `   (seam gap ${B.log[0].seamGapStartCm} -> ${B.log[0].seamGapEndCm} cm)`);
  }
}
console.log();
