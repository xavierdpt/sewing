// What the fabrics in cloth.js actually DO, measured, against what the
// textile literature says they should.
//
//   node tools/fabric.mjs                 every preset, this solver
//   node tools/fabric.mjs --blender       the same strips through Blender
//   node tools/fabric.mjs --edge 1.0      at a different triangle size
//   node tools/fabric.mjs --fabric linen  just one
//
// The instrument is the PEIRCE CANTILEVER TEST, which is how a textile lab
// measures stiffness and the reason "bending length" is a number you can look
// up for real cloth. A strip is clamped at one end and allowed to droop under
// its own weight; the overhang length L at which the tip's chord from the
// clamp reaches 41.5 degrees below horizontal gives
//
//     bending length  c = L / 2                       cm
//     flexural rigidity G = w c^3                     mg cm, with w in mg/cm2
//
// It is the right instrument here because it is scale-free in exactly the way
// the complaint "this behaves like paper" is: a stiff cloth and a limp one
// differ in c, and c is in centimetres, so the simulation can be wrong by a
// factor and you can see the factor.
//
// Simulated the same way for every fabric: one strip, clamped, nothing else
// touching it, run until it stops moving.

import { Cloth, FABRICS, rigidityOf } from '../app/js/cloth.js';
import { rectanglePattern } from '../app/js/testpieces.js';
import { sewFlat } from '../app/js/patternio.js';
import { clothSettings } from '../app/js/drapejob.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const useBlender = args.includes('--blender');
const edgeCm = +flag('--edge', 1.5);
const only = flag('--fabric', null);
const overhangCm = +flag('--overhang', 30);
const widthCm = +flag('--width', 5);
const substeps = +flag('--substeps', 20);
const bendSweeps = +flag('--sweeps', 8);
// A sweep of asked-for bending lengths through the instrument, which is how
// the one calibration constant in cloth.js was fixed: ask for a length, read
// one back, and see whether the two are the same number.
const scan = args.includes('--scan');

// Bending length in cm, from the textile literature (Peirce 1930 and the
// standard cantilever test, BS 3356 / ASTM D1388). These are the numbers the
// simulation is being asked to reproduce; the ranges are what the same cloth
// measures across grain directions and finishes.
//
// Office paper is in the table on purpose. It is what the solver is being
// accused of behaving like, and it is the control: if a fabric measures up
// there, the complaint is right.
const PUBLISHED = {
  'cotton poplin': [1.5, 2.0],
  linen: [2.0, 2.6],
  'wool crepe': [1.6, 2.2],
  'silk habotai': [0.9, 1.4],
  'cotton jersey': [1.1, 1.8],
  denim: [2.8, 3.8],
  'interfaced twill': [4.0, 6.0],
  '(80 gsm office paper)': [5.0, 7.0],
};

const DEG = Math.PI / 180;
const PEIRCE_DEG = 41.5;

/**
 * Clamp a strip at one end and let it droop.
 *
 * The strip lies in the xz plane, width across x, overhang along +z, and the
 * row at z <= 0 is pinned: that is the lab's clamp, and it is the only thing
 * holding the cloth up.
 */
function cantilever(fabric, { bend = null } = {}) {
  const clampCm = 6;
  const pattern = rectanglePattern({
    width: widthCm, height: overhangCm + clampCm, edge: edgeCm,
  });
  const asm = sewFlat(pattern, { y: 0 });
  // the pattern is centred, so the clamp is everything behind z = -overhang/2
  const z0 = -(overhangCm + clampCm) / 2;
  const clampTo = z0 + clampCm;
  asm.verts.forEach((p, i) => { asm.pinned[i] = p[2] <= clampTo + 1e-6; });

  // The centreline, chosen on the FLAT strip before anything moves: after the
  // droop the vertices are no longer at tidy coordinates, and picking them by
  // their deformed positions quietly selects nothing.
  const xs = [...new Set(asm.verts.map((p) => +p[0].toFixed(5)))];
  const xMid = xs.reduce((a, x) => (Math.abs(x) < Math.abs(a) ? x : a), xs[0]);
  const line = asm.verts
    .map((p, i) => ({ i, x: p[0], z: p[2] }))
    .filter((q) => Math.abs(q.x - xMid) < 1e-6 && q.z >= clampTo - 1e-6)
    .sort((a, b) => a.z - b.z)
    .map((q) => q.i);

  const sim = new Cloth(asm, null, {
    fabric, bend, substeps, bendSweeps, selfCollision: false, floorY: null,
    // Still air: the cantilever test is a static measurement, and the drag
    // model is calibrated on a FALLING cloth. Leaving it in only decides how
    // long the strip takes to stop, but it would make the instrument depend
    // on a parameter it is not measuring.
    terminalCmPerSec: 0, linearDragPerSec: 1.0,
  });
  const settle = sim.settle({ maxSeconds: 12 });

  // The centreline of the strip, in order of distance along the cloth from
  // the clamp. Arclength is measured along the deformed centreline, which for
  // cloth this stiff is the cut length to within a fraction of a percent.
  const mid = line.map((i) => ({ p: asm.verts[i], i }));
  const origin = mid[0].p;
  let s = 0;
  let bendLengthCm = null;
  let tipDropCm = 0;
  for (let k = 1; k < mid.length; k++) {
    const a = mid[k - 1].p, b = mid[k].p;
    s += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const dy = origin[1] - b[1];
    const dh = Math.hypot(b[0] - origin[0], b[2] - origin[2]);
    const angleDeg = Math.atan2(dy, Math.max(1e-9, dh)) / DEG;
    tipDropCm = dy;
    if (bendLengthCm === null && angleDeg >= PEIRCE_DEG) bendLengthCm = s / 2;
  }
  const f = FABRICS[fabric];
  const wMgPerCm2 = f.gsm / 100;            // g/m2 -> mg/cm2
  const tip = mid[mid.length - 1].p;
  return {
    // How far the tip reaches out from the clamp: a second, smooth reading of
    // the same stiffness, with no threshold in it, so it still says something
    // when the mesh is too coarse to resolve the 41.5 degree crossing.
    reachCm: +Math.hypot(tip[0] - origin[0], tip[2] - origin[2]).toFixed(2),
    rmsCmPerSec: +sim.rmsSpeed().toFixed(2),
    bendLengthCm: bendLengthCm === null ? null : +bendLengthCm.toFixed(2),
    rigidityMgCm: bendLengthCm === null ? null
      : +(wMgPerCm2 * bendLengthCm ** 3).toFixed(0),
    tipDropCm: +tipDropCm.toFixed(1),
    seconds: +sim.time.toFixed(1),
    settled: !!settle.settled,
  };
}

if (scan) {
  const rows = [];
  for (const ask of [0.8, 1.1, 1.4, 1.7, 2.3, 3.3, 5.0]) {
    const r = cantilever(only || 'cotton poplin', { bend: ask });
    rows.push({
      'asked cm': ask,
      'measured cm': r.bendLengthCm ?? `> ${(overhangCm / 2).toFixed(0)}`,
      'reach cm': r.reachCm,
      'rms cm/s': r.rmsCmPerSec,
      settled: r.settled,
    });
  }
  console.log(`scan: ${only || 'cotton poplin'}, ${edgeCm} cm triangles, `
    + `${substeps} substeps, ${bendSweeps} bend sweeps`);
  console.table(rows);
  process.exit(0);
}

const names = only ? [only] : Object.keys(FABRICS);
const rows = [];
for (const name of names) {
  const r = cantilever(name);
  const want = PUBLISHED[name];
  const verdict = r.bendLengthCm === null ? 'did not reach 41.5 deg -- stiffer than paper'
    : r.bendLengthCm < want[0] ? `${(want[0] / r.bendLengthCm).toFixed(1)}x too limp`
      : r.bendLengthCm > want[1] ? `${(r.bendLengthCm / want[1]).toFixed(1)}x too stiff`
        : 'in range';
  rows.push({
    fabric: name,
    gsm: FABRICS[name].gsm,
    'bend cm (asked)': FABRICS[name].bendLengthCm,
    'bending length cm': r.bendLengthCm ?? `> ${(overhangCm / 2).toFixed(0)}`,
    'published cm': `${want[0]} - ${want[1]}`,
    'G mg cm': r.rigidityMgCm,
    'tip drop cm': r.tipDropCm,
    settled: r.settled,
    verdict,
  });
}
console.log(`cantilever: ${widthCm} x ${overhangCm} cm overhang, ${edgeCm} cm triangles`);
console.table(rows);

if (useBlender) {
  // What the side-car is actually told. The mapping lives in drapejob.js and
  // is the other half of the question: a preset that is right here is still
  // wrong if it arrives at Blender inverted.
  // Blender ships its own cloth presets, and they are the closest thing to an
  // independent opinion available here. The mapping in drapejob.js is
  // anchored on ONE of them -- Cotton, bending 0.5 -- and everything else
  // follows from this project's bending lengths. Where Blender has a preset
  // of its own for the same cloth, the two should agree; that agreement is
  // the check, and it is not fitted, because only the anchor was chosen.
  const BLENDER_PRESETS = {
    denim: 10, 'silk habotai': 0.05, 'cotton poplin': 0.5,
  };
  console.log('\nwhat drapejob.js sends Blender, against Blender\'s own presets:');
  console.table(Object.keys(FABRICS).map((name) => {
    const cs = clothSettings(name, 1000, 500);
    return {
      fabric: name,
      'bending length cm': FABRICS[name].bendLengthCm,
      'rigidity dyn cm': +rigidityOf(FABRICS[name].gsm, FABRICS[name].bendLengthCm).toFixed(0),
      'sent to blender': cs.bending,
      "blender's own preset": BLENDER_PRESETS[name] ?? '',
    };
  }));
}
