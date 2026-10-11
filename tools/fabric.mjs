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
// Whether an edge length was ASKED for. The Peirce run sizes the mesh to the
// specimen unless told otherwise, because the specimen length is what it is
// solving for and a fixed edge cannot resolve both ends of the sweep.
const edgeGiven = args.includes('--edge');
const specimenRows = +flag('--rows', 12);
// Settle runs the bisection may spend. 12 was not enough -- silk habotai
// spent all of them and reported a truncated bracket as an answer.
const maxSettles = +flag('--settles', 24);
// Specimen length for the analytic beam check. The default sizes it from the
// ASKED bending length for a tenth-of-span droop -- but the solver droops
// several times more than theory, so that default lands outside the
// small-deflection regime the closed form needs. Set it explicitly from a
// measured cEff instead: delta/L near 0.1 is the target, and `deltaOverL`
// reports where the run actually landed.
const spanCm = args.includes('--span') ? +flag('--span', 0) : null;
// The pre-2026-10-11 reading: a fixed overhang, with the crossing found along
// it. Kept only so the two can be compared; see `peirce` for why it is not a
// material property.
const useFixed = args.includes('--fixed');
const only = flag('--fabric', null);
const overhangCm = +flag('--overhang', 30);
const widthCm = +flag('--width', 5);
const substeps = +flag('--substeps', 20);
const bendSweeps = +flag('--sweeps', 8);
// Exposed because cloth.js:142 says "XPBD wants many substeps, one sweep
// each", while DEFAULTS ships 10 substeps with 8 stretch and 8 bend sweeps --
// the opposite allocation. Measured on the beam, doubling substeps is worth
// quadrupling bend sweeps exactly (40/8 and 20/32 both give dropRatio 18.1;
// 80/8 and 40/32 both give 4.8), so the question is whether the same total
// work spent on substeps instead of sweeps buys accuracy for free.
const stretchSweeps = args.includes('--stretchsweeps')
  ? +flag('--stretchsweeps', 8) : null;
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
/**
 * THE ANALYTIC CHECK: small-deflection beam theory, which the solver cannot
 * argue with.
 *
 * A cantilever of flexural rigidity D under its own areal weight w droops at
 * the tip by `delta = w L^4 / (8 D)` per unit width, for small deflections.
 * In this project's units D = w c^3, so the weight cancels and the prediction
 * is purely geometric:
 *
 *     delta = L^4 / (8 c^3)        and therefore    c = (L^4 / (8 delta))^(1/3)
 *
 * That is worth more than the Peirce reading for the question of §6.8,
 * because it has no threshold, no bisection and no 41.5 degree crossing in
 * it: just a specimen of known length, one settle, and one measured drop
 * against a closed form. If `c` comes back mesh-dependent HERE, the discrete
 * bending energy is wrong, and nothing about the instrument can be blamed.
 *
 * The specimen is sized for a tip drop of about a tenth of its length, which
 * is small enough for the linear theory to hold to a few per cent and large
 * enough to measure against the solver's own settling noise. `deltaOverL` is
 * reported so that judgement is the reader's and not buried.
 */
function beam(fabric, { bend = null, rows = 12, Lcm = null } = {}) {
  const ask = bend ?? FABRICS[fabric].bendLengthCm;
  const L = Lcm ?? +(ask * Math.cbrt(0.8)).toFixed(3);
  const eff = edgeGiven ? edgeCm : Math.max(0.02, L / rows);
  const clampCm = Math.max(2, L);
  const pattern = rectanglePattern({ width: widthCm, height: L + clampCm, edge: eff });
  const asm = sewFlat(pattern, { y: 0 });
  const z0 = -(L + clampCm) / 2;
  const clampTo = z0 + clampCm;
  asm.verts.forEach((p, i) => { asm.pinned[i] = p[2] <= clampTo + 1e-6; });
  const xs = [...new Set(asm.verts.map((p) => +p[0].toFixed(5)))];
  const xMid = xs.reduce((a, x) => (Math.abs(x) < Math.abs(a) ? x : a), xs[0]);
  const line = asm.verts
    .map((p, i) => ({ i, x: p[0], z: p[2] }))
    .filter((q) => Math.abs(q.x - xMid) < 1e-6 && q.z >= clampTo - 1e-6)
    .sort((a, b) => a.z - b.z)
    .map((q) => q.i);
  const sim = new Cloth(asm, null, {
    fabric, bend, substeps, bendSweeps, selfCollision: false, floorY: null,
    terminalCmPerSec: 0, linearDragPerSec: 1.0,
    ...(stretchSweeps ? { stretchSweeps } : {}),
  });
  const settle = sim.settle({ maxSeconds: 12 });
  const o = asm.verts[line[0]], t = asm.verts[line[line.length - 1]];
  const delta = o[1] - t[1];
  const predicted = (L ** 4) / (8 * ask ** 3);
  const cEff = delta > 1e-9 ? ((L ** 4) / (8 * delta)) ** (1 / 3) : null;
  return {
    specimenCm: L,
    // Constraint-solve work per frame, in sweep units: substeps x (stretch +
    // bend sweeps). The wall clock on a 150-vertex specimen is dominated by
    // node's startup and by how early the settle terminates, so it is not a
    // cost proxy; this is.
    workPerFrame: substeps * ((stretchSweeps ?? 8) + bendSweeps),
    rowCm: +eff.toFixed(3),
    rowsInL: +(L / eff).toFixed(1),
    dropCm: +delta.toFixed(4),
    predictedDropCm: +predicted.toFixed(4),
    dropRatio: +(delta / Math.max(1e-12, predicted)).toFixed(3),
    deltaOverL: +(delta / L).toFixed(3),
    cEffCm: cEff === null ? null : +cEff.toFixed(3),
    askedCm: ask,
    cRatio: cEff === null ? null : +(cEff / ask).toFixed(3),
    rmsCmPerSec: +sim.rmsSpeed().toFixed(3),
    settled: !!settle.settled,
  };
}

/**
 * The Peirce test as the lab runs it: slide the specimen out until the TIP
 * droops to 41.5 degrees, and report c = L/2 for that overhang.
 *
 * The version below (`cantilever`) clamps a FIXED overhang and finds where
 * along it the chord crosses 41.5. That is a different quantity and not a
 * material property: the strip's whole shape depends on how much of it is
 * hanging, so the answer moved 4x with the specimen length alone -- silk
 * habotai measured 2.423 cm at a 6 cm overhang, 1.204 at 10 and 0.588 at 30,
 * and the 30 cm default was the worst of them. Every bending verdict this
 * project recorded before 2026-10-11 came off that reading.
 *
 * The free length is found by regula falsi on the tip angle, which is
 * monotone in L, so four or five settles get there. The mesh is sized to the
 * SPECIMEN rather than fixed, because a 2 cm overhang on 1.5 cm triangles
 * cannot droop: `rows` is how many rows of cloth span the free length, and it
 * is the knob a convergence check turns.
 */
function peirce(fabric, { bend = null, rows = 12, maxEvals = maxSettles } = {}) {
  let evals = 0;
  const ask = bend ?? FABRICS[fabric].bendLengthCm;
  // THE MESH MUST NOT DEPEND ON THE UNKNOWN. Sizing it as `L / rows` -- the
  // obvious thing, and what this did first -- makes the measurement chase its
  // own tail: a shorter trial length gives a finer mesh, a finer mesh gives a
  // limper cloth (section 6.8), a limper cloth droops at a shorter length
  // still. Silk habotai ran away to an 0.45 cm overhang on 0.037 cm triangles,
  // which is a specimen barely longer than the cloth is thick. So the element
  // size comes off the ASKED bending length and is held fixed across the
  // bisection; only the specimen length varies.
  const eff = edgeGiven ? edgeCm : Math.max(0.02, ask / rows);
  const tipAngle = (L) => {
    evals++;
    const clampCm = Math.max(3, L);
    const pattern = rectanglePattern({
      width: widthCm, height: L + clampCm, edge: eff,
    });
    const asm = sewFlat(pattern, { y: 0 });
    const z0 = -(L + clampCm) / 2;
    const clampTo = z0 + clampCm;
    asm.verts.forEach((p, i) => { asm.pinned[i] = p[2] <= clampTo + 1e-6; });
    const xs = [...new Set(asm.verts.map((p) => +p[0].toFixed(5)))];
    const xMid = xs.reduce((a, x) => (Math.abs(x) < Math.abs(a) ? x : a), xs[0]);
    const line = asm.verts
      .map((p, i) => ({ i, x: p[0], z: p[2] }))
      .filter((q) => Math.abs(q.x - xMid) < 1e-6 && q.z >= clampTo - 1e-6)
      .sort((a, b) => a.z - b.z)
      .map((q) => q.i);
    if (line.length < 3) return null;
    const sim = new Cloth(asm, null, {
      fabric, bend, substeps, bendSweeps, selfCollision: false, floorY: null,
      terminalCmPerSec: 0, linearDragPerSec: 1.0,
      ...(stretchSweeps ? { stretchSweeps } : {}),
    });
    sim.settle({ maxSeconds: 10 });
    const o = asm.verts[line[0]], t = asm.verts[line[line.length - 1]];
    const dh = Math.hypot(t[0] - o[0], t[2] - o[2]);
    return Math.atan2(o[1] - t[1], Math.max(1e-9, dh)) / DEG;
  };

  // Centred on the answer Peirce's own definition predicts, L = 2c, rather
  // than reaching five times past it: the trials at large L carry the whole
  // cost of this measurement, because the mesh is fixed and the specimen is
  // what grows. The halving and doubling below still rescue a bracket that
  // turns out to be on the wrong side.
  let lo = Math.max(0.3, 1.2 * ask), hi = Math.max(lo * 1.5, 3.2 * ask);
  let aLo = tipAngle(lo), aHi = tipAngle(hi);
  // A limp cloth droops past 41.5 even at the short end, a stiff one not even
  // at the long end: widen until the crossing is bracketed.
  while (aLo !== null && aLo > PEIRCE_DEG && lo > 0.15 && evals < maxEvals) {
    hi = lo; aHi = aLo; lo = lo / 2; aLo = tipAngle(lo);
  }
  while (aHi !== null && aHi < PEIRCE_DEG && hi < 80 && evals < maxEvals) {
    lo = hi; aLo = aHi; hi = hi * 2; aHi = tipAngle(hi);
  }
  if (aLo === null || aHi === null || aLo > PEIRCE_DEG || aHi < PEIRCE_DEG) {
    return { bendLengthCm: null, overhangCm: null, evals, bracketed: false };
  }
  while (evals < maxEvals && (hi - lo) > 0.01 * Math.max(0.3, lo)) {
    const span = aHi - aLo;
    let mid = span > 1e-9 ? lo + (PEIRCE_DEG - aLo) * (hi - lo) / span : (lo + hi) / 2;
    mid = Math.min(hi - 1e-4, Math.max(lo + 1e-4, mid));
    const a = tipAngle(mid);
    if (a === null) break;
    if (a < PEIRCE_DEG) { lo = mid; aLo = a; } else { hi = mid; aHi = a; }
  }
  const L = (lo + hi) / 2;
  return {
    converged: (hi - lo) <= 0.01 * Math.max(0.3, lo),
    bracketCm: +(hi - lo).toFixed(3),
    bendLengthCm: +(L / 2).toFixed(3),
    overhangCm: +L.toFixed(2),
    rowCm: +eff.toFixed(3),
    rowsSpanningL: +(L / eff).toFixed(1),
    evals,
    bracketed: true,
  };
}

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
  // The 41.5 degree crossing lands BETWEEN two rows of vertices, and it has
  // to be interpolated there rather than snapped to the row that straddles
  // it. Snapping quantised the whole instrument to `edge/2`: every reading
  // came back as an integer multiple of half a triangle, so at 1.5 cm
  // triangles fabrics asking for bending lengths of 0.8, 1.1 and 1.4 cm all
  // measured 0.75, and silk habotai measured 0.50 / 0.75 / 1.13 / 1.50 at
  // edges 1.0 / 1.5 / 2.2 / 3.0 -- which is edge/2 every time and nothing to
  // do with the silk. Every verdict this tool printed was that artifact,
  // including a spurious "in range" for a fabric whose stiffness it could not
  // resolve at all, and an "interfaced twill is 1.6x too stiff" that was
  // thirteen rows of 0.75.
  let prevS = 0, prevAngle = 0, pitchCm = 0;
  for (let k = 1; k < mid.length; k++) {
    const a = mid[k - 1].p, b = mid[k].p;
    const ds = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (k === 1) pitchCm = ds;
    s += ds;
    const dy = origin[1] - b[1];
    const dh = Math.hypot(b[0] - origin[0], b[2] - origin[2]);
    const angleDeg = Math.atan2(dy, Math.max(1e-9, dh)) / DEG;
    tipDropCm = dy;
    if (bendLengthCm === null && angleDeg >= PEIRCE_DEG) {
      const span = angleDeg - prevAngle;
      const t = span > 1e-9
        ? Math.max(0, Math.min(1, (PEIRCE_DEG - prevAngle) / span)) : 0;
      bendLengthCm = (prevS + t * (s - prevS)) / 2;
    }
    prevS = s;
    prevAngle = angleDeg;
  }
  const f = FABRICS[fabric];
  const wMgPerCm2 = f.gsm / 100;            // g/m2 -> mg/cm2
  const tip = mid[mid.length - 1].p;
  // HOW MANY ROWS THE CROSSING SPANS -- the resolution of this reading, which
  // belongs beside it. Interpolating the 41.5 degree crossing removed the
  // quantisation to edge/2, but a crossing that falls inside the FIRST row is
  // still being extrapolated across a single element: the answer then depends
  // on where that one vertex sits, not on the cloth. A limp silk on a 30 cm
  // overhang crosses within the first row at every edge from 3.0 down to 1.0,
  // which is why its measured length kept tracking the mesh. Under about two
  // rows, the number is a bound, not a measurement -- so say so rather than
  // print it with a verdict attached.
  const rows = bendLengthCm === null ? null
    : (2 * bendLengthCm) / Math.max(1e-9, pitchCm);
  return {
    rowsToCrossing: rows === null ? null : +rows.toFixed(1),
    resolved: rows === null ? false : rows >= 2,
    rowPitchCm: +pitchCm.toFixed(2),
    // How far the tip reaches out from the clamp: a second, smooth reading of
    // the same stiffness, with no threshold in it, so it still says something
    // when the mesh is too coarse to resolve the 41.5 degree crossing.
    reachCm: +Math.hypot(tip[0] - origin[0], tip[2] - origin[2]).toFixed(2),
    rmsCmPerSec: +sim.rmsSpeed().toFixed(2),
    bendLengthCm: bendLengthCm === null ? null : +bendLengthCm.toFixed(3),
    rigidityMgCm: bendLengthCm === null ? null
      : +(wMgPerCm2 * bendLengthCm ** 3).toFixed(0),
    tipDropCm: +tipDropCm.toFixed(1),
    seconds: +sim.time.toFixed(1),
    settled: !!settle.settled,
  };
}

if (args.includes('--beam')) {
  const names = only ? [only] : Object.keys(FABRICS);
  const rowSweep = (flag('--rowsweep', '12,18,24')).split(',').map(Number);
  const out = [];
  for (const name of names) {
    for (const r of rowSweep) out.push({ fabric: name, ...beam(name, { rows: r, Lcm: spanCm }) });
  }
  console.log('analytic cantilever: delta = L^4 / (8 c^3), so c = (L^4 / 8 delta)^(1/3).'
    + ' No threshold, no bisection -- if cRatio moves with the row size, the discrete'
    + ' bending energy is mesh-dependent.');
  console.table(out);
  process.exit(0);
}

if (scan) {
  const rows = [];
  for (const ask of [0.8, 1.1, 1.4, 1.7, 2.3, 3.3, 5.0]) {
    const r = cantilever(only || 'cotton poplin', { bend: ask });
    rows.push({
      'asked cm': ask,
      'measured cm': r.bendLengthCm ?? `> ${(overhangCm / 2).toFixed(0)}`,
      rows: r.rowsToCrossing,
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
  const r = useFixed ? cantilever(name) : (() => {
    const q = peirce(name, { rows: specimenRows });
    // the same shape of record the table expects, plus what the bisection
    // converged on: the overhang IS the measurement here
    return { ...q, resolved: q.bracketed, rowsToCrossing: null, rigidityMgCm: null,
      tipDropCm: null, settled: q.bracketed, reachCm: null };
  })();
  const want = PUBLISHED[name];
  const verdict = r.bendLengthCm === null
    ? 'no 41.5 deg crossing inside the bracket'
    : r.resolved === false ? `UNRESOLVED: crossing inside ${r.rowsToCrossing} rows`
      + ` -- use edge <= ${(r.bendLengthCm).toFixed(2)} cm`
      : r.bendLengthCm < want[0] ? `${(want[0] / r.bendLengthCm).toFixed(1)}x too limp`
        : r.bendLengthCm > want[1] ? `${(r.bendLengthCm / want[1]).toFixed(1)}x too stiff`
          : 'in range';
  rows.push({
    fabric: name,
    gsm: FABRICS[name].gsm,
    'bend cm (asked)': FABRICS[name].bendLengthCm,
    'bending length cm': r.bendLengthCm ?? '--',
    'overhang cm': r.overhangCm ?? (useFixed ? overhangCm : '--'),
    'row cm': r.rowCm ?? (useFixed ? edgeCm : '--'),
    'rows in L': r.rowsSpanningL ?? '--',
    'published cm': `${want[0]} - ${want[1]}`,
    settles: r.evals ?? null,
    converged: r.converged === undefined ? '--' : r.converged,
    verdict,
  });
}
console.log(useFixed
  ? `cantilever (FIXED overhang -- not a material property, see peirce()):`
    + ` ${widthCm} x ${overhangCm} cm, ${edgeCm} cm triangles`
  : `Peirce cantilever: the overhang is bisected until the tip droops 41.5 deg,`
    + ` ${widthCm} cm wide, ${specimenRows} rows across the free length`
    + `${edgeGiven ? ` (overridden to ${edgeCm} cm triangles)` : ''}`);
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
