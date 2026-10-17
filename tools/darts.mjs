// Do a dart's two legs pair up the way a sewer would pair them?
//
//   node tools/darts.mjs              the asymmetric fixture on the skirt
//   node tools/darts.mjs --intake 20 --depth 12 --across 0.5   one dart, by hand
//   node tools/darts.mjs --pairs      every pair, not just the summary
//
// A dart is two straight legs from a common apex, sewn to each other. The
// correspondence is therefore Thales': a point at fraction t of one leg is
// sewn to the point at fraction t of the other, so the stitches are parallel
// chords across the wedge and the two cut edges meet along their whole length.
// Anything else twists the dart or leaves part of a leg sewn to nothing.
//
// This reports, per dart:
//   - each leg's length and the radii of its vertices, which are decided by
//     where the cut ray crossed the mesh and are therefore NOT the same on the
//     two legs;
//   - for each pair, the difference between the two fractions it joins -- 0 is
//     Thales, anything else is the error, in fractions and in centimetres;
//   - vertices labelled with an id nobody else carries (sewn to nothing), and
//     ids carried by more than two vertices (sewn to several things).
import { Body } from '../app/js/body.js';
import { flaredSkirtPattern, waistRing } from '../app/js/skirt.js';
import { takeOutWedge } from '../app/js/patternedit.js';
import { asymmetricDarts } from '../app/js/skirtdarts.js';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? +args[args.indexOf(n) + 1] : d);
const showPairs = args.includes('--pairs');

const b = new Body();
b.includeArms = true; b.includeLegs = true;
const waistV = b.landmarkV('waist');
const ring = waistRing(b, { waistV, ease: 1.0 });
const mkPattern = () => flaredSkirtPattern({
  panels: 4, waistCm: ring.circumferenceCm, hemCm: 160, lengthCm: 55,
  gather: 1.0, edge: flag('--edge', 3.0), waistV,
});

/** Every v3 id in a panel, with the points that carry it. */
const idGroups = (panel) => {
  const by = new Map();
  panel.pts.forEach((q, i) => {
    if (q.v3 === null || q.v3 === undefined) return;
    if (!by.has(q.v3)) by.set(q.v3, []);
    by.get(q.v3).push(i);
  });
  return by;
};

/**
 * The pairing of one dart, measured against Thales.
 *
 * The apex and bisector are known, so each paired point's fraction along its
 * own leg is recoverable from the geometry alone -- no need to trust what the
 * cutter reported.
 */
function pairingOf(panel, dart) {
  const A = panel.pts[dart.apex];
  const apex = [A.x, A.y];
  const half = (dart.intakeDeg * Math.PI / 180) / 2;
  const mid = dart.bisectDeg * Math.PI / 180;
  const legDir = [mid - half, mid + half].map((a) => [Math.cos(a), Math.sin(a)]);
  const rOf = (q, d) => (q.x - apex[0]) * d[0] + (q.y - apex[1]) * d[1];
  const onLeg = (q, d) => {
    const r = rOf(q, d);
    const off = Math.abs((q.x - apex[0]) * d[1] - (q.y - apex[1]) * d[0]);
    return r > 1e-6 && off < 1e-4 * Math.max(1, r) ? r : null;
  };
  const legs = legDir.map((d) => panel.pts
    .map((q, i) => ({ i, r: onLeg(q, d) }))
    .filter((x) => x.r !== null)
    .sort((x, y) => x.r - y.r));
  const L = legs.map((leg) => (leg.length ? leg[leg.length - 1].r : 0));
  const fracOf = new Map();
  legs.forEach((leg, k) => leg.forEach(({ i, r }) => fracOf.set(i, { leg: k, t: r / (L[k] || 1), r })));

  const groups = idGroups(panel);
  const pairs = [], lonely = [], crowded = [];
  for (const [id, pts] of groups) {
    const mine = pts.filter((i) => fracOf.has(i));
    if (!mine.length) continue;                       // not this dart's
    if (pts.length === 1) { lonely.push({ id, at: fracOf.get(pts[0]) }); continue; }
    if (pts.length > 2) { crowded.push({ id, n: pts.length }); continue; }
    const [p, q] = pts.map((i) => fracOf.get(i));
    if (!p || !q || p.leg === q.leg) { crowded.push({ id, n: pts.length, sameLeg: true }); continue; }
    pairs.push({
      id,
      t1: +(p.leg === 0 ? p.t : q.t).toFixed(4),
      t2: +(p.leg === 0 ? q.t : p.t).toFixed(4),
      r1: +(p.leg === 0 ? p.r : q.r).toFixed(3),
      r2: +(p.leg === 0 ? q.r : p.r).toFixed(3),
    });
  }
  pairs.sort((x, y) => x.t1 - y.t1);
  for (const pr of pairs) {
    pr.dt = +Math.abs(pr.t1 - pr.t2).toFixed(4);
    // the gap this leaves between the two points once the dart is closed up:
    // they are sewn together, so the error is how far apart they START along
    // the seam, which is the difference in radius each would have at the
    // other's fraction
    pr.offCm = +Math.abs(pr.r1 - pr.r2 * (L[0] / (L[1] || 1))).toFixed(3);
  }
  return {
    legLenCm: L.map((x) => +x.toFixed(3)),
    legPts: legs.map((leg) => leg.length),
    pairs, lonely, crowded,
  };
}

const rows = [];
const pattern = mkPattern();
const cut = args.includes('--intake')
  ? (() => {
    const p = mkPattern();
    const r = takeOutWedge(p, 0, {
      apex: [0, -flag('--depth', 12)], bisectDeg: 90, intakeDeg: flag('--intake', 20),
    });
    return { pattern: p, darts: [{ panel: p.panels[0].name, ...r }] };
  })()
  : asymmetricDarts(pattern);

for (const panel of cut.pattern.panels) {
  for (const dart of (panel.darts || [])) {
    const m = pairingOf(panel, dart);
    const dts = m.pairs.map((p) => p.dt);
    rows.push({
      panel: panel.name,
      intakeDeg: dart.intakeDeg,
      'leg 1 cm': m.legLenCm[0], 'leg 2 cm': m.legLenCm[1],
      'pts 1': m.legPts[0], 'pts 2': m.legPts[1],
      pairs: m.pairs.length,
      'worst dt': dts.length ? +Math.max(...dts).toFixed(4) : null,
      'mean dt': dts.length ? +(dts.reduce((a, x) => a + x, 0) / dts.length).toFixed(4) : null,
      'worst off cm': m.pairs.length ? Math.max(...m.pairs.map((p) => p.offCm)) : null,
      'sewn to nothing': m.lonely.length,
      'sewn to several': m.crowded.length,
    });
    if (showPairs) {
      console.log(`\n${panel.name}, ${dart.intakeDeg} deg:`);
      console.table(m.pairs);
      if (m.lonely.length) console.table(m.lonely);
    }
  }
}
console.log('\nPairing against Thales: dt is |t1 - t2|, the difference in'
  + ' fraction along the two legs.\n0 is a correct dart.');
console.table(rows);
