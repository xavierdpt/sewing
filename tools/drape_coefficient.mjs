// The Cusick drape test, from the command line. todos/18-validation.md Step 2.
//
//   node tools/drape_coefficient.mjs                    every preset
//   node tools/drape_coefficient.mjs --fabric linen
//   node tools/drape_coefficient.mjs --edges 0.8,1.2    the mesh sweep
//   node tools/drape_coefficient.mjs --trace            DC against time
//   node tools/drape_coefficient.mjs --trace --no-drag  ...with the air off
//
// WHY THIS EXISTS AND WHY IT IS THE ONE TO BUILD FIRST. Every other number in
// this repo compares the solver against itself or against Blender. The drape
// coefficient is comparable with a value a textile lab publishes for a real
// cloth, on a scale whose ends are unambiguous: 100 is a sheet of card, 0 is
// a cloth with no stiffness at all. That makes it the instrument for the
// question that opened this work -- does this behave like linen, or like
// cardboard.
//
// It is NOT a check on the solver being right. It is a check on the solver
// being somewhere a real fabric could be, which is a weaker claim and the one
// currently in doubt.
import fs from 'node:fs';
import { FABRICS } from '../app/js/cloth.js';
import { drapeCoefficient, drapeTrace, verdictFor, PUBLISHED_DC } from '../app/js/cusick.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const only = flag('--fabric', null);
const edges = String(flag('--edges', flag('--edge', '1.0'))).split(',').map(Number);
const seconds = +flag('--settle', 8);
const names = only ? [only] : Object.keys(FABRICS);
const trace = args.includes('--trace');
// A buckling test on a perfectly symmetric specimen needs an imperfection to
// choose a mode; see setupCusick. Reported in the table so a jittered run is
// never confused with a clean one.
const jitterCm = +flag('--jitter', 0);
const every = +flag('--every', 2);

// THE DISCRIMINATOR FOR A DRAPE THAT FLATTENS AS IT RUNS. The folds decay
// (todos/18-validation.md 6.11); either energy is being taken out by the drag
// and damping terms, or the bending constraint is not holding its rest angle.
// Turning the first off answers which: if the folds persist with no drag and
// no internal damping, it is a damping calibration; if they still decay, the
// bending constraint is the cause and damping is exonerated.
const clothOpts = {};
if (args.includes('--no-drag')) { clothOpts.terminalCmPerSec = 0; clothOpts.linearDragPerSec = 0; }
if (args.includes('--no-damping')) clothOpts.internalDamping = 0;
// MEMBRANE LOCKING, the test for it. Stretch compliance is ~2e-7 against
// bending four orders softer, and stretch is solved first (docs/11-cloth.md).
// A flat strip bends without changing any edge length, but a disc draping
// over a support must bring each material circle down AND IN, shortening its
// circumference -- which a near-inextensible membrane can only do by
// buckling. If that is what is holding the specimen flat, softening the
// membrane should let it drape, and nothing else here should.
if (args.includes('--stretch')) clothOpts.stretch = +flag('--stretch', 2e-7);
// The other half of the same question: override the bending length directly.
// If the specimen stays flat even with bending near zero, bending is not what
// is holding it up and the membrane is.
if (args.includes('--bend')) clothOpts.bend = +flag('--bend', 1.7);
if (args.includes('--sweeps')) clothOpts.bendSweeps = +flag('--sweeps', 8);
// THE REPAIR UNDER TEST. BEND_SCALE is 30; the cantilever reads its asked
// bending length at ~1.8 (todos/18-validation.md 6.12). A constant fitted on
// the cantilever and not checked here is how this defect was introduced, so
// the drape has to agree before anything is changed in bending.js.
if (args.includes('--bend-scale')) clothOpts.bendScale = +flag('--bend-scale', 30);
for (const n of names) {
  if (!FABRICS[n]) {
    console.error(`no such fabric: ${n}\nhave: ${Object.keys(FABRICS).join(', ')}`);
    process.exit(2);
  }
}

// Synchronous writes: this loop is CPU-bound and never yields, so console.log
// to a pipe would buffer every line until the process exits. See the same
// note in tools/fabric.mjs, where it cost two abandoned runs to find.
const say = (l) => fs.writeSync(1, l);

say('Cusick drape test -- 30 cm specimen on an 18 cm support (BS 5058)\n');
say('DC: 100 = a sheet of card, 0 = no stiffness at all\n\n');

if (trace) {
  const off = [args.includes('--no-drag') ? 'no drag' : null,
    args.includes('--no-damping') ? 'no internal damping' : null].filter(Boolean);
  say(`DC against time -- ${names.join(', ')} at ${edges[0]} cm`
    + `${off.length ? `, ${off.join(' + ')}` : ''}\n`);
  say('DC climbing toward 100 is cloth LOSING its folds; DC flattening out has converged.\n\n');
  for (const name of names) {
    say(`  ${name}\n`);
    const r = drapeTrace({
      fabric: name, edge: edges[0], seconds: +flag('--seconds', 30), every, cloth: clothOpts, jitterCm,
      onSample: (row) => say(`    t ${String(row.t).padStart(5)}s  DC ${String(row.DC).padStart(5)}`
        + `  folds ${String(row.folds).padStart(2)}  rms ${String(row['rms cm/s']).padStart(6)} cm/s`
        + `${row['outline ok'] ? '' : '  OUTLINE SELF-CROSSES'}\n`),
    });
    const first = r.samples[0], last = r.samples[r.samples.length - 1];
    say(`    => DC ${first.DC} -> ${last.DC} over ${last.t}s`
      + `  (folds ${first.folds} -> ${last.folds})\n\n`);
  }
  process.exit(0);
}

const rows = [];
for (const edge of edges) {
  for (const name of names) {
    const t = Date.now();
    const r = drapeCoefficient({ fabric: name, edge, seconds, cloth: clothOpts, jitterCm });
    const verdict = verdictFor(name, r.DC);
    rows.push({
      fabric: name,
      'edge cm': edge,
      gsm: FABRICS[name].gsm,
      'bend cm': FABRICS[name].bendLengthCm,
      DC: r.DC,
      'hem fell cm': r.hemDropCm,
      'overhang cm': r.overhangCm,
      'jitter cm': jitterCm,
      'stretch': clothOpts.stretch ?? 'preset',
      'bendScale': clothOpts.bendScale ?? 30,
      published: PUBLISHED_DC[name] ? `${PUBLISHED_DC[name][0]}-${PUBLISHED_DC[name][1]}` : '--',
      folds: r.folds,
      'fold ceiling': r.foldCeiling,
      verts: r.vertices,
      settled: r.settled,
      'outline ok': r.starShaped,
      verdict,
    });
    say(`  ${String(edge).padStart(4)} cm  ${name.padEnd(18)}`
      + ` DC ${String(r.DC).padStart(5)}  hem fell ${String(r.hemDropCm).padStart(5)}/${r.overhangCm} cm`
      + `  folds ${String(r.folds).padStart(2)}/${r.foldCeiling}`
      + `  ${r.settled ? 'settled' : 'NOT SETTLED -- not a measurement'}`
      + `${r.starShaped ? '' : '  OUTLINE SELF-CROSSES -- area understated'}`
      + `   ${verdict}   [${((Date.now() - t) / 1000).toFixed(0)}s]\n`);
  }
}

say('\n');
console.table(rows);

const bad = rows.filter((r) => !r.settled || !r['outline ok']);
if (bad.length) {
  console.log(`\n${bad.length} row(s) are not measurements: `
    + bad.map((r) => `${r.fabric} @ ${r['edge cm']} cm`).join(', '));
  console.log('Raise --settle, or read todos/18-validation.md 6.11 before quoting them.');
}
