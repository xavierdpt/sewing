// Flared and gathered panels: assemble them, drape them, print the pattern.
//   node tools/skirt.mjs              one 4-panel flared skirt, in detail
//   node tools/skirt.mjs sweep        flare and gathers against fold count
//   node tools/skirt.mjs svg          -> out/skirt-pattern.svg and .json
import { writeFileSync } from 'node:fs';
import { Body } from '../app/js/body.js';
import { Cloth } from '../app/js/cloth.js';
import { flaredSkirtPattern, placeSkirt, hemProfile, assemblyReport,
  waistRing } from '../app/js/skirt.js';
import { patternSVG } from '../app/js/patternsvg.js';
import { floorOf } from '../app/js/droptest.js';

const mode = process.argv[2] || 'one';
const body = new Body();
const waistV = body.landmarkV('waist');

// Measure the waist seam on the body FIRST, then draft to what was measured:
// the ring at a given ease is not the tape measurement plus anything obvious.
const ring = waistRing(body, { waistV, ease: 1.0 });
console.log(`waist ring at 1 cm ease: ${ring.circumferenceCm.toFixed(1)} cm `
  + `(tape waist ${body.M.waist} cm)`);

function drape(opts, seconds = 10) {
  const pattern = flaredSkirtPattern({ waistV, waistCm: ring.circumferenceCm, ...opts });
  const { asm, hemIds, pinRamp } = placeSkirt(pattern, body, { ease: 1.0 });
  const sim = new Cloth(asm, body, { fabric: opts.fabric || 'linen', floorY: floorOf(body) });
  sim.pinRamp(pinRamp);        // pin the waistband on, rather than teleporting it
  const settle = sim.settle({ maxSeconds: seconds });
  return { pattern, asm, sim, settle, hem: hemProfile(asm), hemIds };
}

if (mode === 'one') {
  const panels = +(process.argv[3] || 4);
  const r = drape({ panels, hemCm: 160, lengthCm: 55, gather: 1.0 });
  const m = r.pattern.meta;
  console.log(`\n${m.panels} panels, waist ${m.waistCm} cm, hem ${m.hemCm} cm, `
    + `length ${m.lengthCm} cm`);
  console.log(`flare ${m.flareRatio}x, each panel a ${m.sectorAngleDeg} deg sector `
    + `of radius ${m.innerRadiusCm} cm`);
  console.log(`\nhow it assembles:`);
  console.table(assemblyReport(r.pattern));
  console.log(`seams: ${r.pattern.seams.map((s) => s.id || s).join(', ')}`);
  console.log(`\nhow it hangs (${r.settle.settled ? 'settled' : 'still moving'} at `
    + `${r.settle.seconds} s):`);
  console.table(r.hem);
  console.table(r.sim.report());
} else if (mode === 'sweep') {
  console.log('\nflare and gathers against the folds they produce:\n');
  console.log(' panels  cut             hem  | folds  depth  hem drop  hem len  stretch  settled');
  // Named the way a pattern book names it: how much of a circle the panels
  // make. The gather rows have NO flare at all (circleFraction 0, a straight
  // tube) so that gathering is isolated from flaring -- all of the extra cloth
  // is crammed into the waistband instead of released at the hem.
  const rows = [
    ['tube         ', { circleFraction: 0.001, gather: 1 }],
    ['quarter circle', { circleFraction: 0.25, gather: 1 }],
    ['half circle  ', { circleFraction: 0.5, gather: 1 }],
    ['full circle  ', { circleFraction: 1.0, gather: 1 }],
    ['gathered 1.5x', { circleFraction: 0.001, gather: 1.5 }],
    ['gathered 2.5x', { circleFraction: 0.001, gather: 2.5 }],
  ];
  for (const panels of [2, 4]) {
    for (const [label, o] of rows) {
      const r = drape({ panels, lengthCm: 55, edge: 4.0, ...o }, 6);
      const h = r.hem;
      const m = r.pattern.meta;
      console.log(`   ${panels}  ${label}  hem ${String(Math.round(m.hemCm)).padStart(3)} | `
        + `${String(h.folds).padStart(5)}  ${h.foldDepthCm.toFixed(1).padStart(5)}  `
        + `${h.hemLowYcm.toFixed(1).padStart(8)}  ${h.hemLengthCm.toFixed(0).padStart(7)}  `
        + `${r.sim.report().maxStretchPct.toFixed(1).padStart(6)}%  `
        + `${r.settle.settled ? 'yes' : 'no'}`);
    }
  }
} else if (mode === 'svg') {
  const pattern = flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm, hemCm: 160, lengthCm: 55, waistV,
  });
  writeFileSync('out/skirt-pattern.json', JSON.stringify(pattern, null, 1));
  const { svg, layout } = patternSVG(pattern, {
    title: '4-panel flared skirt', seamAllowanceCm: 1.0, fabricWidthCm: 140,
  });
  writeFileSync('out/skirt-pattern.svg', svg);
  console.log('wrote out/skirt-pattern.json and out/skirt-pattern.svg');
  console.log(`layout: ${layout.widthCm.toFixed(0)} x ${layout.heightCm.toFixed(0)} cm `
    + `of 140 cm fabric`);
  console.table(assemblyReport(pattern));
}
console.log();
