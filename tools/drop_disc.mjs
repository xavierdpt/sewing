// The drop test from the command line.
//   node tools/drop_disc.mjs                 one disc, verbose
//   node tools/drop_disc.mjs sweep           inner radius sweep, the yoke/slip boundary
//   node tools/drop_disc.mjs fabrics         the same disc in seven fabrics
import { Body } from '../app/js/body.js';
import { dropDisc, dropRectangle, slipSweep, neckFrame } from '../app/js/droptest.js';
import { FABRICS } from '../app/js/cloth.js';

/** the scalar fields only -- `out` also carries the pattern, mesh and solver */
const scalars = (o) => Object.fromEntries(
  Object.entries(o).filter(([, v]) => v === null || typeof v !== 'object'));

const mode = process.argv[2] || 'one';
const body = new Body();
const neck = neckFrame(body);
console.log(`\nbody: neck girth ${neck.girthCm.toFixed(1)} cm `
  + `(radius ${neck.radiusCm.toFixed(2)} cm), top of neck at y = ${neck.yTop.toFixed(1)} cm`);

if (mode === 'one') {
  const innerR = +(process.argv[3] || 7.5);
  const t0 = Date.now();
  const out = dropDisc(body, { innerR, outerR: 28, edge: 2.2, seconds: 5 });
  console.log(`\nhollow disc: hole r = ${innerR} cm (circumference `
    + `${out.holeCircumferenceCm} cm vs neck ${out.neckGirthCm.toFixed(1)} cm), `
    + `${out.pattern.panels[0].tris.length} triangles, ${out.vertices} vertices`);
  console.table(scalars(out));
  console.log(`VERDICT: ${out.verdict}   (${((Date.now() - t0) / 1000).toFixed(1)} s wall)`);
} else if (mode === 'sweep') {
  const s = slipSweep(body, { outerR: 30, edge: 2.8, seconds: 4,
    log: (r) => console.log(`  r=${String(r.innerRcm).padStart(4)} cm  `
      + `hole ${String(r.holeCircCm).padStart(6)} cm  `
      + `${r.caught ? 'CAUGHT' : 'slipped'}  at ${String(r.restingAt).padEnd(10)} `
      + `slip ${String(r.slipCm).padStart(6)} cm  stretch ${r.maxStretchPct}%`) });
  console.log(`\ncaught up to r = ${s.caughtUpTocm} cm, slips from r = ${s.slipsFromcm} cm`);
  console.log(`critical hole radius ~ ${s.criticalInnerRcm} cm`);
} else if (mode === 'fabrics') {
  for (const name of Object.keys(FABRICS)) {
    const out = dropDisc(body, { innerR: 8, outerR: 28, edge: 2.6, seconds: 4, fabric: name });
    console.log(`  ${name.padEnd(18)} ${String(FABRICS[name].gsm).padStart(4)} gsm  `
      + `${out.weightG.toFixed(0).padStart(4)} g  hole y ${String(out.holeYcm).padStart(7)}  `
      + `stretch ${String(out.maxStretchPct).padStart(5)}%  ${out.verdict}`);
  }
} else if (mode === 'rect') {
  const out = dropRectangle(body, { width: 40, height: 40, edge: 2.2, seconds: 5 });
  console.table(scalars(out));
  console.log(`VERDICT: ${out.verdict}`);
}
console.log();
