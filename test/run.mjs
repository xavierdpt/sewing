// Headless check of the whole geometry pipeline. No browser, no three.js.
//   node test/run.mjs
import { readFileSync } from 'node:fs';
import { LIBRARY, flatVertices, angleAlphabet } from '../app/js/tiles.js';
import { Body, SIZE_CHART, BELLY, BUTTOCKS, POSTURE, POSES, SHOULDER_SLOPE, INCH,
  standardSize } from '../app/js/body.js';
import { MeshSurface } from '../app/js/meshsurface.js';
import { Assembly } from '../app/js/assembly.js';
import { buildGridShell, quantize, growOntoSurface } from '../app/js/lattice.js';
import { relax, settle, worstEdges, clearanceReport, faceClearanceReport } from '../app/js/relax.js';
import { makePattern } from '../app/js/panels.js';
import { patternSVG } from '../app/js/patternsvg.js';
import { exportPatternJSON, importPatternJSON, sew, drape, fitReport } from '../app/js/patternio.js';
import { sewFlat } from '../app/js/patternio.js';
import { SDF } from '../app/js/sdf.js';
import { Cloth, BodyCollider, FABRICS } from '../app/js/cloth.js';
import { annulusPattern, rectanglePattern } from '../app/js/testpieces.js';
import { dropDisc, dropAccordion, neckFrame, floorOf } from '../app/js/droptest.js';
import { flaredSkirtPattern, placeSkirt, hemProfile, waistRing } from '../app/js/skirt.js';
import { layOut, weldStitched, assembleGarment } from '../app/js/assemble.js';
import { takeOutWedge, letInWedge, check as patternCheck,
  panelArea, movePiece, turnPiece, mirrorPiece, splitPiece, joinPieces,
  closedDartProfile, trueDarts, setAllowance, setGrain, editList,
  replayEdits } from '../app/js/patternedit.js';
import { exportFormJSON, importFormJSON, applyForm, formFileName } from '../app/js/formio.js';
import { DEG, dist, add, mul } from '../app/js/geom.js';
import { peirce } from '../app/js/cantilever.js';
import * as arrange from '../app/js/arrange.js';

const line = (s) => console.log(`\n=== ${s}`);
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) fails++;
};

line('tile library');
console.log('  angle alphabet (deg):', angleAlphabet().map((a) => a.toFixed(2)).join(' '));
for (const t of LIBRARY) {
  const s = t.anglesDeg.reduce((a, b) => a + b, 0);
  if (Math.abs(s - 180) > 1e-6) { check(`${t.id} angles sum to 180`, false, s.toFixed(6)); }
}
check('every tile closes to 180 deg', true);
check('R345 is 36.87/53.13/90',
  Math.abs(LIBRARY[0].anglesDeg[0] - 36.8699) < 1e-3 &&
  Math.abs(LIBRARY[0].anglesDeg[2] - 90) < 1e-9);
check('I556 apex = 2 * 36.87', Math.abs(LIBRARY.find((t) => t.id === 'I556').anglesDeg[2] - 73.7398) < 1e-3);
check('I558 apex = 2 * 53.13', Math.abs(LIBRARY.find((t) => t.id === 'I558').anglesDeg[2] - 106.2602) < 1e-3);
check('R6810 has 4x the area of R345', Math.abs(LIBRARY[1].area - 4 * LIBRARY[0].area) < 1e-9);

line('closure rule from docs/01-geometry.md section 2');
const fv = flatVertices({ maxDegree: 8 });
console.log(`  ${fv.length} flat-vertex multisets with degree <= 8`);
// the predicted pure-3-4-5 solutions: a copies of each acute angle + c right angles, a+c=4
const A = 36.8699, B = 53.1301;
for (let a = 0; a <= 4; a++) {
  const c = 4 - a;
  const want = [...Array(a).fill(A), ...Array(a).fill(B), ...Array(c).fill(90)]
    .sort((x, y) => x - y).map((x) => x.toFixed(2)).join(',');
  const found = fv.some((m) => m.slice().sort((x, y) => x - y).map((x) => x.toFixed(2)).join(',') === want);
  check(`flat vertex a=b=${a}, c=${c} (degree ${a * 2 + c}) exists`, found);
}
// and the rule's prohibition: unmatched acute angles can never close
const bad = fv.filter((m) => {
  const na = m.filter((x) => Math.abs(x - A) < 0.01).length;
  const nb = m.filter((x) => Math.abs(x - B) < 0.01).length;
  const only345 = m.every((x) => [A, B, 90].some((y) => Math.abs(x - y) < 0.01));
  return only345 && na !== nb;
});
check('no flat vertex uses the 3-4-5 acute angles unequally', bad.length === 0, `${bad.length} violations`);

line('the body: does it measure back to what was asked for?');
{
  const b = new Body();
  const got = b.measure();
  const asked = {
    bust: 92, underBust: 76, waist: 72, lowHip: 98,
    neckCircumference: 36, backLength: 41, apexToApex: 19,
  };
  for (const [k, v] of Object.entries(asked)) {
    const err = got[k] - v;
    console.log(`  ${k.padEnd(18)} asked ${String(v).padStart(5)}`
      + ` -> model ${got[k].toFixed(2).padStart(7)}  err ${err.toFixed(3).padStart(7)} cm`);
    check(`${k} measures back to within 1 mm`, Math.abs(err) < 0.1, `${err.toFixed(3)} cm`);
  }
  const apexToWaist = 54 - 30;        // front length minus bust height, both from CBNP
  check('apex-to-waist front measures back',
    Math.abs(got.apexToWaistFront - apexToWaist) < 0.1,
    `${(got.apexToWaistFront - apexToWaist).toFixed(3)} cm`);
  console.log(`  bust projection ${b.bustProjection.toFixed(2)} cm, apex ${b.heights.bust.toFixed(1)}`
    + ` cm above the waist (both derived, neither measured)`);
  check('bust projection is plausible', b.bustProjection > 2 && b.bustProjection < 9,
    `${b.bustProjection.toFixed(2)} cm`);
  check('the bust apex sits between the underbust and the shoulder',
    b.heights.bust > b.heights.underBust && b.heights.bust < b.heights.shoulder);

  // the interpolant must not overshoot: nothing may be wider than the widest ring
  let widest = 0;
  for (let j = 0; j <= 60; j++) for (let i = 0; i <= 60; i++) {
    widest = Math.max(widest, Math.abs(b.point(i / 60, j / 60)[0]));
  }
  const ringMax = Math.max(...b.rings.map((r) => r.a));
  check('the surface never overshoots its rings (monotone interpolation)',
    widest <= ringMax + 0.25, `${widest.toFixed(2)} vs ring max ${ringMax.toFixed(2)} cm`);
}

line('the body: units, sizes and shape options');
{
  const cm = new Body();
  const inches = new Body({
    units: 'in', height: 168 / INCH, bust: 92 / INCH, underBust: 76 / INCH,
    waist: 72 / INCH, lowHip: 98 / INCH, neckCircumference: 36 / INCH,
    backLength: 41 / INCH, bustHeightFromCBNP: 30 / INCH,
    frontLengthFromCBNP: 54 / INCH, backWidth: 35 / INCH, apexToApex: 19 / INCH,
  });
  const a = cm.measure(), c = inches.measure();
  check('inches and centimetres give the same body',
    Math.abs(a.bust - c.bust) < 0.05 && Math.abs(a.waist - c.waist) < 0.05,
    `bust ${a.bust.toFixed(2)} vs ${c.bust.toFixed(2)} cm`);

  for (const i of [0, 3, 7, 10]) {
    const b = new Body();
    b.applyStandardSize(i);
    const row = standardSize(i);
    const got = b.measure();
    const ok = Math.abs(got.bust - row.bust) < 0.3 && Math.abs(got.waist - row.waist) < 0.6
      && Math.abs(got.lowHip - row.lowHip) < 0.3;
    check(`standard size ${SIZE_CHART.labels.eu[i]} (EU) builds to its chart`, ok,
      `bust ${got.bust.toFixed(1)}/${row.bust} waist ${got.waist.toFixed(1)}/${row.waist}`);
  }

  const base = new Body();
  const shift = (changes) => {
    const o = new Body(changes);
    let mx = 0;
    for (let i = 0; i < 48; i++) for (const v of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
      mx = Math.max(mx, dist(base.point(i / 48, v), o.point(i / 48, v)));
    }
    return mx;
  };
  for (const [name, change] of [
    ['belly protuberance F', { bellyProtuberance: 'F' }],
    ['buttocks Very Curvy', { buttocksShape: 'Very Curvy' }],
    ['buttocks Very Flat', { buttocksShape: 'Very Flat' }],
    ['posture Round Shoulders', { posture: 'Round Shoulders' }],
    ['posture Saddle Back', { posture: 'Saddle Back' }],
    ['shoulder slope Very Sloping', { shoulderSlope: 'Very Sloping Shoulders' }],
  ]) {
    const d = shift(change);
    check(`${name} changes the body`, d > 0.4, `max shift ${d.toFixed(2)} cm`);
  }
  // and the shape options must not break the measurements
  const belly = new Body({ bellyProtuberance: 'F', buttocksShape: 'Very Curvy',
    posture: 'Saddle Back', shoulderSlope: 'Very Sloping Shoulders' });
  const bm = belly.measure();
  check('shape options preserve the measured girths',
    Math.abs(bm.bust - 92) < 0.3 && Math.abs(bm.waist - 72) < 0.3
    && Math.abs(bm.lowHip - 98) < 0.6,
    `bust ${bm.bust.toFixed(2)} waist ${bm.waist.toFixed(2)} hip ${bm.lowHip.toFixed(2)}`);
}

line('the lower body: hips, legs and landmarks');
{
  const b = new Body();
  const m = b.measure();
  const names = b.rings.map((r) => r.key);
  // The body is a tube from the crotch up, with a stub of neck above the nape
  // for necklines to be cut against. Below the crotch it is legs, not a tube.
  check('the ring stack runs crotch to the top of the neck',
    names[0] === 'crotch' && names[names.length - 1] === 'neckTop', names.join(' '));
  check('nothing wraps the legs any more',
    !names.includes('knee') && !names.includes('midThigh'), names.join(' '));
  check('the neck carries above the nape',
    b.ringHeights.neckTop > b.ringHeights.neck
    && Math.abs((b.ringHeights.neckTop - b.ringHeights.neck) - 7) < 1e-6,
    `${(b.ringHeights.neckTop - b.ringHeights.neck).toFixed(2)} cm`);
  check('the ring stack always ascends, whatever the measurements',
    b.rings.every((r, i) => i === 0 || r.y > b.rings[i - 1].y));
  check('a self-consistent body reports no warning', b.warning === null, b.warning || '');
  check('rings ascend in height',
    b.rings.every((r, i) => i === 0 || r.y > b.rings[i - 1].y));
  // the envelope must narrow from hip to knee, and the hip must be the widest
  const w = (k) => b.rings.find((r) => r.key === k).a;
  check('the hip is wider than the crotch',
    w('lowHip') > w('crotch'),
    `${w('lowHip').toFixed(1)} > ${w('crotch').toFixed(1)} cm`);
  // and the legs taper on their own, below the body
  const seg = b.legSegments()[0];
  check('the legs taper from thigh to knee', seg.rA > seg.rB,
    `${seg.rA.toFixed(2)} -> ${seg.rB.toFixed(2)} cm`);
  console.log(`  thigh ${m.thighGirth.toFixed(1)} cm, knee ${m.kneeGirth.toFixed(1)} cm,`
    + ` across the knees ${m.acrossKnees.toFixed(1)} cm`);
  check('leg girths measure back', Math.abs(m.thighGirth - 58) < 0.1
    && Math.abs(m.kneeGirth - 37) < 0.1);

  // named landmarks, because adding the legs moved every numeric v
  check('landmarks are ordered up the body',
    b.landmarkV('crotch') < b.landmarkV('lowHip')
    && b.landmarkV('lowHip') < b.landmarkV('waist')
    && b.landmarkV('waist') < b.landmarkV('bust')
    && b.landmarkV('bust') < b.landmarkV('neck'));
  const bodice = b.band('bodice'), skirt = b.band('skirt');
  check('the bodice band runs low hip to the nape',
    bodice.vLo > b.landmarkV('lowHip') - 0.02 && bodice.vHi < b.landmarkV('neck') + 0.02);
  check('no band reaches above the nape, so the neck stub is never cut into',
    ['bodice', 'skirt', 'dress', 'torso', 'full']
      .every((g) => b.band(g).vHi <= b.landmarkV('neck') + 1e-9));
  check('the skirt band runs crotch to waist',
    skirt.vHi < b.landmarkV('waist') + 0.02
    && Math.abs(skirt.vLo - b.landmarkV('crotch')) < 0.05);
  console.log(`  band areas: bodice ${(b.bandArea('bodice') / 10000).toFixed(3)} m2,`
    + ` skirt ${(b.bandArea('skirt') / 10000).toFixed(3)} m2,`
    + ` whole body ${(b.surfaceArea() / 10000).toFixed(3)} m2 (crotch to neck)`);

  // breadth and depth set the SHAPE; the girth still sets the size
  const wide = new Body({ hipWidth: 38, hipThickness: 24 });
  const deep = new Body({ hipWidth: 32, hipThickness: 30 });
  const wm = wide.measure(), dm = deep.measure();
  console.log(`  hip 98 cm as 38x24 -> ${wm.hipWidth.toFixed(1)}x${wm.hipThickness.toFixed(1)},`
    + ` as 32x30 -> ${dm.hipWidth.toFixed(1)}x${dm.hipThickness.toFixed(1)}`);
  check('hip breadth and depth change the cross section',
    wm.hipWidth > dm.hipWidth + 4 && wm.hipThickness < dm.hipThickness - 4);
  check('but the measured hip girth is still honoured',
    Math.abs(wm.lowHip - 98) < 0.2 && Math.abs(dm.lowHip - 98) < 0.2,
    `${wm.lowHip.toFixed(2)} / ${dm.lowHip.toFixed(2)} cm`);

  // legs articulate, like the arms
  const tipOfLeg = (changes) => new Body(changes).legSegments()[0].b;
  const restTip = tipOfLeg({});
  for (const [name, change] of [
    ['legs apart', { legSpread: 20 }],
    ['stride', { stride: 30 }],
    ['sitting', { legForward: 80 }],
  ]) {
    const d = dist(restTip, tipOfLeg(change));
    check(`${name} moves the leg`, d > 4, `${d.toFixed(1)} cm from rest`);
  }

  // the body must not be narrower at the crotch than the legs leaving it
  const span = b.legSpanAt(b.heights.crotch);
  const atCrotch = b.girthAt(b.landmarkV('crotch'));
  console.log(`  at the crotch: legs need ${span.perimeterCm.toFixed(1)} cm,`
    + ` the body offers ${atCrotch.toFixed(1)} cm`);
  check('the body is never narrower than the legs leaving it',
    atCrotch >= span.perimeterCm - 0.5,
    `${atCrotch.toFixed(1)} vs ${span.perimeterCm.toFixed(1)} cm`);

  // striding demands more room than standing: the whole point of the metric
  const walk = new Body({ stride: 22 });
  const offered = (y) => b.girthAt(b.vOfY(y));
  const still = b.clearanceProfile(offered, b.heights.crotch, b.heights.lowHip);
  const strode = walk.clearanceProfile(offered, b.heights.crotch, b.heights.lowHip);
  console.log(`  worst spare: standing ${still.worst.spareCm.toFixed(1)} cm,`
    + ` striding ${strode.worst.spareCm.toFixed(1)} cm`);
  check('a stride demands more room than standing',
    strode.worst.spareCm < still.worst.spareCm - 1,
    `${still.worst.spareCm.toFixed(1)} -> ${strode.worst.spareCm.toFixed(1)} cm`);
  check('standing in its own envelope does not bind', still.worst.spareCm > -1,
    `${still.worst.spareCm.toFixed(1)} cm`);

  // near-horizontal thighs are reported, not turned into a bogus girth
  const seated = new Body({ legForward: 85 });
  // a seated thigh barely descends, so sample a height it actually spans
  const seatY = (seated.legSegments()[0].a[1] + seated.legSegments()[0].b[1]) / 2;
  const sp = seated.legSpanAt(seatY);
  check('a seated thigh is flagged rather than measured as a girth',
    sp.nearHorizontal === true && sp.perimeterCm === 0);

  // legs as collision geometry
  const legs = b.legSegments();
  check('two legs, meeting at the crotch', legs.length === 2
    && Math.abs(legs[0].a[0] + legs[1].a[0]) < 1e-9);
  check('a point on the thigh axis is inside a leg',
    b.closestLeg([legs[0].a[0], -35, 0]).signed < 0);
  check('the crotch sits above the knee and below the hip',
    b.heights.knee < b.heights.crotch && b.heights.crotch < b.heights.lowHip);
}

line('arms, shoulders and predefined poses');
{
  const b = new Body();
  const joints = b.shoulderJoints();
  check('two shoulder joints, placed symmetrically',
    joints.length === 2 && Math.abs(joints[0].p[0] + joints[1].p[0]) < 1e-9);
  const segs = b.armSegments();
  check('upper arm radius comes from its girth',
    Math.abs(segs[0].r - 28 / (2 * Math.PI)) < 1e-9, `${segs[0].r.toFixed(2)} cm`);
  const inside = b.closestArm(segs[0].a);
  check('a point at the joint is inside the arm', inside.signed < 0,
    `${inside.signed.toFixed(2)} cm`);
  check('a point far away is outside the arm', b.closestArm([0, 0, 60]).signed > 0);

  const peri = (body, side = -1) => {
    const loop = body.armscye(side);
    let p = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i].p, c = loop[(i + 1) % loop.length].p;
      p += Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
    }
    return { loop, p };
  };
  const rest = peri(b);
  console.log(`  armscye at rest: ${rest.loop.length} points, ${rest.p.toFixed(1)} cm around`);
  check('the armscye is a closed loop of plausible size',
    rest.loop.length > 50 && rest.p > 30 && rest.p < 60, `${rest.p.toFixed(1)} cm`);
  check('left and right armscyes match on a symmetric body',
    Math.abs(rest.p - peri(b, 1).p) < 0.5);

  // reaching across pulls the armhole open; that is the whole point of poses
  const across = new Body();
  across.applyPose('Reach across');
  const ap = peri(across);
  console.log(`  armscye reaching across: ${ap.p.toFixed(1)} cm`
    + `  (+${(ap.p - rest.p).toFixed(1)} cm on rest)`);
  check('reaching across opens the armhole', ap.p > rest.p + 5,
    `${rest.p.toFixed(1)} -> ${ap.p.toFixed(1)} cm`);

  // each pose must move SOMETHING -- the later ones are leg poses, and
  // asserting that every pose moves the arm was simply the wrong question
  const tipsOf = (name) => {
    const x = new Body();
    x.applyPose(name);
    return {
      arm: x.armSegments().find((s2) => s2.side === -1).b,
      leg: x.legSegments().find((s2) => s2.side === -1).b,
    };
  };
  const restTips = tipsOf('Rest (standing)');
  for (const name of Object.keys(POSES)) {
    if (name === 'Rest (standing)') continue;
    const t = tipsOf(name);
    const da = dist(restTips.arm, t.arm), dl = dist(restTips.leg, t.leg);
    check(`pose "${name}" moves a limb`, Math.max(da, dl) > 3,
      `arm ${da.toFixed(1)} cm, leg ${dl.toFixed(1)} cm from rest`);
  }

  // arms must block cloth only when asked to
  const probe = [-(19.6 + 0.5), b.heights.shoulder - 2, 0];
  b.includeArms = false;
  const off = b.closestOnOffset(probe, 0);
  b.includeArms = true;
  const on = b.closestOnOffset(probe, 0);
  b.includeArms = false;
  check('arms join the collision test only when includeArms is set',
    on.signed <= off.signed + 1e-9,
    `${off.signed.toFixed(2)} -> ${on.signed.toFixed(2)} cm`);
}

line('parametric torso');
const torso = new Body();
const BAND = torso.band('bodice');
const gW = torso.girthAt(torso.landmarkV('waist'));
console.log(`  waist girth ${gW.toFixed(1)} cm (asked 72)`);
check('waist girth within 2% of the measurement', Math.abs(gW - 72) / 72 < 0.02);
const area = torso.bandArea('bodice');
console.log(`  bodice band area ${area.toFixed(0)} cm2 = ${(area / 10000).toFixed(2)} m2`
  + `, whole body ${(torso.surfaceArea() / 10000).toFixed(2)} m2 (knee to neck)`);
check('bodice band area is in the 0.3-0.6 m2 range the doc assumes',
  area > 3000 && area < 6000, `${(area / 10000).toFixed(2)} m2`);
const probe = torso.closestPoint([0, 20, 40]);
check('closestPoint reports a point outside the body', probe.signed > 0, `signed ${probe.signed.toFixed(2)}`);
check('closestPoint reports a point inside the body', torso.closestPoint([0, 0, 0]).signed < 0);

line('CC0 MakeHuman bodice mesh');
const obj = readFileSync(new URL('../app/models/bodice.obj', import.meta.url), 'utf8');
const body = new MeshSurface(obj);
console.log(`  ${body.pos.length} vertices, ${body.tris.length} triangles,`
  + ` y ${body.yMin.toFixed(1)}..${body.yMax.toFixed(1)} cm`);
console.log(`  girth at waist (v=0.40) ${body.girthAt(0.40).toFixed(1)} cm,`
  + ` at bust (v=0.65) ${body.girthAt(0.65).toFixed(1)} cm`);
check('mesh loaded with triangles', body.tris.length > 1000);
check('axis point is inside the mesh', body.closestPoint([0, 0, 0]).signed < 0);
check('far point is outside the mesh', body.closestPoint([0, 0, 60]).signed > 0);

line('explicit joining: one tile attached to another by a RELATION');
{
  const a = new Assembly({ u: 2 });
  a.seedOnSurface(torso, 'R345', 0.0, 0.55);
  const e0 = a.boundaryEdges()[0];
  const flat = a.attach(e0, 'R345', 0, true);
  check('attach at fold 0 succeeds', flat >= 0);
  const st = a.stats();
  check('two tiles, four vertices, five edges',
    st.tiles === 2 && st.vertices === 4 && st.edges === 5,
    JSON.stringify({ t: st.tiles, v: st.vertices, e: st.edges }));
  check('all edges at their exact library length', st.maxStrain < 1e-9,
    `max strain ${st.maxStrain.toExponential(2)}`);
  // folding must change the geometry but never the edge lengths
  const b = new Assembly({ u: 2 });
  b.seedOnSurface(torso, 'R345', 0.0, 0.55);
  b.attach(b.boundaryEdges()[0], 'R345', 55, true);
  check('fold 55 deg also keeps every edge exact', b.stats().maxStrain < 1e-9);
  // a vertex ringed by tiles should report angle defect
  const c = new Assembly({ u: 2, weldTol: 0.2 });
  c.seedOnSurface(torso, 'E4', 0.0, 0.55);
  let n = 1;
  for (let k = 0; k < 8 && n < 6; k++) {
    const be = c.boundaryEdges();
    // always build around the shared centre vertex 0
    const e = be.find((x) => x.a === 0 || x.b === 0);
    if (!e) break;
    if (c.attach(e, 'E4', 0, false) >= 0) n++;
  }
  const d = c.angleDefects().filter((x) => x !== null);
  console.log(`  equilateral fan: ${c.tiles.length} tiles, interior vertices ${d.length},`
    + ` defect ${d.map((x) => x.toFixed(2)).join(',')}`);
  check('six flat equilaterals round a vertex give defect 0',
    d.length === 1 && Math.abs(d[0]) < 1e-6, d.length ? d[0].toFixed(6) : 'none');
}

line('grid shell on the parametric torso, u = 2 cm');
let shell = buildGridShell(torso, { u: 2, ...BAND, ease: 0.8 });
console.log(`  grid ${shell.meta.cols} x ${shell.meta.rows}, mean tile fit error`
  + ` ${(shell.meta.meanTileErr * 100).toFixed(1)}%`);
let s0 = shell.stats(torso, 0.8);
console.log('  before relax:', fmt(s0));
check('tile count is near the ~165 the doc predicts for u=2cm',
  shell.tiles.length > 120 && shell.tiles.length < 260, `${shell.tiles.length} tiles`);
check('closed tube: no boundary edges except top and bottom rings',
  s0.boundaryEdges === 2 * shell.meta.cols, `${s0.boundaryEdges} vs ${2 * shell.meta.cols}`);
check('DOF formula: triangulated tube is nearly rigid', s0.dof < shell.meta.cols * 3,
  `dof ${s0.dof}`);

line('static relaxation ("let it fall on the bodice")');
const r1 = relax(shell, torso, { iters: 60, ease: 0.8, attract: 0.4, gravity: 0.02 });
console.log('  after relax:', fmt(r1.stats));
check('edge strain is driven down', r1.stats.rmsStrain < s0.rmsStrain,
  `${(s0.rmsStrain * 100).toFixed(1)}% -> ${(r1.stats.rmsStrain * 100).toFixed(1)}%`);
// Flat tiles spanning a curved body MUST stand off by about ease + chord sag,
// so the meaningful test is the gap to the real body, not to the ease surface.
const cl1 = clearanceReport(shell, torso);
const fc1 = faceClearanceReport(shell, torso, 0);   // against the real body, not the ease shell
console.log(`  gap to body: min ${cl1.minGapCm.toFixed(2)} mean ${cl1.meanGapCm.toFixed(2)}`
  + ` max ${cl1.maxGapCm.toFixed(2)} cm; faces cutting in: ${fc1.tilesCuttingIn}`);
check('no corner touches the body', cl1.minGapCm > 0, `min gap ${cl1.minGapCm.toFixed(2)} cm`);
check('mean standoff is ease plus roughly one chord sag',
  cl1.meanGapCm > 0.8 && cl1.meanGapCm < 0.8 + 2.5, `${cl1.meanGapCm.toFixed(2)} cm`);
// A flat tile of edge h over curvature radius R sags h^2/(8R). With u = 2 cm
// the tiles are 6-10 cm, and the parametric bust apex is sharp, so at only
// 0.8 cm of ease some faces MUST cut in -- that is geometry, not a solver bug.
// What has to hold is that the penetration is bounded by the predicted sag and
// that it is eliminated by giving the shell that much ease.
check('face penetration is bounded by the predicted chord sag',
  fc1.deepestFaceCm < 10 * 10 / (8 * 4), `deepest ${fc1.deepestFaceCm.toFixed(2)} cm`);
{
  // Penetration must fall monotonically with ease and reach zero. The ease it
  // takes depends on how sharp the bust is, so assert the relationship rather
  // than a fixed number -- sharpening the body model moved the threshold from
  // 2.5 cm to 3.0 cm, which is the behaviour, not a regression.
  const probe = [0.4, 1.2, 2.5, 5.0].map((ease) => {
    const sh = buildGridShell(torso, { u: 2, ...BAND, ease });
    relax(sh, torso, { iters: 60, ease, attract: 0.4, tangentDrift: 1, edgePasses: 4 });
    const r = faceClearanceReport(sh, torso, 0);
    return { ease, tiles: r.tilesCuttingIn, deep: r.deepestFaceCm };
  });
  console.log('  ease -> tiles cutting in / deepest: '
    + probe.map((p) => `${p.ease}cm ${p.tiles}/${p.deep.toFixed(2)}`).join('  '));
  check('face penetration falls as ease rises',
    probe[0].tiles > probe[1].tiles && probe[1].tiles > probe[2].tiles
    && probe[2].tiles >= probe[3].tiles);
  // depth is the meaningful quantity: one tile grazing by a fraction of a
  // millimetre is not the same failure as a shell buried in the bust
  check('enough ease makes the penetration negligible (tools/ease_sweep.mjs)',
    probe[3].deep < 0.2, `${probe[3].deep.toFixed(3)} cm at 5.0 cm ease`);
}

console.log('  worst edges:', JSON.stringify(worstEdges(shell, 3)));

line('local/global settle: relax + requantise to the library');
const { asm: settled, log } = settle(shell, torso, quantize, {
  rounds: 8,
  relaxOpts: { iters: 40, ease: 0.8, attract: 0.4, tangentDrift: 1, edgePasses: 4 },
  quantizeOpts: {},
});
for (const L of log) {
  console.log(`  round ${String(L.round).padEnd(5)} strain ${(L.rmsStrain * 100).toFixed(2)}%`
    + `  fit ${L.rmsFitCm.toFixed(3)} cm  reassigned ${L.reassigned ?? '-'}`);
}
const sf = settled.stats(torso, 0.8);
// 6-7% rms seam-length error is the library's genuine quantisation residual at
// u = 2 cm (see tools/sweep.mjs); fabric shear and lacing absorb it.
check('settled strain under 11%', sf.rmsStrain < 0.11, `${(sf.rmsStrain * 100).toFixed(2)}%`);
const clf = clearanceReport(settled, torso);
check('settled shell still clears the body everywhere', clf.minGapCm > 0,
  `min gap ${clf.minGapCm.toFixed(2)} cm, mean ${clf.meanGapCm.toFixed(2)} cm`);
check('edge-length conflicts nearly eliminated by the consistent quantiser',
  sf.conflictEdges <= 15, `${sf.conflictEdges} conflicting edges, worst ${sf.maxConflictCm.toFixed(2)} cm`);
console.log('  tiles used:', JSON.stringify(settled.tileHistogram()));
console.log(`  total defect ${sf.totalDefectDeg.toFixed(1)} deg over ${sf.interiorVertices} interior vertices`);
console.log(`  mean |defect| ${sf.meanAbsDefectDeg.toFixed(2)} deg`);
console.log(`  seam length ${(sf.seamLengthCm / 100).toFixed(2)} m, shell area ${(sf.areaCm2 / 10000).toFixed(3)} m2`);
console.log(`  edge-target conflicts: ${sf.conflictEdges} edges, worst ${sf.maxConflictCm.toFixed(2)} cm`);

line('grid shell on the CC0 bodice mesh');
const shell2 = buildGridShell(body, { u: 2, ...BAND, ease: 1.0 });
console.log(`  grid ${shell2.meta.cols} x ${shell2.meta.rows}, ${shell2.tiles.length} tiles`);
const r2 = relax(shell2, body, { iters: 80, ease: 1.0, attract: 0.4, tangentDrift: 1 });
console.log('  after relax:', fmt(r2.stats));
const cl2 = clearanceReport(shell2, body);
console.log(`  gap to body: min ${cl2.minGapCm.toFixed(2)} mean ${cl2.meanGapCm.toFixed(2)} cm`);
check('fits the scanned-style mesh too', cl2.minGapCm > -0.1 && r2.stats.rmsStrain < 0.12,
  `min gap ${cl2.minGapCm.toFixed(2)} cm, strain ${(r2.stats.rmsStrain * 100).toFixed(1)}%`);

line('greedy frontier growth (the explicit relation mode)');
const g = new Assembly({ u: 2, weldTol: 0.5 });
g.seedOnSurface(torso, 'R345', 0.0, 0.55, { ease: 0.8 });
const gr = growOntoSurface(g, torso, { maxTiles: 60, ease: 0.8, allow: ['R345', 'E4', 'I443', 'I554'] });
console.log(`  grown ${gr.tiles} tiles (added ${gr.added}, edges rejected ${gr.rejected})`);
const gs = g.stats(torso, 0.8);
console.log('  ', fmt(gs));
check('growth produced a connected patch', gr.tiles > 15, `${gr.tiles} tiles`);
// Welding a new vertex onto a nearby existing one trades exactness for closure,
// so the bound is the weld tolerance over the shortest edge, not zero.
check('grown patch edges stay within the weld tolerance',
  gs.maxStrain < g.weldTol / (3 * g.u), `max strain ${(gs.maxStrain * 100).toFixed(1)}%`);

line('pattern: coarsen, dart, flatten, nest');
{
  const shell = buildGridShell(torso, { u: 1, cols: 8, rows: 36, ...BAND, ease: 1.0 });
  const { panels } = makePattern(shell, { mode: 'strips', stripWidth: 1, surface: torso });
  const overlaps = panels.reduce((a, p) => a + p.overlaps, 0);
  const darts = panels.reduce((a, p) => a + p.darts.length, 0);
  const worstErr = Math.max(...panels.map((p) => p.maxEdgeErr));
  const flatArea = panels.reduce((a, p) => a + p.areaCm2, 0);
  const bodyArea = torso.bandArea('bodice');
  console.log(`  ${panels.length} gores, ${darts} darts, ${overlaps} self-overlaps,`
    + ` flat area ${(flatArea / 10000).toFixed(3)} m2 vs body ${(bodyArea / 10000).toFixed(3)} m2`);
  check('one gore per requested panel', panels.length === 8, `${panels.length}`);
  // A one-cell-wide strip has no interior vertices, so it is developable and
  // flattens exactly with no darts at all. This is why gores exist.
  check('gores need no darts', darts === 0, `${darts} darts`);
  check('no gore self-overlaps when flattened', overlaps === 0, `${overlaps}`);
  check('unfold is exact to machine precision', worstErr < 1e-10, `${worstErr.toExponential(2)} cm`);
  // The gores are cut at 1 cm of ease, so they legitimately cover a little more
  // than the bare body. Under 100% means the panels are chording across the
  // body's horizontal curvature and will fit badly.
  check('flat area covers the body band, plus ease',
    flatArea / bodyArea > 0.95 && flatArea / bodyArea < 1.15,
    `${(100 * flatArea / bodyArea).toFixed(1)}% of the bodice band`);
  // more gores must capture more of the body
  const cap = (g) => {
    const sh = buildGridShell(torso, { u: 1, cols: g, rows: 36, ...BAND, ease: 1.0 });
    const r = makePattern(sh, { mode: 'strips', stripWidth: 1, surface: torso });
    return r.panels.reduce((a, p) => a + p.areaCm2, 0) / bodyArea;
  };
  const c4 = cap(4), c12 = cap(12);
  console.log(`  area capture (vs the bodice band): 4 gores ${(c4 * 100).toFixed(1)}%,`
    + ` 8 gores ${(100 * flatArea / bodyArea).toFixed(1)}%, 12 gores ${(c12 * 100).toFixed(1)}%`);
  check('more gores capture more of the body', c4 < flatArea / bodyArea && flatArea / bodyArea < c12);

  // widening the strips reintroduces interior vertices, hence darts
  const wide = makePattern(shell, { mode: 'strips', stripWidth: 2, surface: torso });
  const wDarts = wide.panels.reduce((a, p) => a + p.darts.length, 0);
  console.log(`  strip width 2: ${wide.panels.length} panels, ${wDarts} darts,`
    + ` ${wide.panels.reduce((a, p) => a + p.overlaps, 0)} overlaps`);
  check('wider strips need darts', wDarts > 0, `${wDarts}`);

  const asJSON = exportPatternJSON(panels, { gores: 8, rows: 36, ease: 1.0, waistV: 2 / 7 }, shell);
  const { svg } = patternSVG(asJSON, { seamAllowanceCm: 1.0, showTiles: false });
  check('SVG is well formed and in mm', svg.startsWith('<?xml') && svg.includes('mm"')
    && svg.trimEnd().endsWith('</svg>'));
  check('SVG has one group per panel',
    (svg.match(/<g id="P\d\d">/g) || []).length === panels.length);
  check('SVG carries a cut line and a stitch line for each panel',
    (svg.match(/class="cut"/g) || []).length === panels.length
    && (svg.match(/class="stitch"/g) || []).length === panels.length);
}

line('angle defect uses real geometry, not nominal library angles');
{
  const fine = buildGridShell(torso, { u: 1, ...BAND, ease: 1.0 });
  const coarse = buildGridShell(torso, { u: 2, ...BAND, ease: 1.0 });
  const f = fine.stats(torso, 1.0), c = coarse.stats(torso, 1.0);
  console.log(`  mean |defect|: u=2 ${c.meanAbsDefectDeg.toFixed(2)} deg,`
    + ` u=1 ${f.meanAbsDefectDeg.toFixed(2)} deg`);
  console.log(`  total defect:  u=2 ${c.totalDefectDeg.toFixed(0)} deg,`
    + ` u=1 ${f.totalDefectDeg.toFixed(0)} deg`);
  // refining spreads a FIXED amount of curvature over more vertices
  check('per-vertex defect falls as the mesh is refined',
    f.meanAbsDefectDeg < c.meanAbsDefectDeg * 0.6,
    `${c.meanAbsDefectDeg.toFixed(2)} -> ${f.meanAbsDefectDeg.toFixed(2)}`);
  check('total curvature is resolution independent (Gauss-Bonnet)',
    Math.abs(f.totalDefectDeg - c.totalDefectDeg) / Math.abs(c.totalDefectDeg) < 0.30,
    `${c.totalDefectDeg.toFixed(0)} vs ${f.totalDefectDeg.toFixed(0)} deg`);
}

line('pattern round trip: export, sew, drape');
{
  const shell = buildGridShell(torso, { u: 1, cols: 8, rows: 36, ...BAND, ease: 1.0 });
  const { panels } = makePattern(shell, { mode: 'strips', stripWidth: 1, surface: torso });
  const json = exportPatternJSON(panels, { gores: 8, rows: 36, ease: 1.0, ...BAND }, shell);
  const reloaded = importPatternJSON(JSON.stringify(json));
  check('pattern JSON round-trips', reloaded.panels.length === 8);
  // the pattern must say which edge joins which, and which way is up
  check('every seam is identified', reloaded.seams.length === 8, `${reloaded.seams.length}`);
  check('the seams close the tube',
    reloaded.seams.every((sm) => sm.a !== sm.b)
    && new Set(reloaded.seams.flatMap((sm) => [sm.a, sm.b])).size === 8);
  const runs0 = reloaded.panels[0].runs;
  console.log('  P01 edges: ' + runs0.map((r) => `${r.kind}${r.seam ? ' ' + r.seam
    + '->' + r.partnerName : ''} (${r.lengthCm}cm)`).join(', '));
  check('each gore has a top, a bottom and two seams',
    runs0.filter((r) => r.kind === 'seam').length === 2
    && runs0.some((r) => r.kind === 'top') && runs0.some((r) => r.kind === 'bottom'));
  check('both sides of a seam are the same length', (() => {
    for (const sm of reloaded.seams) {
      const pa = reloaded.panels.find((p) => p.name === sm.a);
      const pb = reloaded.panels.find((p) => p.name === sm.b);
      const ra = pa.runs.find((r) => r.seam === sm.id);
      const rb = pb.runs.find((r) => r.seam === sm.id);
      if (!ra || !rb || Math.abs(ra.lengthCm - rb.lengthCm) > 0.05) return false;
      // and they are made of the same 3D vertices, which is what makes the
      // balance marks line up
      if ([...ra.v3].sort().join() !== [...rb.v3].sort().join()) return false;
    }
    return true;
  })());
  // the SVG must be producible from the JSON alone, so a saved pattern can be
  // re-exported without being regenerated from a body
  const fromJSON = patternSVG(reloaded, { seamAllowanceCm: 1.0 });
  check('SVG can be built from the JSON alone',
    fromJSON.svg.includes('TOP (neck)') && fromJSON.svg.includes('BOTTOM (waist)')
    && fromJSON.svg.includes('join to') && fromJSON.svg.includes('SEWING ORDER'));
  check('every point carries its placement hint',
    reloaded.panels.every((p) => p.pts.every((q) => Array.isArray(q.uv))));

  // Sewn back onto the body it was drafted for, the pattern must reproduce
  // itself exactly: the seam lengths ARE the shell's edge lengths.
  const g0 = sew(reloaded, torso, { ease: 1.0 });
  const before = fitReport(g0, torso);
  console.log(`  sewn, before draping: mean tension ${before.meanTensionPct.toFixed(4)}%,`
    + ` max ${before.maxTensionPct.toFixed(4)}%`);
  check('sewing reproduces the drafted shape exactly',
    before.maxTensionPct < 0.05, `${before.maxTensionPct.toFixed(4)}%`);

  const f0 = drape(g0, torso);
  console.log(`  draped on its own body : gap min ${f0.minGapCm.toFixed(2)}`
    + ` median ${f0.medianGapCm.toFixed(2)} cm, tension ${f0.meanTensionPct.toFixed(2)}%`
    + ` -> ${f0.verdict}`);
  check('it fits the body it was drafted for', f0.verdict === 'good fit', f0.verdict);
  check('median gap equals the ease it was drafted with',
    Math.abs(f0.medianGapCm - 1.0) < 0.25, `${f0.medianGapCm.toFixed(2)} cm vs 1.0`);
  check('nothing is left inside the body', f0.minGapCm > -0.05, `${f0.minGapCm.toFixed(3)} cm`);

  // and on bodies it was NOT drafted for, tension must rise with the mismatch
  const tensionOn = (changes) => {
    const body = new Body(changes);
    const g = sew(reloaded, body, { ease: 1.0 });
    return drape(g, body).meanTensionPct;
  };
  const t0 = f0.meanTensionPct;
  const t16 = tensionOn({ bust: 108 });
  const t26 = tensionOn({ bust: 118 });
  console.log(`  tension vs bust girth  : 92 cm ${t0.toFixed(2)}%,`
    + ` 108 cm ${t16.toFixed(2)}%, 118 cm ${t26.toFixed(2)}%`);
  check('a too-small pattern strains, monotonically', t0 < t16 && t16 < t26,
    `${t0.toFixed(2)} < ${t16.toFixed(2)} < ${t26.toFixed(2)}`);
  check('a much bigger body is reported as too small',
    new Body({ bust: 118 }) && (() => {
      const b = new Body({ bust: 118 });
      return drape(sew(reloaded, b, { ease: 1.0 }), b).verdict.startsWith('TOO SMALL');
    })());
  // a smaller body should stand off, not strain
  const small = new Body({ bust: 82, underbust: 66, waist: 62,
    lowHip: 88 });
  const fs = drape(sew(reloaded, small, { ease: 1.0 }), small);
  console.log(`  two sizes smaller      : median gap ${fs.medianGapCm.toFixed(2)} cm,`
    + ` tension ${fs.meanTensionPct.toFixed(2)}%`);
  check('a smaller body makes it stand off rather than strain',
    fs.medianGapCm > f0.medianGapCm && fs.meanTensionPct < 1.0,
    `gap ${fs.medianGapCm.toFixed(2)} cm, tension ${fs.meanTensionPct.toFixed(2)}%`);
}

line('asymmetry fields actually do something');
{
  const base = new Body();
  for (const [k, v] of [['shoulderDrop', 5], ['lateralShift', 6], ['bustAsym', 3], ['rotation', 10]]) {
    const other = new Body({ [k]: v });
    let maxMove = 0;
    for (let i = 0; i < 40; i++) {
      const u = i / 40;
      for (const vv of [0.3, 0.6, 0.9]) {
        maxMove = Math.max(maxMove, dist(base.point(u, vv), other.point(u, vv)));
      }
    }
    check(`${k} changes the body`, maxMove > 0.5, `max shift ${maxMove.toFixed(2)} cm`);
  }
}

line('the level set: is the body solid?');
{
  const b = new Body();
  const f = SDF.fromSurface(b);
  let worstOn = 0, worstOut = 0, worstIn = 0;
  for (let i = 0; i < 24; i++) {
    for (const v of [0.2, 0.45, 0.7, 0.86, 0.95]) {
      const u = i / 24;
      const p = b.point(u, v), n = b.normal(u, v);
      worstOn = Math.max(worstOn, Math.abs(f.at(p)));
      worstOut = Math.max(worstOut, Math.abs(f.at(add(p, mul(n, 1))) - 1));
      worstIn = Math.max(worstIn, Math.abs(f.at(add(p, mul(n, -1))) + 1));
    }
  }
  // The tolerances are the measured discretisation error of a 0.6 cm grid,
  // worst at the neck/shoulder crease. They scale with the cell size; see the
  // note in sdf.js. A quarter of a millimetre on average, against a cloth
  // triangle 2.5 cm across.
  check('zero on the surface', worstOn < 0.35, `worst ${worstOn.toFixed(3)} cm`);
  check('+1 cm one centimetre outside', worstOut < 0.4, `worst error ${worstOut.toFixed(3)} cm`);
  check('-1 cm one centimetre inside', worstIn < 0.8, `worst error ${worstIn.toFixed(3)} cm`);
  // Exact distances are only computed in a band around the surface, so deep
  // inside the body the magnitude saturates at the band width. The sign is
  // what is being checked here.
  check('the axis is inside the body', f.at([0, 20, 0]) <= -(f.band),
    `${f.at([0, 20, 0]).toFixed(2)} cm, band ${f.band} cm`);
  check('above the head is outside', f.at([0, 47, 0]) > 0, `${f.at([0, 47, 0]).toFixed(2)} cm`);
  // The failure this field exists to fix: free air beyond the shoulder point
  // used to read as 1-2 cm INSIDE the body, because distance to the nearest
  // sample's tangent plane is not an inside test.
  let falseInside = 0, tested = 0;
  for (let i = 0; i < 48; i++) {
    const u = i / 48;
    for (const v of [0.88, 0.9, 0.92, 0.94]) {
      const p = b.point(u, v);
      const out = [p[0] * 1.18, p[1] + 0.6, p[2] * 1.18];   // clearly in the air
      if (Math.hypot(out[0], out[2]) < Math.hypot(p[0], p[2])) continue;
      tested++;
      if (f.at(out) < 0) falseInside++;
      if (b.closestPoint(out).signed < 0) { /* the old test; counted below */ }
    }
  }
  let oldFalse = 0;
  for (let i = 0; i < 48; i++) {
    const u = i / 48;
    for (const v of [0.88, 0.9, 0.92, 0.94]) {
      const p = b.point(u, v);
      const out = [p[0] * 1.18, p[1] + 0.6, p[2] * 1.18];
      if (Math.hypot(out[0], out[2]) < Math.hypot(p[0], p[2])) continue;
      if (b.closestPoint(out).signed < 0) oldFalse++;
    }
  }
  check('no free air near the shoulders reads as inside the body',
    falseInside === 0, `${falseInside} of ${tested} (nearest-sample test: ${oldFalse})`);
}

line('bending: the model itself');
{
  // The two properties the bending model has to have, and the second one is
  // here because its absence is visible in the viewer: a model that is not
  // invariant to rotation scores a large fold as if it were a stretch, so a
  // stiff cloth lands like sheet metal and bounces back off its own rim.
  const hinge = (foldDeg) => {
    const a = new Assembly({ u: 1, weldTol: 1e-9 });
    const t = foldDeg * Math.PI / 180;
    const h = Math.sqrt(3);                       // apex height of a 2 cm equilateral
    for (const p of [[0, 0, 0], [2, 0, 0], [1, 0, -h],
      [1, Math.sin(t) * h, h * Math.cos(t)]]) { a.verts.push(p); a.pinned.push(false); }
    a.addRawTile([0, 1, 2], [2, 2, 2], 'A');
    a.addRawTile([0, 1, 3], [2, 2, 2], 'B');
    return a;
  };
  const angleOf = (asm) => {
    const V = asm.verts;
    const sub2 = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    const cr = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2],
      p[0] * q[1] - p[1] * q[0]];
    const nrm = (p) => { const l = Math.hypot(...p); return p.map((x) => x / l); };
    const n1 = nrm(cr(sub2(V[1], V[0]), sub2(V[2], V[0])));
    const n2 = nrm(cr(sub2(V[1], V[0]), sub2(V[3], V[0])));
    return Math.acos(Math.max(-1, Math.min(1, -(n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]))))
      * 180 / Math.PI;
  };

  const folded = hinge(50);
  const before = angleOf(folded);
  const sim = new Cloth(folded, null, {
    fabric: 'cotton poplin', gravityScale: 0, substeps: 10,
    selfCollision: false, floorY: null, terminalCmPerSec: 0, linearDragPerSec: 0,
  });
  sim.run(0.5);
  const after = angleOf(folded);
  console.log(`  a hinge folded ${before.toFixed(1)} deg relaxes to ${after.toFixed(1)} deg`);
  check('a fold opens towards flat rather than closing', after < before - 5,
    `${before.toFixed(1)} -> ${after.toFixed(1)} deg`);

  // Rotation invariance: the SAME fold, turned in space, must cost the same.
  // Nothing about a hinge's energy may depend on which way the pair is facing.
  const spin = (asm, ang) => {
    for (const p of asm.verts) {
      const x = p[0] * Math.cos(ang) - p[2] * Math.sin(ang);
      const z = p[0] * Math.sin(ang) + p[2] * Math.cos(ang);
      p[0] = x; p[2] = z;
    }
    return asm;
  };
  const plain = hinge(60);
  const turned = spin(hinge(60), 0.9);
  for (const asm of [plain, turned]) {
    const s2 = new Cloth(asm, null, {
      fabric: 'cotton poplin', gravityScale: 0, substeps: 10,
      selfCollision: false, floorY: null, terminalCmPerSec: 0, linearDragPerSec: 0,
    });
    s2.run(0.3);
  }
  console.log(`  the same fold, one of them turned 52 deg in space:`
    + ` ${angleOf(plain).toFixed(3)} and ${angleOf(turned).toFixed(3)} deg after relaxing`);
  check('a fold costs the same whichever way it faces in space',
    Math.abs(angleOf(plain) - angleOf(turned)) < 0.01,
    `${angleOf(plain).toFixed(3)} vs ${angleOf(turned).toFixed(3)} deg`);
}

line('bending: a cantilever, in centimetres');
{
  // THE PEIRCE CANTILEVER, FROM app/js/cantilever.js -- the same function
  // tools/fabric.mjs calls, not a second one.
  //
  // What was here until 2026-10-18 clamped a FIXED 16 cm overhang and
  // reported the arclength at which the chord from the clamp crossed 41.5
  // deg. docs/18-validation.md 6.9 withdrew that reading on 2026-10-11 as not
  // a material property -- the strip's whole shape depends on how much of it
  // is hanging -- and fixed tools/fabric.mjs the same day. This file was not
  // fixed, and its comment went on claiming the two were "the same
  // measurement" for seven days while they differed by 1.9x on one fabric.
  //
  // The cost of that: this check PASSED at 1.77 cm against an asked 1.7,
  // certifying bending as calibrated, while the material property read 0.93.
  // A gate that cannot see the defect it is named after is worse than no
  // gate, because it is quoted (docs/18-validation.md 6.13).
  // AT A STATED ELEMENT, NOT peirce()'s AUTO MESH. The auto mesh is
  // `asked / 12` = 0.142 cm for this fabric, which since BEND_SCALE came
  // down to 1.8 is too FINE to converge at the 20 substeps this runs at: it
  // reads 0.855 cm there against 1.793 at 0.6 cm and 1.818 at 0.3 cm
  // (docs/18-validation.md 6.12). 0.6 cm is converged -- substeps 160 gives
  // 1.815 against 20's 1.793 -- resolves the specimen at 6 rows, and takes
  // 10 s instead of 200.
  const poplin = peirce('cotton poplin', { edge: 0.6 });
  const ask = FABRICS['cotton poplin'].bendLengthCm;
  console.log(`  cotton poplin: asked for ${ask} cm of bending length,`
    + ` measured ${poplin.bendLengthCm ?? '--'} cm`
    + ` (overhang ${poplin.overhangCm} cm, element ${poplin.rowCm} cm,`
    + ` ${poplin.rowsSpanningL} rows, ${poplin.evals} settles)`);
  // EXPECTED TO FAIL until the bending repair lands. 0.93 against 1.7 is the
  // defect of docs/18-validation.md 6.12, and the threshold is deliberately
  // NOT widened to accommodate it: a gate tuned to pass the current solver
  // would be the same false green in new numbers.
  check('a fabric bends by as much as it was asked to',
    poplin.bendLengthCm !== null && Math.abs(poplin.bendLengthCm - ask) < 0.4,
    `${poplin.bendLengthCm} cm against ${ask} -- see docs/18-validation.md 6.12`);
  check('and the bisection converged', poplin.bracketed && poplin.converged,
    `bracket ${poplin.bracketCm} cm in ${poplin.evals} settles`);

  // The parameter has to MEAN something: this is the check the old
  // cross-spring model failed, with every fabric and even a compliance of
  // zero giving the same 0.76 cm. Run at a FIXED coarse element because it
  // asserts an ORDERING, not a value -- which costs seconds instead of the
  // ~200 s an auto-meshed bisection takes, and the ordering is the whole
  // claim.
  const limp = peirce('cotton poplin', { bend: 1.1, edge: 0.5 });
  const stiff = peirce('cotton poplin', { bend: 2.3, edge: 0.5 });
  console.log(`  the same cloth at 1.1 and 2.3 cm: ${limp.bendLengthCm}`
    + ` vs ${stiff.bendLengthCm} cm measured (element 0.5 cm, ordering only)`);
  check('a limper fabric droops sooner than a stiffer one',
    limp.bendLengthCm !== null && stiff.bendLengthCm !== null
      && stiff.bendLengthCm > limp.bendLengthCm + 0.5,
    `${limp.bendLengthCm} cm against ${stiff.bendLengthCm} cm`);

  // RESOLUTION INDEPENDENCE, asserted on the quantity it is about.
  //
  // What was here until 2026-10-18 settled a strip on a 1.0 cm mesh and
  // asserted its tip reach fell between 2.0 and 6.0 cm -- a 3x window, on a
  // proxy. Meanwhile the bending length itself moved from 0.93 cm to 3.93 cm
  // across the element sizes a garment uses (docs/18-validation.md 6.12).
  // **A check whose tolerance is wider than the defect it is named after
  // passes through the defect**, and this one did, for as long as the defect
  // existed.
  //
  // It now measures the same thing twice, at elements a factor of two apart,
  // and asserts they agree. Measured after the BEND_SCALE repair: 1.818 cm
  // at 0.3 and 1.793 cm at 0.6, which is **1.4 % apart**. The 10 % threshold
  // is seven times that margin -- loose enough not to fail on solver noise,
  // and far tighter than the 2.5x the old defect produced over the same
  // range.
  //
  // Costs ~74 s, nearly all of it the 0.3 cm run. That is the price of
  // asserting the property rather than a proxy for it.
  const fine = peirce('cotton poplin', { edge: 0.3 });
  const coarse = peirce('cotton poplin', { edge: 0.6 });
  const spread = (fine.bendLengthCm && coarse.bendLengthCm)
    ? Math.abs(fine.bendLengthCm - coarse.bendLengthCm)
      / Math.min(fine.bendLengthCm, coarse.bendLengthCm) : null;
  console.log(`  bending length at 0.3 cm vs 0.6 cm elements:`
    + ` ${fine.bendLengthCm} vs ${coarse.bendLengthCm} cm`
    + ` (${fine.rowsSpanningL} and ${coarse.rowsSpanningL} rows)`);
  check('the same cloth on a coarser mesh is still the same cloth',
    spread !== null && spread < 0.10,
    spread === null ? 'a bisection did not bracket'
      : `${(100 * spread).toFixed(1)} % apart over a 2x change of element`);
}

line('the accordion drop: does the cloth have thickness');
{
  // A pleated strip dropped on the floor must land as a STACK. Nothing here
  // tells the solver how tall: the comparison is against its own contact
  // distance, and against the same strip with self-collision switched off.
  const b2 = new Body();
  // A LIMP cloth -- 0.3 cm of bending length, a chiffon -- because it has no
  // stiffness of its own to hold its folds open, so whatever stack it makes
  // is the contact doing it. An ordinary cloth adds loft on top and would
  // stand up on its own even with self-collision off, which makes it useless
  // as a control. (tools/accordion.mjs shows both.)
  const common = {
    widthCm: 20, lengthCm: 64, pleatCm: 8, edge: 2.0, seconds: 6,
    fabric: 'silk habotai',
  };
  const on = dropAccordion(b2, { ...common, cloth: { selfCollision: true, bend: 0.3 } });
  const off = dropAccordion(b2, { ...common, cloth: { selfCollision: false, bend: 0.3 } });
  // WHETHER THE LAYERS PASS THROUGH EACH OTHER, measured, instead of inferred
  // from how tall the heap is.
  //
  // The old control compared stack height with contact on against off and
  // wanted a 5x ratio. That worked only while a crease had no radius: the
  // limp cloth was chosen precisely because it has no bending loft of its
  // own, so any height had to be the contact doing it. Give the crease a real
  // fillet and the fold loops have height whether or not the layers may
  // interpenetrate, and the control collapses -- 3.11 cm against 1.22 with it
  // off, which is 2.5x and fails, while the thickness model it is supposed to
  // be guarding got strictly BETTER (7.8 of 8 layers resolved, up from 5.3).
  // docs/11-cloth.md:170 had already admitted the old heap only resolved
  // "about four layers' worth of the eight".
  //
  // So assert the proposition itself. `deepOverlaps` counts primitive pairs
  // more than half a thickness through each other, which no amount of contact
  // convergence produces and no amount of fold loft hides. It discriminates
  // 6,529 against 5 where the height ratio could not tell 3.11 from 1.22.
  const onOv = on.cloth.selfOverlaps(), offOv = off.cloth.selfOverlaps();
  console.log(`  ${on.layers} limp layers: ${on.stackCm} cm of stack with`
    + ` self-collision, ${off.stackCm} cm without`
    + ` (one layer is ${on.perLayerCm} cm of contact distance);`
    + ` ${onOv.deepOverlaps} deep overlaps against ${offOv.deepOverlaps}`);
  check('the heap has thickness', on.stackCm > 4 * on.perLayerCm,
    `${on.stackCm} cm, which is ${(on.stackCm / on.perLayerCm).toFixed(1)} layers' worth`);
  check('and the layers do not pass through each other',
    onOv.deepOverlaps * 20 < Math.max(20, offOv.deepOverlaps),
    `${onOv.deepOverlaps} pairs deeper than half a thickness, against`
    + ` ${offOv.deepOverlaps} with self-collision off`
    + ` (worst ${onOv.worstOverlapCm} cm vs ${offOv.worstOverlapCm} cm)`);
  check('the strip lands on the floor rather than falling through it',
    Math.abs(on.restingOnFloorCm) < 0.5, `${on.restingOnFloorCm} cm`);
  check('and it settles', on.settled, `${on.seconds} s`);
}

line('cloth physics: elastics and weights');
{
  // A disc hung from its own hole, with no body at all. This isolates the
  // cloth model from the collision: if it does not come to rest here, the
  // mass-spring part is wrong, and if it does, any buzzing is contact.
  const pat = annulusPattern({ innerR: 7.5, outerR: 26, edge: 2.6 });
  const asm = sewFlat(pat, { y: 40, center: [0, 0] });
  for (const i of pat.panels[0].hole) asm.pinned[i] = true;
  const sim = new Cloth(asm, null, {});
  check('areal density gives a sensible weight',
    sim.weightG > 20 && sim.weightG < 30, `${sim.weightG.toFixed(1)} g of 120 gsm cotton`);
  const before = asm.verts.reduce((a, p) => Math.min(a, p[1]), Infinity);
  // 10 s, not the 3 s this ran for until 2026-10-18. The THRESHOLD below is
  // unchanged; only the time allowed to reach it has moved, because
  // BEND_SCALE came down from 30 to 1.8 and a cloth 16x limper swings more
  // slowly. Measured on this exact rig: rms 1.663 cm/s at 3 s, 1.541 at 5 s,
  // **0.002 at 8 s** -- it settles hard, just later. Widening the threshold
  // instead would have hidden a real settle failure later on.
  sim.run(10.0);
  const after = asm.verts.reduce((a, p) => Math.min(a, p[1]), Infinity);
  check('it hangs: the hem falls', after < before - 5, `${(before - after).toFixed(1)} cm`);
  check('hanging under its own weight it comes to rest',
    sim.rmsSpeed() < 0.3, `${sim.rmsSpeed().toFixed(3)} cm/s rms`);
  check('and it does not blow up', sim.healthy());
  const strains = asm.edgeStrains().map((s) => s.strain);
  check('self-weight strain stays fabric-like',
    Math.max(...strains) < 0.08, `max ${(100 * Math.max(...strains)).toFixed(1)} %`);
}

line('the drop test: a hollow disc on a body');
{
  const b = new Body();
  const neck = neckFrame(b);
  check('the neck is found and measures what was asked for',
    Math.abs(neck.girthCm - b.M.neckCircumference) < 1.0,
    `${neck.girthCm.toFixed(1)} cm vs ${b.M.neckCircumference} asked`);

  // A hole a little bigger than the neck must be held up by the shoulders.
  const caught = dropDisc(b, { innerR: 8, outerR: 26, edge: 2.8, seconds: 9 });
  console.log(`  hole r 8 cm  -> ${caught.verdict}`
    + ` (hole resting at y = ${caught.holeYcm} cm, ${caught.maxStretchPct}% stretch)`);
  check('a small hole catches on the neck and shoulders', /yoke/.test(caught.verdict),
    caught.verdict);
  check('it settles', caught.settle.settled,
    `${caught.settle.seconds} s, ${caught.rmsSpeedCmPerSec} cm/s rms`);
  // Two different claims, and conflating them hid a real limitation for the
  // whole life of this file. The solver guarantees its VERTICES stay out of
  // the body, and it does. It does not control what happens between them:
  // contact is a point query per vertex, so a triangle spanning a convex
  // bulge dips below it, and nothing tests for that.
  //
  // The old assertion read `deepestPenetrationCm`, which sampled vertices
  // only, so it passed at 0.00 cm while the body was visibly through the
  // cloth. Now that the metric is honest the real figure shows: about a
  // centimetre on this disc. That is a known limitation, recorded here rather
  // than asserted away -- see docs/11-cloth.md, and the Blender side-car that
  // is meant to answer it.
  check('no VERTEX is left inside the body',
    caught.deepestVertexCm < 0.15, `${caught.deepestVertexCm} cm`);
  console.log(`  between the vertices, though, the body comes through by`
    + ` ${caught.deepestPenetrationCm} cm -- contact is a point query per`
    + ` vertex and nothing tests a triangle's interior`);
  check('a woven does not stretch like a rubber sheet',
    caught.maxStretchPct < 12, `${caught.maxStretchPct} %`);
  check('the hem hangs below the hole',
    caught.hemYcm < caught.holeYcm - 8, `hem ${caught.hemYcm}, hole ${caught.holeYcm} cm`);

  // A hole far bigger than the shoulders cannot be held up by anything.
  const slipped = dropDisc(b, { innerR: 19, outerR: 34, edge: 3.2, seconds: 6 });
  console.log(`  hole r 19 cm -> ${slipped.verdict} (hole at y = ${slipped.holeYcm} cm)`);
  check('a hole bigger than the shoulders slides off', !/yoke/.test(slipped.verdict),
    slipped.verdict);
  check('and it slid much further than the small one',
    slipped.slipCm > caught.slipCm + 20, `${slipped.slipCm} cm vs ${caught.slipCm} cm`);
  check('it landed on the floor rather than falling for ever',
    slipped.bottomYcm > floorOf(b) - 1, `lowest point ${slipped.bottomYcm} cm`);

  // Nothing in the generator or the solver knows where that boundary is.
  check('the critical hole is near the shoulder girth, not the neck girth',
    slipped.holeCircumferenceCm > 90 && caught.holeCircumferenceCm < 60,
    `caught at ${caught.holeCircumferenceCm} cm, slipped at ${slipped.holeCircumferenceCm} cm`);
}

line('fabric does not bounce');
{
  // The complaint this test exists for: the first version bounced. Fabric is
  // strongly viscoelastic and falls through air, and leaving either out makes
  // a sheet of stiff springs -- a trampoline. Both numbers below are measured
  // on the same disc dropped 4 cm onto the same body.
  const b = new Body();
  const neck = neckFrame(b);
  const run = (opts) => {
    const pat = annulusPattern({ innerR: 7.5, outerR: 26, edge: 2.6 });
    const asm = sewFlat(pat, { y: neck.yTop + 4, center: neck.center });
    const sim = new Cloth(asm, b, { floorY: floorOf(b), ...opts });
    const M = sim.mass, W = sim.weightG;
    const com = () => asm.verts.reduce((a, p, i) => a + p[1] * M[i], 0) / W;
    let lowest = Infinity, rebound = 0, impact = 0, peak = 0;
    for (let f = 0; f < 200; f++) {
      sim.step(1 / 60);
      if (impact === 0 && sim.contact.filter(Boolean).length > 20) impact = sim.maxSpeed();
      if (impact) peak = Math.max(peak, sim.maxSpeed());
      const c = com();
      if (c < lowest) { lowest = c; rebound = 0; } else rebound = Math.max(rebound, c - lowest);
    }
    return { rebound, ratio: peak / impact, rms: sim.rmsSpeed() };
  };
  const now = run({});
  const noDrag = run({ terminalCmPerSec: 0 });
  const noVisc = run({ internalDamping: 0, terminalCmPerSec: 0 });
  console.log(`  rebound of the centre of mass: ${now.rebound.toFixed(3)} cm`
    + ` (no air drag: ${noDrag.rebound.toFixed(3)}; neither: ${noVisc.rebound.toFixed(3)})`);
  console.log(`  fastest vertex / impact speed: ${now.ratio.toFixed(2)}`
    + ` (no air drag: ${noDrag.ratio.toFixed(2)}; neither: ${noVisc.ratio.toFixed(2)})`);
  check('the cloth does not rebound', now.rebound < 0.15, `${now.rebound.toFixed(3)} cm`);
  // The limit was 2.05 when the cloth had no working bending model. With one,
  // the RIM of a stiff disc snaps as it lands -- which is what a stiff cloth
  // does -- and the ratio moves with the bending length: 1.92 at 0.2 cm of
  // bending length, 2.26 at poplin's 1.7. The claim being tested is that the
  // cloth does not BOUNCE, and that is the rebound check above, which reads
  // 0.013 cm. This one is a ceiling on how violently a single vertex may
  // move, and it is set from the measured range with a margin.
  check('nothing whips to more than two and a half times the impact speed',
    now.ratio < 2.5,
    `${now.ratio.toFixed(2)} x`);
  check('it is still after a couple of seconds', now.rms < 0.8, `${now.rms.toFixed(2)} cm/s`);
  // Only the rebound. The whip ratio used to rise when drag was removed and
  // now does not (2.26 with drag, 2.14 without), because with bending in the
  // model the rim's snap is set by the fold it is coming out of rather than
  // by how fast the cloth arrives. The rebound still tells the story it was
  // written to tell: 0.013 cm with drag and viscosity, 0.838 cm without.
  check('air drag and viscosity are what stop the bounce -- removing both brings it back',
    noVisc.rebound > now.rebound * 2 && noVisc.rebound > 0.3,
    `rebound ${now.rebound.toFixed(3)} -> ${noVisc.rebound.toFixed(3)} cm`
    + ` (whip ${now.ratio.toFixed(2)} -> ${noVisc.ratio.toFixed(2)} x, no longer the signal)`);
  check('heavier cloth falls faster: terminal speed goes as sqrt(gsm)',
    Math.abs(new Cloth(sewFlat(annulusPattern({ innerR: 8, outerR: 20, edge: 4 }), { y: 0 }), null,
      { fabric: 'denim' }).vTerm
      / new Cloth(sewFlat(annulusPattern({ innerR: 8, outerR: 20, edge: 4 }), { y: 0 }), null,
        { fabric: 'silk habotai' }).vTerm - Math.sqrt(340 / 60)) < 0.01,
    `denim / habotai = ${Math.sqrt(340 / 60).toFixed(2)}`);
}

line('the test pieces');
{
  const a = annulusPattern({ innerR: 8, outerR: 24, edge: 2.5 });
  const pts = a.panels[0].pts, tris = a.panels[0].tris;
  check('the annulus is one closed panel', a.panels.length === 1);
  check('its hole measures 2 pi r', Math.abs(a.meta.holeCircumferenceCm - 2 * Math.PI * 8) < 0.6,
    `${a.meta.holeCircumferenceCm} vs ${(2 * Math.PI * 8).toFixed(2)} cm`);
  check('its hem measures 2 pi R', Math.abs(a.meta.hemCircumferenceCm - 2 * Math.PI * 24) < 1.5,
    `${a.meta.hemCircumferenceCm} vs ${(2 * Math.PI * 24).toFixed(2)} cm`);
  // Every edge must be shared by two triangles except on the two boundaries,
  // or the sheet has a crack in it that the cloth will tear along.
  const count = new Map();
  for (const t of tris) {
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const k = t[i] < t[j] ? `${t[i]}_${t[j]}` : `${t[j]}_${t[i]}`;
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  const boundary = [...count.values()].filter((n) => n === 1).length;
  const bad = [...count.values()].filter((n) => n > 2).length;
  const expect = a.panels[0].loop.length + a.panels[0].hole.length;
  check('no edge belongs to three triangles', bad === 0, `${bad}`);
  check('the only single-sided edges are the two boundaries', boundary === expect,
    `${boundary} vs ${expect} expected`);
  // Near-equilateral triangles: a physics mesh of slivers is ill-conditioned
  // and drapes with a direction bias.
  let worstRatio = 0;
  for (const t of tris) {
    const L = [[0, 1], [1, 2], [2, 0]].map(([i, j]) =>
      Math.hypot(pts[t[i]].x - pts[t[j]].x, pts[t[i]].y - pts[t[j]].y));
    worstRatio = Math.max(worstRatio, Math.max(...L) / Math.min(...L));
  }
  check('triangles stay near-equilateral from hole to hem', worstRatio < 2.6,
    `worst edge ratio ${worstRatio.toFixed(2)}`);
  const r = rectanglePattern({ width: 20, height: 20, edge: 2.5 });
  check('the rectangle control piece is sane',
    r.panels[0].tris.length === 2 * 8 * 8, `${r.panels[0].tris.length} triangles`);
}

line('flare: pattern pieces assembled into one garment');
{
  const b = new Body();
  const waistV = b.landmarkV('waist');
  const ring = waistRing(b, { waistV, ease: 1.0 });
  console.log(`  waist ring at 1 cm ease: ${ring.circumferenceCm.toFixed(1)} cm`
    + ` (tape waist ${b.M.waist} cm)`);
  check('the waist ring is longer than the tape measurement',
    ring.circumferenceCm > b.M.waist + 3,
    'drafting to the tape measure instead would start the skirt stretched');

  const make = (o) => flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm, lengthCm: 55, edge: 4.0, waistV, ...o,
  });

  // ---- assembly
  const pat = make({ circleFraction: 0.5 });
  check('four panels make four seams', pat.seams.length === 4, `${pat.seams.length}`);
  const seamRuns = pat.panels.flatMap((p) => p.runs.filter((r) => r.kind === 'seam'));
  check('every panel has two seam edges', seamRuns.length === 8, `${seamRuns.length}`);
  const bySeam = new Map();
  for (const r of seamRuns) {
    if (!bySeam.has(r.seam)) bySeam.set(r.seam, []);
    bySeam.get(r.seam).push(r.lengthCm);
  }
  const mismatch = [...bySeam.values()].filter(([a, c]) => Math.abs(a - c) > 0.01).length;
  check('both sides of every seam are the same length', mismatch === 0,
    [...bySeam.entries()].map(([k, v]) => `${k}:${v[0]}`).join(' '));
  const tops = pat.panels.flatMap((p) => p.runs.filter((r) => r.kind === 'top'));
  check('each panel knows which edge is the waist', tops.length === 4,
    `${tops.length} top edges found`);
  check('the waist edges add up to the ring they are sewn to',
    Math.abs(tops.reduce((a, r) => a + r.lengthCm, 0) - ring.circumferenceCm) < 0.5,
    `${tops.reduce((a, r) => a + r.lengthCm, 0).toFixed(2)} vs ${ring.circumferenceCm.toFixed(2)} cm`);

  // ---- sewing: separate pieces become ONE mesh
  const { asm, pinRamp } = placeSkirt(pat, b, { ease: 1.0, waistV });
  const expect = pat.meta.panels * pat.meta.colsPerPanel * pat.meta.rows;
  check('the panels are welded into a single mesh', asm.verts.length === expect,
    `${asm.verts.length} vertices, ${asm.tiles.length} triangles`);
  const seamEdges = [...asm.edges.values()].filter((e) => e.tiles.length === 2).length;
  check('the seams are ordinary interior edges, not a special case',
    seamEdges > asm.edges.size * 0.9, `${seamEdges} of ${asm.edges.size} interior`);

  // ---- the placement is an exact isometry, because an annular sector is
  // developable. Anything above a hundredth of a per cent here means the
  // garment starts jammed, and a nearly inextensible mesh never recovers.
  const st0 = asm.edgeStrains().map((x) => Math.abs(x.strain));
  check('laying the pattern on its own cone strains nothing',
    Math.max(...st0) < 0.002, `max ${(100 * Math.max(...st0)).toExponential(1)} %`);
  check('the waistband is ramped on rather than teleported',
    pinRamp.ids.length === pat.meta.panels * pat.meta.colsPerPanel && pinRamp.seconds > 0,
    `${pinRamp.ids.length} pins over ${pinRamp.seconds} s`);

  // ---- and it falls into folds, more of them the more circle there is
  const hang = (o, seconds = 4) => {
    const p2 = make(o);
    const placed = placeSkirt(p2, b, { ease: 1.0, waistV });
    const sim = new Cloth(placed.asm, b, { fabric: 'linen', floorY: floorOf(b) });
    sim.pinRamp(placed.pinRamp);
    sim.settle({ maxSeconds: seconds });
    return { pattern: p2, hem: hemProfile(placed.asm), sim };
  };
  const quarter = hang({ circleFraction: 0.25 });
  const full = hang({ circleFraction: 1.0 });
  console.log(`  quarter circle: hem ${quarter.pattern.meta.hemCm} cm ->`
    + ` ${quarter.hem.folds} folds ${quarter.hem.foldDepthCm} cm deep`);
  console.log(`  full circle:    hem ${full.pattern.meta.hemCm} cm ->`
    + ` ${full.hem.folds} folds ${full.hem.foldDepthCm} cm deep`);
  check('a full circle skirt has a hem of waist + 2*pi*length',
    Math.abs(full.pattern.meta.hemCm - (ring.circumferenceCm + 2 * Math.PI * 55)) < 0.1,
    `${full.pattern.meta.hemCm} cm`);
  check('more circle means more folds', full.hem.folds > quarter.hem.folds,
    `${full.hem.folds} vs ${quarter.hem.folds}`);
  check('more circle means deeper folds', full.hem.foldDepthCm > quarter.hem.foldDepthCm * 1.5,
    `${full.hem.foldDepthCm} vs ${quarter.hem.foldDepthCm} cm`);
  check('the hem keeps the length it was cut, folds and all',
    Math.abs(full.hem.hemLengthCm - full.pattern.meta.hemCm) / full.pattern.meta.hemCm < 0.01,
    `${full.hem.hemLengthCm} cm hung vs ${full.pattern.meta.hemCm} cut`);
  check('a flared skirt does not strain: the flare is released at the hem',
    full.sim.report().maxStretchPct < 6, `${full.sim.report().maxStretchPct} %`);

  // ---- does the placement need a construction at all? For a full circle, no:
  // the pattern's own 2D coordinates are already an isometric closed layout.
  // Below a full circle they are not CLOSED -- four quarter-circle panels span
  // 90 degrees, so laid flat they leave a 270 degree gap and the last seam has
  // to stretch across it.
  const flatStart = (cf) => {
    const p2 = make({ circleFraction: cf });
    const placed = placeSkirt(p2, b, { ease: 1.0, waistV, start: 'flat' });
    const st = placed.asm.edgeStrains().map((x) => Math.abs(x.strain));
    return { mean: st.reduce((a, x) => a + x, 0) / st.length, max: Math.max(...st) };
  };
  const flatFull = flatStart(1.0), flatQuarter = flatStart(0.25);
  console.log(`  laid out flat: full circle ${(100 * flatFull.max).toFixed(2)} % peak strain,`
    + ` quarter circle ${(100 * flatQuarter.max).toFixed(0)} %`);
  check('a full circle skirt lies flat with no strain at all -- it IS the pattern',
    flatFull.max < 0.01, `${(100 * flatFull.max).toFixed(2)} % peak`);
  check('less than a full circle cannot lie flat AND closed',
    flatQuarter.max > 1.0, `${(100 * flatQuarter.max).toFixed(0)} % peak across the gap`);

  // ---- gathers are a different garment from the same generator
  const gathered = hang({ circleFraction: 0.001, gather: 2.5 });
  console.log(`  gathered 2.5x:  hem ${gathered.pattern.meta.hemCm} cm ->`
    + ` ${gathered.hem.folds} folds, hem at ${gathered.hem.hemLowYcm} cm`);
  check('gathering crams the fullness into the waist seam',
    Math.abs(gathered.pattern.meta.patternWaistCm - ring.circumferenceCm * 2.5) < 0.1,
    `${gathered.pattern.meta.patternWaistCm} cm of cloth into a ${ring.circumferenceCm.toFixed(1)} cm ring`);
  check('and so it rides up, where flare hangs down',
    gathered.hem.hemLowYcm > full.hem.hemLowYcm + 2,
    `gathered hem at ${gathered.hem.hemLowYcm}, flared at ${full.hem.hemLowYcm} cm`);
}

line('arrange, stitch, drop: assembling from separate pieces');
{
  const b = new Body();
  const waistV = b.landmarkV('waist');
  const ring = waistRing(b, { waistV, ease: 1.0 });
  const pattern = flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm, circleFraction: 0.5,
    lengthCm: 55, edge: 4.5, waistV,
  });

  // ---- phase 1: the pieces are placed, not joined. A rigid motion of a flat
  // piece is exactly isometric, whatever the garment, which is the reason this
  // route needs no closed-form placement at all.
  const laid = layOut(pattern, b, { standoffCm: 6 });
  const st0 = laid.asm.edgeStrains().map((x) => Math.abs(x.strain));
  // Rolling a flat piece onto a cylinder bends it without stretching it, so the
  // only error is the mesh's chord against the cylinder's arc: for an edge
  // spanning d of arc at radius R, 1 - 2R sin(d/2R)/d = d^2/24R^2. Asserting
  // against that bound is a real check of the claim; asserting against a round
  // number is not.
  const chordBound = (pat, R) => {
    let d = 0;
    for (const p of pat.panels) {
      for (const t of p.tris) {
        for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
          const a = p.pts[t[i]], c = p.pts[t[j]];
          d = Math.max(d, Math.abs(a.x - c.x));
        }
      }
    }
    return (d * d) / (24 * R * R);
  };
  const bound = chordBound(pattern, laid.radiusCm);
  check('arranging the pieces bends them without stretching them',
    Math.max(...st0) < bound * 1.5,
    `${(100 * Math.max(...st0)).toFixed(3)} % against a predicted `
    + `${(100 * bound).toFixed(3)} % of chord-versus-arc`);
  const perPanel = pattern.panels[0].pts.length;
  check('the pieces are still separate', laid.asm.verts.length === perPanel * 4,
    `${laid.asm.verts.length} vertices = ${perPanel} x 4 pieces`);
  check('every seam point has a stitch waiting',
    laid.stitches.length === 4 * pattern.meta.rows,
    `${laid.stitches.length} stitches for ${pattern.seams.length} seams`);
  // maxStitchGap() reports only ARMED seams -- ones the thread is actually in
  // -- so a stitch has to be armed before it has a gap to speak of. Measuring
  // the laid-out geometry directly says the same thing without a solver.
  const gapBefore = Math.max(...laid.stitches.map((st) => {
    const a = laid.asm.verts[st.a], b2 = laid.asm.verts[st.b];
    return Math.hypot(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]);
  }));
  check('and the seams start apart, waiting to be closed', gapBefore > 10,
    `${gapBefore.toFixed(1)} cm`);

  // ---- phases 2 and 3
  const r = assembleGarment(pattern, b, {
    fabric: 'linen', standoffCm: 6, stitchSeconds: 2.0, fallSeconds: 5,
    floorY: floorOf(b), cloth: { substeps: 8 },
  });
  console.log(`  stitching: seam gap ${r.log[0].seamGapStartCm} -> ${r.log[0].seamGapEndCm} cm,`
    + ` ${r.log[0].maxStretchPct} % peak strain`);
  check('stitching closes the seams', r.log[0].seamGapEndCm < 0.2,
    `${r.log[0].seamGapEndCm} cm left`);
  check('and does it without straining the cloth', r.log[0].maxStretchPct < 8,
    `${r.log[0].maxStretchPct} %`);
  check('welding gives one mesh of the right size',
    r.asm.verts.length === pattern.meta.panels * pattern.meta.colsPerPanel * pattern.meta.rows,
    `${r.asm.verts.length} vertices`);
  check('the welded garment knows its own hem and waist',
    r.asm.meta.hemIds.length > 10 && r.asm.meta.waistIds.length > 10,
    `${r.asm.meta.waistIds.length} at the waist, ${r.asm.meta.hemIds.length} at the hem`);
  const hp = hemProfile(r.asm);
  console.log(`  dropped: ${hp.folds} folds ${hp.foldDepthCm} cm deep,`
    + ` hem ${Math.round(pattern.meta.hemCm)} -> ${hp.hemLengthCm} cm`);
  check('the hem still has the length it was cut',
    Math.abs(hp.hemLengthCm - pattern.meta.hemCm) / pattern.meta.hemCm < 0.02,
    `${hp.hemLengthCm} vs ${Math.round(pattern.meta.hemCm)} cm`);
  check('and it falls into folds', hp.folds >= 3, `${hp.folds}`);

  // ---- a loose tube cannot pass the hips: 78 cm of seam against 98 cm of hip
  const loose = assembleGarment(pattern, b, {
    fabric: 'linen', standoffCm: 6, stitchSeconds: 2.0, fallSeconds: 6,
    floorY: floorOf(b), pinWaist: false, cloth: { substeps: 8 },
  });
  const wy = loose.asm.meta.waistIds.reduce((a, i) => a + loose.asm.verts[i][1], 0)
    / loose.asm.meta.waistIds.length;
  const hipY = b.point(0, b.landmarkV('lowHip'))[1];
  console.log(`  with no waistband the seam slides to y = ${wy.toFixed(1)} cm`
    + ` (low hip is at ${hipY.toFixed(1)}, girth ${b.girthAt(b.landmarkV('lowHip')).toFixed(0)} cm)`);
  // 78 cm of waist seam cannot pass 98 cm of hip without 25 % of stretch, and
  // linen yields at 3 %. So it must stop. Getting this right is what drove
  // `stretchSweeps` to 8 and the strain limiter to iterate to convergence: at
  // three sweeps the seams won the argument with the contact and the skirt slid
  // clean off the figure, 2.6 cm deep into it.
  check('without a waistband it slides down and wedges on the hips, not off the body',
    wy < -3 && wy > hipY - 8, `waist seam at ${wy.toFixed(1)} cm,`
    + ` low hip at ${hipY.toFixed(1)}`);
}

line('the assembly does not care how many pieces, or in what order');
{
  const b = new Body();
  const waistV = b.landmarkV('waist');
  const ring = waistRing(b, { waistV, ease: 1.0 });

  // ---- order independence. Every stitch is solved in the same sweep, every
  // substep, so no piece goes first and no piece is the reference. Shuffling
  // the pieces and the stitch list must give the same garment.
  const base = flaredSkirtPattern({
    panels: 6, waistCm: ring.circumferenceCm, circleFraction: 0.5,
    lengthCm: 50, edge: 5.0, waistV,
  });
  const shuffled = { ...base, panels: [...base.panels].reverse() };
  const run = (pat) => {
    const r = assembleGarment(pat, b, {
      fabric: 'linen', standoffCm: 6, stitchSeconds: 1.5, fallSeconds: 4,
      floorY: floorOf(b), cloth: { substeps: 8 },
    });
    return { hem: hemProfile(r.asm), peak: r.sim.report().maxStretchPct, r };
  };
  const inOrder = run(base);
  const outOfOrder = run(shuffled);
  console.log(`  pieces in order:     ${inOrder.hem.folds} folds,`
    + ` hem ${inOrder.hem.hemLengthCm} cm, peak ${inOrder.peak} %`);
  console.log(`  pieces reversed:     ${outOfOrder.hem.folds} folds,`
    + ` hem ${outOfOrder.hem.hemLengthCm} cm, peak ${outOfOrder.peak} %`);
  check('reversing the order of the pieces gives the same hem',
    Math.abs(inOrder.hem.hemLengthCm - outOfOrder.hem.hemLengthCm) < 1.0,
    `${inOrder.hem.hemLengthCm} vs ${outOfOrder.hem.hemLengthCm} cm`);
  check('and the same garment, to within the solver noise',
    Math.abs(inOrder.hem.foldDepthCm - outOfOrder.hem.foldDepthCm) < 4.0,
    `fold depth ${inOrder.hem.foldDepthCm} vs ${outOfOrder.hem.foldDepthCm} cm`);

  // ---- many pieces. Nothing in layOut, the stitching or the weld knows how
  // many there are, or that they are the same shape as each other.
  for (const n of [2, 12, 24]) {
    const pat = flaredSkirtPattern({
      panels: n, waistCm: ring.circumferenceCm, circleFraction: 0.5,
      lengthCm: 50, edge: 5.0, waistV,
    });
    const laid = layOut(pat, b, { standoffCm: 6 });
    const st = laid.asm.edgeStrains().map((x) => Math.abs(x.strain));
    check(`${String(n).padStart(2)} pieces arrange and stitch up`,
      pat.seams.length === n && Math.max(...st) < 0.02
        && laid.stitches.length === n * pat.meta.rows,
      `${pat.seams.length} seams, ${laid.stitches.length} stitches,`
      + ` ${laid.asm.verts.length} vertices`);
  }

  // ---- and a completely different pattern: the eight-gore bodice, whose
  // pieces are all different shapes and come from another generator entirely.
  {
    const shell = buildGridShell(torso, { u: 1, cols: 8, rows: 36, ...BAND, ease: 1.0 });
    const { panels: gorePanels } = makePattern(shell, { mode: 'strips', stripWidth: 1, surface: torso });
    const bodice = exportPatternJSON(gorePanels, { gores: 8, rows: 36, ease: 1.0, ...BAND }, shell);
    const laid = layOut(bodice, torso, { standoffCm: 8 });
    const st = laid.asm.edgeStrains().map((x) => Math.abs(x.strain));
    const widths = bodice.panels.map((p) => {
      const xs = p.pts.map((q) => q.x);
      return +(Math.max(...xs) - Math.min(...xs)).toFixed(1);
    });
    console.log(`  the 8-gore bodice: pieces ${widths.join(', ')} cm wide`
      + ` -- ${laid.stitches.length} stitches`);
    // The bodice gores are a whole cell wide -- 17 cm -- so their chord error
    // is three orders of magnitude bigger than the skirt's 4.5 cm triangles.
    // Still a bending and not a stretch; just a coarser mesh being bent.
    let dMax = 0;
    for (const p of bodice.panels) for (const t of p.tris) {
      for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        dMax = Math.max(dMax, Math.abs(p.pts[t[i]].x - p.pts[t[j]].x));
      }
    }
    const bBound = (dMax * dMax) / (24 * laid.radiusCm * laid.radiusCm);
    check('an eight-gore bodice of differently shaped pieces arranges by bending only',
      Math.max(...st) < bBound * 1.5,
      `${(100 * Math.max(...st)).toFixed(2)} % against a predicted `
      + `${(100 * bBound).toFixed(2)} % for its ${dMax.toFixed(0)} cm triangles`);
    check('its seams are all found', laid.stitches.length > 100,
      `${laid.stitches.length} stitches across ${bodice.seams.length} seams`);
    const r = assembleGarment(bodice, torso, {
      fabric: 'cotton poplin', standoffCm: 8, stitchSeconds: 2.0, fallSeconds: 3,
      cloth: { substeps: 8 }, pinWaist: false, pinTop: 1.5,
    });
    console.log(`  stitched the bodice: seam gap ${r.log[0].seamGapStartCm}`
      + ` -> ${r.log[0].seamGapEndCm} cm, peak strain ${r.log[0].maxStretchPct} %`);
    check('and it sews up into one closed garment',
      r.log[0].seamGapEndCm < 1.5 && r.asm.verts.length < laid.asm.verts.length,
      `${laid.asm.verts.length} vertices in pieces -> ${r.asm.verts.length} sewn`);
  }
}

line('arranging by hand: any rigid placement sews up the same');
{
  // The viewer lets you drag the pieces around the body before anything is
  // sewn. Every gesture it offers is a RIGID motion -- a turn about the body's
  // axis, a lift, a spin on the spot, a push in or out -- and this is the
  // property that makes that safe: a rigidly moved piece is still exactly the
  // shape it was cut, so the garment starts unstrained however it was
  // arranged, and sews up to the same thing.
  const b = new Body();
  const waistV = b.landmarkV('waist');
  const ring = waistRing(b, { waistV, ease: 1.0 });
  const pattern = flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm, circleFraction: 0.5,
    lengthCm: 50, edge: 5.0, waistV,
  });

  // The same gestures the mouse and the buttons apply, which are now the same
  // thing: an edit to the piece's stored placement, after which its vertices
  // are recomputed from the pattern (arrange.js). That is what makes the
  // invariant below hold exactly rather than approximately.
  const shove = (laid, pi, { turn = 0, lift = 0, spin = 0, push = 0 }) => {
    const pl = laid.placements[pi];
    pl.station += turn;
    pl.y += lift;
    pl.spin += spin;
    pl.radius = Math.max(1, pl.radius + push);
    arrange.applyPlacements(laid.asm, pattern, laid.placements, laid.axis,
      laid.offsets, [pi]);
  };

  const tidy = layOut(pattern, b, { standoffCm: 6 });
  const tidyStrain = Math.max(...tidy.asm.edgeStrains().map((x) => Math.abs(x.strain)));

  const messy = layOut(pattern, b, { standoffCm: 6 });
  // deliberately awkward: pieces turned most of the way round the body, lifted,
  // spun on the spot and shoved in and out
  // Turned most of the way round the body, lifted, and shoved in and out.
  //
  // Deliberately NOT spun much: a spin is not a neutral rearrangement. Laying a
  // piece in rotated by half a radian sews a twisted garment, and it should --
  // that is what happens if you sew a panel in sideways. Measured: 0.6 rad of
  // spin on one panel of four took the hem from 235 cm to 79 cm, which is the
  // garment wringing itself out. So the invariant being checked here is the one
  // that holds: where a piece sits does not matter, which way it faces does.
  shove(messy, 0, { turn: 2.1, lift: 9, push: 5 });
  shove(messy, 1, { turn: -1.4, lift: -7, push: -2 });
  shove(messy, 2, { turn: 0.8, lift: 4, push: 8 });
  shove(messy, 3, { turn: -2.6, lift: -3, push: 1 });
  const messyStrain = Math.max(...messy.asm.edgeStrains().map((x) => Math.abs(x.strain)));
  check('moving the pieces about does not strain them',
    Math.abs(messyStrain - tidyStrain) < 1e-9,
    `${(100 * tidyStrain).toFixed(3)} % tidy, ${(100 * messyStrain).toFixed(3)} % after`);

  const sew = (laid) => {
    const sim = new Cloth(laid.asm, b, {
      fabric: 'linen', gravityScale: 0, stitches: laid.stitches,
      selfCollision: false, substeps: 8,
    });
    for (let f = 0; f < 180; f++) {
      sim.stitchStrength = Math.min(1, 0.05 + 1.2 * (f / 180));
      sim.step(1 / 60);
    }
    const gap = sim.maxStitchGap();
    const w = weldStitched(laid.asm, laid.stitches, { velocities: sim.vel });
    const sim2 = new Cloth(w.asm, b, { fabric: 'linen', floorY: floorOf(b), substeps: 8 });
    w.velocities.forEach((v, i) => { sim2.vel[i] = v; });
    sim2.settle({ maxSeconds: 5 });
    return { gap, hem: hemProfile(w.asm), peak: sim2.report().maxStretchPct };
  };
  const a = sew(tidy), c = sew(messy);
  console.log(`  laid out tidily:  seams closed to ${a.gap.toFixed(2)} cm,`
    + ` hem ${a.hem.hemLengthCm} cm, ${a.hem.folds} folds, peak ${a.peak} %`);
  console.log(`  shoved about:     seams closed to ${c.gap.toFixed(2)} cm,`
    + ` hem ${c.hem.hemLengthCm} cm, ${c.hem.folds} folds, peak ${c.peak} %`);
  check('both arrangements sew up', a.gap < 0.5 && c.gap < 0.5,
    `${a.gap.toFixed(2)} and ${c.gap.toFixed(2)} cm`);
  check('and give a garment of the same size',
    Math.abs(a.hem.hemLengthCm - c.hem.hemLengthCm) / a.hem.hemLengthCm < 0.02,
    `hem ${a.hem.hemLengthCm} vs ${c.hem.hemLengthCm} cm`);
  check('neither comes out strained', a.peak < 8 && c.peak < 8,
    `${a.peak} % and ${c.peak} %`);
}

line('the transform buttons: every placement is an isometry');
{
  // The claim the whole arrangement phase rests on: a piece that has been
  // moved is still exactly the piece that was cut. Stored placements make that
  // checkable rather than hopeful -- the vertices are recomputed from the
  // pattern every time, so no sequence of button presses can accumulate drift.
  const b = new Body();
  const waistV = b.landmarkV('waist');
  const ring = waistRing(b, { waistV, ease: 1.0 });
  const pattern = flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm, circleFraction: 0.5,
    lengthCm: 50, edge: 5.0, waistV,
  });
  const { placements, axis } = arrange.defaultPlacements(pattern, b, { standoffCm: 6 });
  const panel = pattern.panels[0];

  // flat on a tangent plane, a placement is exactly the pattern, moved
  const flat = arrange.placement({ ...placements[0], wrap: false });
  check('a flat placement is exactly isometric',
    arrange.placementStrain(panel, flat, axis) < 1e-12,
    `${arrange.placementStrain(panel, flat, axis).toExponential(1)}`);

  // rolled, it is the chord-versus-arc error of the mesh and nothing else
  const rolled = arrange.placement(placements[0]);
  const e0 = arrange.placementStrain(panel, rolled, axis);
  check('rolling onto the body bends it without stretching it', e0 < 0.004,
    `${(100 * e0).toFixed(3)} % -- edge^2/24R^2`);

  // Every transform EXCEPT spin is a rigid motion of the already-wrapped
  // piece, so it cannot change the piece's own measurements at all, however
  // many times it is applied. `radius` included: pushing a piece in or out
  // carries it bodily, and the cylinder it was rolled onto (`wrapRadius`) is
  // left alone -- which is what keeps a shared seam lined up when two
  // neighbouring pieces are pushed out by different amounts.
  const rigid = [arrange.placement(placements[0])];
  for (let i = 0; i < 300; i++) {
    arrange.nudge(rigid, [0], 'station', 7);
    arrange.nudge(rigid, [0], 'y', -0.3);
    arrange.nudge(rigid, [0], 'radius', 0.2);
    arrange.nudge(rigid, [0], 'tilt', 3);
    arrange.nudge(rigid, [0], 'swing', -2);
    arrange.nudge(rigid, [0], 'y', 0.3);
    arrange.nudge(rigid, [0], 'radius', -0.2);
  }
  const eR = arrange.placementStrain(panel, rigid[0], axis);
  check('1500 presses of the rigid transforms change nothing at all',
    Math.abs(eR - e0) < 1e-12,
    `${(100 * Math.abs(eR - e0)).toExponential(1)} % of drift`);

  // Spin is the exception, and it is not drift: spin happens in pattern space
  // BEFORE the piece is wrapped, so it changes how the piece's edges lie
  // against the cylinder's curvature and therefore changes the chord-versus-
  // arc error. Measured, this piece: 0.236 % upright, 0.357 % at 45 degrees.
  // It is bounded by the mesh, not by the number of presses, and laying the
  // piece flat removes it entirely whatever the spin.
  const spun = arrange.placement({ ...placements[0], spin: 45 * Math.PI / 180 });
  const eS = arrange.placementStrain(panel, spun, axis);
  console.log(`  spun 45 deg: ${(100 * eS).toFixed(3)} % against`
    + ` ${(100 * e0).toFixed(3)} % upright -- the wrap error, not drift`);
  check('spinning changes the wrap error but keeps it small', eS < 0.005);
  check('and laying it flat removes it however it is spun',
    arrange.placementStrain(panel, arrange.placement({ ...spun, wrap: false }), axis) < 1e-12);

  // The real no-drift claim: a placement is its numbers, so the path taken to
  // them cannot matter. This is what an accumulated mutation could not promise.
  const walked = [arrange.placement(placements[0])];
  for (let i = 0; i < 200; i++) {
    arrange.nudge(walked, [0], 'station', 7);
    arrange.nudge(walked, [0], 'spin', 11);
    arrange.nudge(walked, [0], 'tilt', 3);
    arrange.nudge(walked, [0], 'station', -7);
    arrange.nudge(walked, [0], 'spin', -11);
    arrange.nudge(walked, [0], 'tilt', -3);
  }
  const A = arrange.placePanel(panel, walked[0], axis);
  const B = arrange.placePanel(panel, arrange.placement(placements[0]), axis);
  const worst = Math.max(...A.map((q, i) => dist(q, B[i])));
  console.log(`  1200 presses out and back: every vertex within`
    + ` ${worst.toExponential(1)} cm of where it started`);
  check('a placement is its numbers: the path to them does not matter',
    worst < 1e-9, `${worst.toExponential(1)} cm`);

  // flip and mirror are isometries too, and mirror is its own inverse
  const m = arrange.placement(placements[1]);
  const before = JSON.stringify(m);
  arrange.mirror([m], [0]);
  check('mirroring is an isometry',
    Math.abs(arrange.placementStrain(pattern.panels[1], m, axis)
      - arrange.placementStrain(pattern.panels[1], placements[1], axis)) < 1e-12);
  arrange.mirror([m], [0]);
  check('and mirroring twice is where you started', JSON.stringify(m) === before);

  // distribute evenly really does
  const many = pattern.panels.map((_, i) => arrange.placement({ ...placements[i], station: i * 0.1 }));
  arrange.distribute(many, many.map((_, i) => i));
  const gaps = many.map((q, i) => q.station - many[(i - 1 + many.length) % many.length].station)
    .slice(1);
  check('distribute spaces them equally',
    Math.max(...gaps) - Math.min(...gaps) < 1e-12,
    `${(gaps[0] * DEG).toFixed(1)} deg apart`);
}

line('sewing by hand: only the selected seams, and only what closes');
{
  const b = new Body();
  const waistV = b.landmarkV('waist');
  const ring = waistRing(b, { waistV, ease: 1.0 });
  const mk = () => flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm, circleFraction: 0.5,
    lengthCm: 50, edge: 5.0, waistV,
  });

  // ---- a stitch knows which seam and which two pieces it belongs to
  const laid = layOut(mk(), b, { standoffCm: 6 });
  check('every stitch knows its seam and its two pieces',
    laid.stitches.every((st) => st.seam && st.pa !== undefined && st.pb !== undefined),
    `${new Set(laid.stitches.map((st) => st.seam)).size} seams`);

  // ---- sew ONLY the seams between pieces 0 and 1
  const sim = new Cloth(laid.asm, b, {
    fabric: 'linen', gravityScale: 0, stitches: laid.stitches,
    selfCollision: false, substeps: 8, sewSpeedCmPerSec: 6,
  });
  sim.stitchStrength = 1;
  const sel = new Set([0, 1]);
  // startSewing both puts the thread in and starts feeding it. Arming without
  // feeding -- setStitchActive on its own -- leaves the seam held exactly
  // where it is, which is a half-sewn seam, not a seam being sewn.
  const n = sim.startSewing((st) => sel.has(st.pa) && sel.has(st.pb));
  check('a selection arms only its own seams', n > 0 && n < laid.stitches.length,
    `${n} of ${laid.stitches.length} stitches`);
  const gapOf = (st) => sim.stitchGap(st);
  for (let f = 0; f < 600; f++) {
    sim.step(1 / 60);
    if (!sim.isSewing() && sim.rmsSpeed() < 1.0) break;
  }
  // `sim.stitches`, not `laid.stitches`: the solver takes its own copy, and the
  // live state -- active, tension, saturated -- lives on the solver's.
  const mine = sim.stitches.filter((st) => st.active);
  const others = sim.stitches.filter((st) => !st.active);
  const myGap = Math.max(...mine.map(gapOf));
  const otherGap = Math.max(...others.map(gapOf));
  console.log(`  sewed pieces 0+1: their seam closed to ${myGap.toFixed(3)} cm,`
    + ` the untouched seams are still ${otherGap.toFixed(1)} cm open`);
  check('the selected seam closes', myGap < 0.3, `${myGap.toFixed(3)} cm`);
  check('and the unselected seams are left alone',
    otherGap > 1, `${otherGap.toFixed(1)} cm still open`);
  check('an inactive stitch pulls with nothing',
    others.every((st) => st.tensionGf === 0));

  // ---- a weld takes only what was sewn AND closed
  const w = weldStitched(laid.asm, sim.stitches, { closedCm: 0.25 });
  check('welding takes the closed seams and leaves the rest',
    w.closedStitches.length === mine.length
      && w.openStitches.length === others.length,
    `${w.weldedPct} % welded, ${w.openStitches.length} left basted`);
  check('the welded mesh is still in one piece per unsewn group',
    w.asm.verts.length === laid.asm.verts.length - mine.length,
    `${w.asm.verts.length} vertices from ${laid.asm.verts.length}`);
}

line('sewing happens at a rate: constant speed, and it can be stopped');
{
  // The seam is FED closed at a constant rate rather than pulled towards zero
  // by a force. Pulling towards zero means a constant force over the whole
  // 20-40 cm of travel, so the pieces accelerate the entire way and arrive at
  // speed -- a catapult, not a seam. And a rate is interruptible, which is
  // what makes sewing by hand possible at all.
  const b = new Body();
  const waistV = b.landmarkV('waist');
  const ring = waistRing(b, { waistV, ease: 1.0 });
  const mk = () => flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm, circleFraction: 0.5,
    lengthCm: 50, edge: 6.0, waistV,
  });
  const arm = (sim, sel) => sim.startSewing((st) => sel.has(st.pa) && sel.has(st.pb));
  const fresh = (speed) => {
    const laid = layOut(mk(), b, { standoffCm: 6 });
    const sim = new Cloth(laid.asm, b, {
      fabric: 'linen', gravityScale: 0, stitches: laid.stitches,
      selfCollision: false, substeps: 6, sewSpeedCmPerSec: speed,
    });
    sim.stitchStrength = 1;
    return { laid, sim };
  };

  // ---- nothing is armed until sewing starts: an unsewn seam is not a seam
  // being sewn, and counting it was a bug that made every untouched seam look
  // like one that would not close.
  const { sim: s0 } = fresh(4);
  check('nothing is threaded until sewing starts',
    s0.stitches.every((st) => st.rest === null && !st.active)
      && s0.maxStitchGap() === 0);

  // ---- the duration is the gap divided by the rate, at any rate
  const times = [];
  for (const speed of [2, 4, 10]) {
    const { sim } = fresh(speed);
    arm(sim, new Set([0, 1]));
    const gap0 = sim.remainingFeedCm();
    let t = 0;
    for (let f = 0; f < 2400; f++) { sim.step(1 / 60); t = sim.time; if (!sim.isSewing()) break; }
    times.push({ speed, gap0, t, predicted: gap0 / speed, gap: sim.maxStitchGap() });
  }
  for (const r of times) {
    console.log(`  ${String(r.speed).padStart(2)} cm/s: ${r.gap0.toFixed(1)} cm took`
      + ` ${r.t.toFixed(2)} s (predicted ${r.predicted.toFixed(2)} s),`
      + ` closed to ${r.gap.toFixed(3)} cm`);
  }
  check('the time taken is the gap divided by the rate',
    times.every((r) => Math.abs(r.t - r.predicted) < 0.15),
    times.map((r) => `${r.t.toFixed(2)}/${r.predicted.toFixed(2)}`).join(' '));
  check('and every rate closes the seam', times.every((r) => r.gap < 0.1));

  // ---- the speed is bounded: no accumulation over the travel. A constant
  // force would have the cloth arriving far faster than it set off.
  const { sim } = fresh(4);
  arm(sim, new Set([0, 1]));
  const rates = [];
  let prev = sim.maxStitchGap();
  for (let f = 1; f <= 1200; f++) {
    sim.step(1 / 60);
    if (f % 20 === 0) { rates.push((prev - sim.maxStitchGap()) / (20 / 60)); prev = sim.maxStitchGap(); }
    if (!sim.isSewing()) break;
  }
  const early = rates.slice(0, 3).reduce((a, x) => a + x, 0) / 3;
  const late = rates.slice(-4, -1).reduce((a, x) => a + x, 0) / 3;
  console.log(`  closing rate: ${early.toFixed(2)} cm/s at the start,`
    + ` ${late.toFixed(2)} cm/s at the end (commanded 4)`);
  check('it does not accelerate: the end is no faster than the start',
    late < early * 2.2, `${early.toFixed(2)} -> ${late.toFixed(2)} cm/s`);
  check('and it never greatly exceeds the rate it was given',
    Math.max(...rates) < 4 * 3, `peak ${Math.max(...rates).toFixed(2)} cm/s`);

  // ---- stop half way, and resume from there rather than from the beginning
  const { sim: sp } = fresh(4);
  arm(sp, new Set([0, 1]));
  const full = sp.remainingFeedCm();
  for (let f = 0; f < 90; f++) sp.step(1 / 60);     // 1.5 s of a ~5 s job
  const stoppedAt = sp.maxStitchGap();
  sp.stopSewing();
  check('stopping stops the sewing', !sp.isSewing());
  check('and brings the cloth to rest, so it does not coast on',
    sp.maxSpeed() === 0, `${sp.maxSpeed().toFixed(2)} cm/s`);
  const left = sp.remainingFeedCm();
  console.log(`  stopped after 1.5 s of a ${(full / 4).toFixed(1)} s seam:`
    + ` ${stoppedAt.toFixed(1)} cm open, ${left.toFixed(1)} cm left to take up`);
  check('the seam is left half sewn, not undone and not finished',
    left > 0.25 && left < full - 0.25, `${left.toFixed(1)} of ${full.toFixed(1)} cm`);
  const row = sp.stitchReport({ closedCm: 0.25 }).find((r) => r.seam === 'S01');
  check('and the report says so', /half sewn/.test(row.verdict), row.verdict);

  arm(sp, new Set([0, 1]));                         // W again
  check('resuming carries on from where it stopped',
    Math.abs(sp.remainingFeedCm() - left) < 1e-9,
    `${sp.remainingFeedCm().toFixed(1)} cm, not the original ${full.toFixed(1)}`);

  // ---- moving a sewn piece lets its thread out instead of snapping it back
  const { laid: l2, sim: s2 } = fresh(4);
  arm(s2, new Set([0, 1]));
  for (let f = 0; f < 400; f++) { s2.step(1 / 60); if (!s2.isSewing()) break; }
  check('the seam closed', s2.maxStitchGap() < 0.1);
  arrange.nudge(l2.placements, [1], 'station', 20);
  arrange.applyPlacements(l2.asm, l2.asm.meta ? mk() : mk(), l2.placements, l2.axis, l2.offsets, [1]);
  const opened = s2.maxStitchGap();
  const retied = s2.retieStitches((st) => st.pa === 1 || st.pb === 1);
  check('moving a sewn piece re-ties its threads rather than leaving them taut',
    retied > 0 && s2.remainingFeedCm() > 1,
    `${retied} threads let out over ${opened.toFixed(1)} cm`);
  check('so nothing is left straining', s2.stitches.every((st) => !st.active
    || st.rest === null || s2.stitchGap(st) - st.rest < 0.5));
}

line('an impossible seam shows tension instead of being forced shut');
{
  // The whole reason for the force-limited stitch. A seam that is
  // geometrically too short must STAY OPEN and say by how much, rather than be
  // dragged closed with the fabric taking the difference.
  const b = new Body();
  const waistV = b.landmarkV('waist');
  const ring = waistRing(b, { waistV, ease: 1.0 });
  const mk = () => flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm, circleFraction: 0.5,
    lengthCm: 50, edge: 5.0, waistV,
  });

  // take 20 % out of the length of one panel: its two side seams can no longer
  // reach the panels either side of it
  const pattern = mk();
  const p0 = pattern.panels[0];
  const yTop = Math.max(...p0.pts.map((q) => q.y));
  for (const q of p0.pts) q.y = yTop + (q.y - yTop) * 0.8;

  const r = assembleGarment(pattern, b, {
    fabric: 'linen', standoffCm: 6, stitchSeconds: 2.5, fallSeconds: 3,
    floorY: floorOf(b),
  });
  const touching = r.seams.filter((x) => x.pieces.includes('0'));
  const sound = r.seams.filter((x) => !x.pieces.includes('0'));
  for (const x of r.seams) console.log(`  ${x.seam} (${x.pieces}): ${x.verdict}`);

  check('the seams on the short piece do not close',
    touching.every((x) => x.maxGapCm > 0.25), `${touching.length} seams open`);
  check('and they say so, by how much and why',
    touching.every((x) => /short by/.test(x.verdict)));
  check('while the sound seams close normally',
    sound.every((x) => x.maxGapCm <= 0.25 && x.verdict === 'closed'));
  check('the short seams pull much harder than the sound ones',
    Math.min(...touching.map((x) => x.meanTensionGf))
      > Math.max(...sound.map((x) => x.meanTensionGf)) + 5,
    `${touching.map((x) => x.meanTensionGf).join('/')} gf against `
      + `${sound.map((x) => x.meanTensionGf).join('/')} gf`);
  // Against the fabric's OWN limit, not a constant. The check's name says
  // "past what it can take", and what linen can take is `maxStrain` -- but
  // the threshold was hardcoded at 4.0, a number chosen when that limit was a
  // guessed 3 %. Adopting the measured 6.1 % (see `FABRICS`) made the cloth
  // stretch to 6.2 %, which is AT its limit within the limiter's tolerance
  // and exactly what the check means to allow, while tripping a constant that
  // was really testing "linen, at the 2026-10-11 preset". `grainOverLimit` is
  // the ratio against the fabric's own ceiling, so this now reads the same
  // for a denim and a jersey, and still fails loudly when the yarns are
  // genuinely torn -- it reaches 1.88 on an under-resolved substep count.
  check('and the cloth is NOT stretched past what it can take',
    r.sim.report().grainOverLimit <= 1.05,
    `${r.sim.report().maxStretchPct} % against this fabric's `
      + `${(100 * r.sim.maxStrain).toFixed(1)} % limit`);
  check('the garment is welded only where it closed',
    r.welded.openStitches.length > 0 && r.welded.weldedPct < 100,
    `${r.welded.weldedPct} % welded`);

  // ---- the other way a seam fails: the thread, not the cloth.
  //
  // It has to be tested on a seam that NEEDS force. A sound seam closes on
  // almost nothing -- measured above at under 1 gf -- so a weak thread sews it
  // perfectly well, which is correct and is why the same short pattern is used
  // here with a thread too weak to drag it together.
  const weakPattern = mk();
  const w0 = weakPattern.panels[0];
  const wTop = Math.max(...w0.pts.map((q) => q.y));
  for (const q of w0.pts) q.y = wTop + (q.y - wTop) * 0.8;
  const weak = assembleGarment(weakPattern, b, {
    fabric: 'linen', standoffCm: 6, stitchSeconds: 2.5, fallSeconds: 1,
    // 2 gf, not the 4 this used until 2026-10-18. THE STIMULUS IS RELATIVE
    // TO THE CLOTH, and the cloth changed: BEND_SCALE came down from 30 to
    // 1.8, a limper cloth needs less thread tension to pull together, and at
    // 4 gf the seam now gets to within 0.5 cm and is still feeding -- so it
    // is not stalled, and `being sewn, 0.5 cm to go` is the CORRECT verdict
    // rather than a wrong one. The assertion below is unchanged; only the
    // thread that is supposed to be too weak has had to get weaker.
    floorY: floorOf(b), cloth: { maxTensionGf: 2 },
  });
  const stuck = weak.seams.filter((x) => x.maxGapCm > 0.25);
  console.log(`  with a 2 gf thread: ${stuck.length} of ${weak.seams.length}`
    + ' seams cannot be closed at all');
  check('a thread too weak to close a sound seam saturates',
    stuck.length > 0 && stuck.every((x) => x.atTheLimit > 0),
    `${stuck.map((x) => x.atTheLimit).join('/')} stitches at the limit`);
  // The message carries the verdicts. Until 2026-10-18 it carried nothing,
  // so when this failed after BEND_SCALE changed it said only that it had
  // failed -- a check that cannot say what it saw costs a whole run to
  // diagnose.
  check('and the report blames the thread, not the cloth',
    stuck.every((x) => /thread is at its limit/.test(x.verdict)),
    stuck.map((x) => `"${x.verdict}"`).join('  |  ') || 'no stuck seams');
}

line('editing a piece: taking a wedge out, letting a wedge in');
{
  const b = new Body();
  const waistV = b.landmarkV('waist');
  const ring = waistRing(b, { waistV, ease: 1.0 });
  const mk = () => flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm, circleFraction: 0.25,
    lengthCm: 50, edge: 5.0, waistV,
  });

  // ---- a dart: cut a triangle of cloth away and sew the two cuts together
  const pat = mk();
  const area0 = panelArea(pat.panels[0]);
  const intakeDeg = 20;
  const d = takeOutWedge(pat, 0, { apex: [0, -15], bisectDeg: 90, intakeDeg });
  const wedge = 0.5 * d.legCm[0] * d.legCm[0] * (intakeDeg * Math.PI / 180);
  console.log(`  dart: ${intakeDeg} deg intake, legs ${d.legCm[0]}/${d.legCm[1]} cm,`
    + ` ${d.removedCm2} cm2 of cloth gone (a ${wedge.toFixed(1)} cm2 wedge), ${d.pairs} pairs`);
  check('the two legs of the dart are the same length', d.legMismatchCm < 0.01,
    `${d.legMismatchCm} cm apart`);
  check('it removes the area of the wedge',
    Math.abs(d.removedCm2 - wedge) / wedge < 0.06,
    `${d.removedCm2} against ${wedge.toFixed(1)} cm2`);
  check('and leaves a pattern that still checks out', patternCheck(pat).ok,
    patternCheck(pat).problems.join('; ') || 'no problems');

  // The point of a dart, stated as geometry: it takes the angle defect at the
  // apex from zero to the intake. A flat piece has 360 degrees around every
  // interior point; sew a 20 degree wedge out and 340 are left, and 340 degrees
  // of cloth around a point cannot lie flat. That is the whole mechanism by
  // which a flat cloth is made to fit a body, and docs/01-geometry.md is about
  // little else.
  const apexIdx = pat.panels[0].darts[pat.panels[0].darts.length - 1].apex;
  const angleAt = (panel, vi) => {
    let sum = 0;
    for (const t of panel.tris) {
      const k = t.indexOf(vi);
      if (k < 0) continue;
      const A = panel.pts[vi], B = panel.pts[t[(k + 1) % 3]], C = panel.pts[t[(k + 2) % 3]];
      const u = [B.x - A.x, B.y - A.y], v = [C.x - A.x, C.y - A.y];
      const cosang = (u[0] * v[0] + u[1] * v[1])
        / (Math.hypot(...u) * Math.hypot(...v) || 1);
      sum += Math.acos(Math.max(-1, Math.min(1, cosang)));
    }
    return sum * 180 / Math.PI;
  };
  const around = angleAt(pat.panels[0], apexIdx);
  console.log(`  cloth around the dart apex: ${around.toFixed(2)} deg`
    + ` (360 before, so a defect of ${(360 - around).toFixed(2)})`);
  check('the angle defect it creates is exactly the intake',
    Math.abs((360 - around) - intakeDeg) < 0.5,
    `${(360 - around).toFixed(2)} deg against ${intakeDeg} asked for`);

  // ---- and the assembly sews it with no idea it is a dart
  const laid = layOut(pat, b, { standoffCm: 6 });
  const seamV3 = new Set();
  for (const p of pat.panels) {
    for (const r of p.runs || []) if (r.kind === 'seam' && r.v3) for (const v of r.v3) seamV3.add(v);
  }
  const dartStitches = laid.stitches.filter((st) => !seamV3.has(st.v3)).length;
  check('the dart becomes stitches like any seam', dartStitches === d.pairs,
    `${dartStitches} stitches inside the piece, ${laid.stitches.length} in all`);
  const r = assembleGarment(pat, b, {
    fabric: 'linen', standoffCm: 6, stitchSeconds: 2.0, fallSeconds: 3,
    floorY: floorOf(b), cloth: { substeps: 8 },
  });
  check('and it closes along with everything else', r.log[0].seamGapEndCm < 0.2,
    `${r.log[0].seamGapEndCm} cm`);

  // ---- letting a wedge in is the same operation with the other sign
  const pat2 = mk();
  const spreadDeg = 25;
  const sp = letInWedge(pat2, 0, { apex: [0, 0], towardsDeg: -90, spreadDeg });
  const gusset = 0.5 * sp.legCm * sp.legCm * (spreadDeg * Math.PI / 180);
  console.log(`  spread: ${spreadDeg} deg at the hem, ${sp.addedCm2} cm2 of cloth added`
    + ` (a ${gusset.toFixed(0)} cm2 gusset)`);
  check('it adds the area of the gusset',
    Math.abs(sp.addedCm2 - gusset) / gusset < 0.06,
    `${sp.addedCm2} against ${gusset.toFixed(0)} cm2`);
  check('the piece grows by exactly what was let in',
    Math.abs(panelArea(pat2.panels[0]) - (area0 + sp.addedCm2)) < 0.01,
    `${panelArea(pat2.panels[0]).toFixed(1)} vs ${(area0 + sp.addedCm2).toFixed(1)} cm2`);
  check('and that pattern checks out too', patternCheck(pat2).ok,
    patternCheck(pat2).problems.join('; ') || 'no problems');
  check('letting cloth in adds no seam -- it is one piece still',
    pat2.seams.length === mk().seams.length,
    `${pat2.seams.length} seams, same as before`);

  // ---- truing a dart: what it does to the edge it crosses
  //
  // Cutting a dart leaves the edge it crossed with a step and a corner once
  // the dart is sewn shut, by as much as the two legs disagree. The profile
  // measures that -- per dart, located -- and truing takes both to zero by
  // moving the leg ends to where the closed edge crosses them.
  const pat3 = mk();
  takeOutWedge(pat3, 0, { apex: [-2, -14], bisectDeg: 80, intakeDeg: 18 });
  const prof0 = closedDartProfile(pat3);
  console.log(`  dart folded shut: step ${prof0.step.worst} cm,`
    + ` turn ${prof0.turn.worst} deg at the mouth`);
  check('a dart cut off the radial turns the edge it crosses',
    prof0.turn.worst > 1, `${prof0.turn.worst} deg`);
  const tr = trueDarts(pat3);
  console.log(`  trued ${tr.trued}/${tr.darts}: step ${tr.stepBeforeCm.worst}`
    + ` -> ${tr.stepAfterCm.worst} cm, turn ${tr.turnBeforeDeg.worst}`
    + ` -> ${tr.turnAfterDeg.worst} deg`);
  check('truing takes the step out of the edge', tr.stepAfterCm.worst < 1e-6,
    `${tr.stepAfterCm.worst} cm`);
  check('and the corner with it', tr.turnAfterDeg.worst < 1e-3,
    `${tr.turnAfterDeg.worst} deg`);
  check('and leaves the legs equal', Math.abs(
    pat3.panels[0].darts[0].legCm[0] - pat3.panels[0].darts[0].legCm[1]) < 1e-6);
  check('a trued pattern still checks out', patternCheck(pat3).ok,
    patternCheck(pat3).problems.join('; ') || 'no problems');

  // ---- the rigid transforms change the piece's place, never its cloth
  const pat4 = mk();
  const areaBefore = panelArea(pat4.panels[0]);
  movePiece(pat4, 0, { dx: 7, dy: -3 });
  turnPiece(pat4, 0, { degrees: 23 });
  check('moving and turning a piece changes no cloth at all',
    Math.abs(panelArea(pat4.panels[0]) - areaBefore) < 1e-6,
    `${panelArea(pat4.panels[0]).toFixed(4)} cm2`);
  turnPiece(pat4, 0, { degrees: -23 });
  movePiece(pat4, 0, { dx: -7, dy: 3 });
  check('and they undo themselves exactly', Math.abs(
    pat4.panels[0].pts[0].x - mk().panels[0].pts[0].x) < 1e-9);

  // ---- mirroring: a copy is a DIFFERENT piece of the garment
  const pat5 = mk();
  const seams5 = pat5.seams.length;
  const m = mirrorPiece(pat5, 0, { axis: 'y', mode: 'copy' });
  check('a mirrored copy is a new piece', m.pattern.panels.length === 5);
  check('and shares no vertex id with the piece it came from -- '
    + 'the left of a body is not the right of it',
    (() => {
      const a = new Set(pat5.panels[0].pts.map((q) => q.v3));
      return pat5.panels[4].pts.every((q) => !a.has(q.v3));
    })());
  check('so it adds no seam', pat5.seams.length === seams5,
    `${pat5.seams.length} seams`);
  // cut on the fold: the two halves share the points ON the line and nothing
  // else, and the line has to be an EDGE of the piece rather than a line that
  // happens to touch it
  const pat5b = mk();
  const area5 = panelArea(pat5b.panels[0]);
  const loop5 = pat5b.panels[0].loop.map((i) => ({ i, ...pat5b.panels[0].pts[i] }))
    .sort((u, v) => u.x - v.x);
  const F1 = loop5[0];
  const F2 = loop5.find((q) => Math.hypot(q.x - F1.x, q.y - F1.y) > 5 && Math.abs(q.x - F1.x) < 2);
  const fold = mirrorPiece(pat5b, 0, { line: [[F1.x, F1.y], [F2.x, F2.y]], mode: 'fold' });
  console.log(`  fold: ${fold.onFold} points on the fold, ${area5.toFixed(1)}`
    + ` -> ${fold.areaCm2} cm2`);
  check('opening a piece out on the fold doubles it exactly',
    Math.abs(fold.areaCm2 - 2 * area5) < 0.01, `${fold.areaCm2} cm2`);
  check('and the fold is the only thing the two halves share',
    fold.onFold > 2 && pat5b.panels.length === 4, `${fold.onFold} points`);
  check('a fold line that only touches the piece is refused -- '
    + 'that is a hinge, not a fold', (() => {
      const t = mk();
      const xs = t.panels[0].pts.map((q) => q.x);
      try {
        mirrorPiece(t, 0, { line: [[Math.min(...xs), -100], [Math.min(...xs), 100]], mode: 'fold' });
        return false;
      } catch { return true; }
    })());

  check('mirrored twice is where it started', (() => {
    const t = mk();
    const x0 = t.panels[0].pts.map((q) => q.x);
    mirrorPiece(t, 0, { axis: 'y', mode: 'flip' });
    mirrorPiece(t, 0, { axis: 'y', mode: 'flip' });
    return t.panels[0].pts.every((q, i) => Math.abs(q.x - x0[i]) < 1e-9);
  })());

  // ---- cutting a piece in two makes a seam; joining puts it back
  const pat6 = mk();
  const area6 = panelArea(pat6.panels[0]);
  const xs6 = pat6.panels[0].pts.map((q) => q.x);
  const ys6 = pat6.panels[0].pts.map((q) => q.y);
  const midx = (Math.min(...xs6) + Math.max(...xs6)) / 2;
  const sp6 = splitPiece(pat6, 0, {
    from: [midx, Math.min(...ys6) - 10], to: [midx, Math.max(...ys6) + 10],
  });
  console.log(`  cut: ${sp6.names.join(' + ')}, ${sp6.sharedPoints} points along the cut,`
    + ` ${sp6.cutLengthCm} cm, ${sp6.neighboursCut} neighbouring pieces cut to match`);
  check('cutting a piece in two keeps every square centimetre',
    Math.abs(sp6.areaLostCm2) < 1e-6, `${sp6.areaLostCm2} cm2`);
  check('the cut is a seam, not a gap -- both halves carry the same ids',
    sp6.sharedPoints > 5, `${sp6.sharedPoints} shared points`);
  check('so the pattern gained exactly one seam',
    pat6.seams.length === seams5 + 1, `${pat6.seams.length} seams`);
  check('and it still checks out', patternCheck(pat6).ok,
    patternCheck(pat6).problems.join('; ') || 'no problems');
  // Where the cut leaves through a seam, the neighbour is cut to match, or
  // the seam loses a stitch there. Measured: 65 stitches with, 63 without --
  // and `check()` reports nothing either way, which is its own open item.
  const pat6b = mk();
  const xs6b = pat6b.panels[1].pts.map((q) => q.x);
  const ys6b = pat6b.panels[1].pts.map((q) => q.y);
  const midy6 = (Math.min(...ys6b) + Math.max(...ys6b)) / 2;
  const across = splitPiece(pat6b, 1, {
    from: [Math.min(...xs6b) - 10, midy6], to: [Math.max(...xs6b) + 10, midy6],
  });
  console.log(`  cut across two seams: ${across.neighboursCut} neighbours cut to match,`
    + ` ${layOut(across.pattern, b, { standoffCm: 6 }).stitches.length} stitches`);
  check('a cut leaving through a seam cuts the neighbour too',
    across.neighboursCut === 2, `${across.neighboursCut} neighbours`);
  check('so every point of that seam still has a partner to be sewn to',
    (() => {
      const n = new Map();
      for (const pan of across.pattern.panels) {
        for (const q of pan.pts) n.set(q.v3, (n.get(q.v3) || 0) + 1);
      }
      return across.pattern.panels.every((pan) => (pan.runs || []).every((r) => r.kind !== 'seam'
        || r.pts.every((i) => (n.get(pan.pts[i].v3) || 0) >= 2)));
    })());
  const j6 = joinPieces(pat6, 0, 1, { toleranceCm: 0.5 });
  console.log(`  joined back: ${j6.weldedPoints} points welded, worst ${j6.worstCm} cm`);
  check('joining the two halves back is exact -- they were one piece',
    j6.worstCm < 1e-6, `${j6.worstCm} cm`);
  check('and gives the area back', Math.abs(panelArea(pat6.panels[0]) - area6) < 1e-6,
    `${panelArea(pat6.panels[0]).toFixed(3)} cm2`);
  check('a piece cannot be joined to one it shares no seam with', (() => {
    const t = mk();
    try { joinPieces(t, 0, 2, {}); return false; } catch { return true; }
  })());

  // ---- the edit list, and replaying it onto a body it was not cut for
  const pat7 = mk();
  takeOutWedge(pat7, 0, { apex: [-2, -14], bisectDeg: 80, intakeDeg: 18 });
  takeOutWedge(pat7, 1, { apex: [1, -12], bisectDeg: 95, intakeDeg: 12 });
  setAllowance(pat7, { bottom: 2.5 });
  setGrain(pat7, 0, 90);
  const rows = editList(pat7);
  console.log(`  edits: ${rows.map((e) => e.what).join(' | ')}`);
  check('every edit is recorded, in order', rows.length === 4, `${rows.length} edits`);
  check('and a dart is recorded as a construction, not as a coordinate',
    pat7.edits[0].on && pat7.edits[0].on.run !== undefined,
    JSON.stringify(pat7.edits[0].on));

  const again = replayEdits(mk(), pat7.edits);
  check('replayed onto the same draft, every edit lands',
    again.applied === 4 && again.skipped.length === 0, again.skipped.join('; '));
  check('and gives back the same cloth',
    Math.abs(panelArea(again.pattern.panels[0]) - panelArea(pat7.panels[0])) < 0.5,
    `${panelArea(again.pattern.panels[0]).toFixed(1)} vs ${panelArea(pat7.panels[0]).toFixed(1)} cm2`);

  // THE FIT TEST: the same edits onto a skirt drafted for a bigger waist.
  // This is the one that a coordinate cannot do -- the apex would snap to
  // whatever vertex was nearest its old (x, y) and the dart would miss.
  const bigger = flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm + 8, circleFraction: 0.25,
    lengthCm: 50, edge: 5.0, waistV,
  });
  const onBigger = replayEdits(bigger, pat7.edits);
  console.log(`  replayed onto a waist 8 cm bigger: ${onBigger.applied} applied,`
    + ` ${onBigger.skipped.length} skipped`);
  check('the edits replay onto a body they were not cut for',
    onBigger.applied === 4 && onBigger.skipped.length === 0, onBigger.skipped.join('; '));
  check('and that pattern checks out', patternCheck(onBigger.pattern).ok,
    patternCheck(onBigger.pattern).problems.join('; ') || 'no problems');
  check('the darts are there, and in the bigger piece',
    onBigger.pattern.panels[0].darts.length === 1
    && panelArea(onBigger.pattern.panels[0]) > panelArea(pat7.panels[0]),
    `${panelArea(onBigger.pattern.panels[0]).toFixed(0)} cm2`);

  // ---- the allowance is the pattern's, and the hem can differ from the seams
  const svgWide = patternSVG(pat7, { seamAllowanceCm: 1.0 });
  check('the sheet prints the allowances the pattern carries, not one number',
    svgWide.svg.includes('2.5'), 'hem allowance 2.5 cm on the sheet');
}

line('saving and loading');
{
  // ---- the dress form: what is saved is the measurement set, nothing derived
  const b = new Body({ bust: 97.5, waist: 74, bellyProtuberance: 'C', units: 'cm' });
  b.applyPose('Rest (standing)');
  b.m.shoulderDrop = 1.5;                       // the asymmetry no size chart has
  b.build();
  const text = JSON.stringify(exportFormJSON(b, { name: 'tape measure' }));
  const back = applyForm(new Body(), importFormJSON(text));
  check('a saved dress form loads back measurement for measurement',
    JSON.stringify(back.m) === JSON.stringify(b.m),
    `${Object.keys(b.m).length} measurements`);
  check('and the body it rebuilds is the same body',
    Math.abs(back.landmarkV('waist') - b.landmarkV('waist')) < 1e-12
    && Math.abs(back.cm().bust - 97.5) < 1e-9,
    `waist v ${back.landmarkV('waist').toFixed(6)}, bust ${back.cm().bust} cm`);
  check('the pose comes back with it', back.poseName === 'Rest (standing)', back.poseName);
  check('the filename says which body it is',
    formFileName(back, 'tape measure') === 'tape-measure-98-74-98.json',
    formFileName(back, 'tape measure'));

  let rejected = 'nothing';
  try { importFormJSON(JSON.stringify({ format: 'something-else', m: {} })); }
  catch (err) { rejected = err.message; }
  check('a file that is not a dress form is refused', rejected.includes('not a dress form'),
    rejected);
  const sloppy = importFormJSON(JSON.stringify({
    format: 'triangulated-bodice-form/1', m: { bust: 90, notAMeasurement: 3 },
  }));
  check('a key that means nothing to the body is dropped, not carried',
    !('notAMeasurement' in sloppy.m) && sloppy.dropped[0] === 'notAMeasurement',
    sloppy.dropped.join(', '));

  // ---- a pattern with a dart in it: the edit is what is worth keeping
  const skirt = flaredSkirtPattern({
    panels: 4, waistCm: 72, hemCm: 180, lengthCm: 60, gather: 1.2, edge: 3,
  });
  const before = JSON.parse(JSON.stringify(skirt));
  // the apex is a boundary vertex of the first piece, with the wedge aimed at
  // the middle of it -- which is where a waist dart goes
  const piece = skirt.panels[0];
  const apex = piece.pts[piece.loop[0]];
  const cx = piece.pts.reduce((a, q) => a + q.x, 0) / piece.pts.length;
  const cy = piece.pts.reduce((a, q) => a + q.y, 0) / piece.pts.length;
  const dart = takeOutWedge(skirt, 0, {
    apex: [apex.x, apex.y],
    bisectDeg: Math.atan2(cy - apex.y, cx - apex.x) * 180 / Math.PI,
    intakeDeg: 10,
  });
  const reloaded = importPatternJSON(JSON.stringify(skirt));
  const dartsOf = (p) => p.panels.reduce((n, q) => n + ((q.darts || []).length), 0);
  check('a dart taken out survives the save and the load',
    dartsOf(reloaded) === dartsOf(before) + 1,
    `${dartsOf(before)} darts before, ${dartsOf(reloaded)} after`);
  check('and the cloth it removed is what was saved',
    Math.abs((panelArea(before.panels[0]) - panelArea(skirt.panels[0])) - dart.removedCm2) < 0.01,
    `${dart.removedCm2} cm2 out of the piece`);
  check('and so does the cloth the dart removed',
    Math.abs(panelArea(reloaded.panels[0]) - panelArea(skirt.panels[0])) < 1e-9,
    `${panelArea(reloaded.panels[0]).toFixed(2)} cm2`);
  check('the edit list survives the save and the load too -- which is what '
    + 'makes a saved pattern replayable onto another body',
    (reloaded.edits || []).length >= 1 && reloaded.edits[0].op === 'dart'
    && !!reloaded.edits[0].on,
    `${(reloaded.edits || []).length} edits, apex as ${JSON.stringify((reloaded.edits || [{}])[0].on)}`);
  check('the reloaded pattern still checks out', patternCheck(reloaded).ok,
    patternCheck(reloaded).problems.join('; ') || 'no problems');
}

line('exports');
const objOut = settled.toOBJ('settled bodice');
check('OBJ export has the right vertex count',
  objOut.split('\n').filter((l) => l.startsWith('v ')).length === settled.verts.length);
check('JSON round-trips', Assembly.fromJSON(settled.toJSON()).tiles.length === settled.tiles.length);

function fmt(s) {
  return `tiles ${s.tiles} verts ${s.vertices} edges ${s.edges} dof ${s.dof}`
    + ` | strain rms ${(s.rmsStrain * 100).toFixed(2)}% max ${(s.maxStrain * 100).toFixed(1)}%`
    + ` | fit rms ${s.rmsFitCm?.toFixed(3)} max ${s.maxFitCm?.toFixed(2)} cm`
    + ` | inside ${s.deepestPenetrationCm?.toFixed(2)} cm`;
}

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}\n`);
process.exit(fails ? 1 : 0);
