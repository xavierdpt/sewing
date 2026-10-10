// Can you walk in it? Can you sit down in it?
//
//   node tools/skirt_poses.mjs
//
// A skirt that fits standing is not the question. The hem has to clear both
// legs in every pose the wearer will actually adopt, and a hem narrower than
// that cannot be walked in however well it hangs. This is the number behind
// every vent, pleat and slit ever cut into a straight skirt.
import { Body, POSES } from '../app/js/body.js';
import { buildGridShell } from '../app/js/lattice.js';
import { makePattern } from '../app/js/panels.js';
import { exportPatternJSON, sew, drape } from '../app/js/patternio.js';

const GORES = 8, ROWS = 24, EASE = 1.2;
const REST = 'Rest (standing)';

const rest = new Body();
rest.applyPose(REST);
// The skirt is drafted on the body, which stops at the crotch. Length below
// that is flare, added afterwards, not read off a body.
const band = rest.band('skirt');
const shell = buildGridShell(rest, { u: 1, cols: GORES, rows: ROWS, ...band, ease: EASE });
const { panels } = makePattern(shell, { mode: 'strips', stripWidth: 1, surface: rest });
const pattern = exportPatternJSON(panels, { gores: GORES, rows: ROWS, ease: EASE,
  ...band, waistV: rest.landmarkV('waist'), garment: 'skirt', pose: REST }, shell);

// What the skirt offers at each height: the envelope it was cut on, plus ease.
const offeredAt = (y) => rest.girthAt(rest.vOfY(y)) + 2 * Math.PI * EASE;
const yLo = rest.heights.crotch, yHi = rest.heights.lowHip;
console.log(`skirt: ${panels.length} gores to the crotch, ${EASE} cm ease,`
  + ` hem at the crotch ${offeredAt(yLo).toFixed(1)} cm\n`);

const pad = (s2, n) => String(s2).padStart(n);
console.log('pose                worst spare   at height   needs   offers   cloth in a leg');
console.log('                        (cm)         (cm)      (cm)     (cm)   verts  deepest');
for (const name of Object.keys(POSES)) {
  const body = new Body();
  body.applyPose(name);
  body.includeLegs = false;
  const prof = body.clearanceProfile(offeredAt, yLo, yHi);
  const g = sew(pattern, body, { ease: EASE });
  drape(g, body);
  let inLeg = 0, deepest = 0;
  for (const p of g.verts) {
    const l = body.closestLeg(p);
    if (l && l.signed < 0) { inLeg++; deepest = Math.max(deepest, -l.signed); }
  }
  const w = prof.worst;
  if (!w) {
    console.log(`${name.padEnd(19)} ${pad('n/a', 10)}`
      + '            legs near horizontal: a skirt drapes over a lap,');
    console.log(`${' '.repeat(19)}            it does not thread over it`);
    continue;
  }
  const flag = w.spareCm < 0 ? '  <-- BINDS' : '';
  console.log(`${name.padEnd(19)} ${pad(w.spareCm.toFixed(1), 10)} ${pad(w.y.toFixed(0), 11)}`
    + ` ${pad(w.needCm.toFixed(1), 8)} ${pad(w.haveCm.toFixed(1), 8)} ${pad(inLeg, 7)}`
    + ` ${pad(deepest.toFixed(2), 8)}${flag}`);
}
console.log('\n"Needs" is the convex hull of both legs at that height: the smallest');
console.log('circumference that can pass over them. The binding point is rarely the hem --');
console.log('stride and the knee rises, so the hem clears while the thigh is jammed.');
console.log('Negative spare is what a vent, a pleat or a slit exists to fix.');
console.log('Sitting is excluded because the thighs go near horizontal, where a');
console.log('horizontal slice stops being a girth anything has to pass over.');
