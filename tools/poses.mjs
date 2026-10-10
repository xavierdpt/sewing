// Range of motion: draft a bodice for a body at rest, then make it move.
//
//   node tools/poses.mjs
//
// A bodice fitted with the arms down pulls across the back the moment you reach
// forward. Patternmakers allow for that with numbers handed down rather than
// measured. This drapes one pattern through every predefined pose and reports
// where it binds -- which is the same question, asked with a tape.
import { Body, POSES } from '../app/js/body.js';
import { buildGridShell } from '../app/js/lattice.js';
import { makePattern } from '../app/js/panels.js';
import { exportPatternJSON, sew, drape } from '../app/js/patternio.js';

const GORES = 8, ROWS = 36, EASE = 1.0;
const REST = 'Rest (standing)';

function draftFor(body) {
  const body_band = body.band('bodice');
  const BODY_WAIST_V = body.landmarkV('waist');
  const shell = buildGridShell(body, { u: 1, cols: GORES, rows: ROWS, ...body_band, ease: EASE });
  const { panels } = makePattern(shell, { mode: 'strips', stripWidth: 1, surface: body });
  return exportPatternJSON(panels, { gores: GORES, rows: ROWS, ease: EASE,
    ...body_band, waistV: BODY_WAIST_V, pose: REST }, shell);
}

const rest = new Body();
rest.applyPose(REST);
rest.includeArms = false;               // draft against the torso alone
const pattern = draftFor(rest);
console.log(`drafted for "${REST}": ${pattern.panels.length} gores, ${EASE} cm ease\n`);

const pad = (s, n) => String(s).padStart(n);

// Draping with the arms switched on is meaningless until the pattern has
// armholes cut in it: the gores run straight through where the arm is, so the
// cloth gets pinned between torso and limb and every pose reports a disaster.
// So the fit is draped against the torso alone, and the arms are used for what
// they can honestly answer -- how much cloth is in the way, which IS the
// armhole that has to be cut, and how far the armscye opens as the arm swings.
console.log('pose                 armscye  cloth in the arm   fit on the torso alone');
console.log('                        (cm)   verts   deepest   median gap  tension  verdict');
for (const name of Object.keys(POSES)) {
  const body = new Body();
  body.applyPose(name);
  body.includeArms = false;
  const loop = body.armscye(-1);
  let per = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i].p, b = loop[(i + 1) % loop.length].p;
    per += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  const g = sew(pattern, body, { ease: EASE });
  const fit = drape(g, body);
  // how much of the garment is now occupying the arm?
  let inArm = 0, deepest = 0;
  for (const p of g.verts) {
    const a = body.closestArm(p);
    if (a && a.signed < 0) { inArm++; deepest = Math.max(deepest, -a.signed); }
  }
  console.log(`${name.padEnd(20)} ${pad(per.toFixed(1), 7)} ${pad(inArm, 7)}`
    + ` ${pad(deepest.toFixed(2), 9)} ${pad(fit.medianGapCm.toFixed(2), 12)}`
    + ` ${pad(fit.meanTensionPct.toFixed(2), 8)}  ${fit.verdict}`);
}
console.log('\nThe armscye column is the body\'s own: how far the armhole opens as the arm');
console.log('swings. "Cloth in the arm" is the hole the pattern still needs -- take the');
console.log('worst pose, because the garment has to survive all of them.');
