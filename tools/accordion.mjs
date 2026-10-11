// Does the cloth have thickness? Fold a strip, drop it, measure the heap.
//
//   node tools/accordion.mjs                 the default strip, both ways
//   node tools/accordion.mjs --fabric denim
//   node tools/accordion.mjs --layers 10 --pleat 8
//
// A pleated strip that lands on the floor must end up as a stack: as many
// layers as it was folded into, each taking up its own thickness plus the air
// the fold traps. A solver without self-collision answers zero -- every layer
// in the same plane -- and that is the single most recognisable way simulated
// cloth looks wrong.
//
// Nothing here tells the simulation what the answer is. The comparison is
// against `layers x clothThickness`, which is the solver's own contact
// distance, and against the SAME strip dropped with self-collision off, which
// is the control.
import { Body } from '../app/js/body.js';
import { dropAccordion } from '../app/js/droptest.js';
import { FABRICS } from '../app/js/cloth.js';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const fabric = flag('--fabric', 'cotton poplin');
const pleatCm = +flag('--pleat', 10);
const layers = +flag('--layers', 6);
const edge = +flag('--edge', 2.0);
const widthCm = +flag('--width', 20);
const gapCm = +flag('--gap', 1.2);
const angleDeg = +flag('--angle', 45);
const seconds = +flag('--seconds', 6);

const b = new Body();
b.includeArms = true; b.includeLegs = true;

const rows = [];
const run = (label, opts) => {
  const r = dropAccordion(b, {
    widthCm, lengthCm: pleatCm * layers, pleatCm, gapCm, edge, seconds, fabric,
    pleatAngleDeg: angleDeg, ...opts,
  });
  rows.push({
    cloth: label,
    layers: r.layers,
    // What the FOLD cost, before gravity did anything. The step-function fold
    // this test used to be given placed a crease edge at sqrt(row^2 + gap^2),
    // which is 56 % strain at 1 cm rows and a 1.2 cm gap -- so the strip was
    // released as a loaded spring and the heap it threw open was the recoil,
    // not the cloth. A stack measured over a strained crease is measuring the
    // crease, so the residual belongs in the table beside the stack.
    'pleat deg': r.asm.fold ? r.asm.fold.pleatAngleDeg : null,
    'rise cm': r.asm.fold ? r.asm.fold.layerRiseCm : null,
    'crease strain %': r.asm.fold ? r.asm.fold.creaseStrainPct : null,
    'rows per crease': r.asm.fold ? r.asm.fold.rowsPerCrease : null,
    'stack cm': r.stackCm,
    'layers resolved': +(r.stackCm / r.perLayerCm).toFixed(1),
    'footprint cm': r.footprintCm,
    settled: r.settled,
    seconds: r.seconds,
  });
  return r;
};

// Two contributions, separated. A limp cloth has no bending stiffness to hold
// its own folds open, so whatever stack it makes is the CONTACT doing it --
// and with contact switched off the same strip must land in one plane. An
// ordinary cloth adds loft on top: its folds cost energy to close, so the
// layers stay apart even with nothing stopping them interpenetrating, which
// is why the limp cloth is the control and not this one.
const r0 = run('limp (0.3 cm bending length)', { cloth: { selfCollision: true, bend: 0.3 } });
const r1 = run('limp, self-collision OFF', { cloth: { selfCollision: false, bend: 0.3 } });
run(`${fabric} as itself`, { cloth: { selfCollision: true } });
run(`${fabric}, self-collision OFF`, { cloth: { selfCollision: false } });

console.log(`${fabric}, ${FABRICS[fabric].gsm} gsm: ${layers} pleats of ${pleatCm} cm,`
  + ` ${widthCm} cm wide, ${edge} cm triangles, pleats open at ${angleDeg} deg.`
  + ` One layer of contact distance is ${r0.perLayerCm} cm,`
  + ` so ${layers} layers is ${(layers * r0.perLayerCm).toFixed(1)} cm.`);
console.table(rows);
console.log(r0.stackCm > 5 * r1.stackCm
  ? `the limp strip stands ${(r0.stackCm / Math.max(0.01, r1.stackCm)).toFixed(0)}x taller with`
    + ' self-collision on: the thickness is the layers keeping each other up'
  : 'the layers are passing through each other -- self-collision is not working');
