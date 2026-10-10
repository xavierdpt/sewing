// Draft a pattern for one body, then sew it onto another and see how it fits.
//
//   node tools/try_pattern.mjs
//
// This is the thing a commercial pattern cannot tell you: not "what size are
// you" but "where exactly does this piece of paper stop matching you".
import { writeFileSync, mkdirSync } from 'node:fs';
import { Body } from '../app/js/body.js';
import { buildGridShell } from '../app/js/lattice.js';
import { makePattern } from '../app/js/panels.js';
import { exportPatternJSON, importPatternJSON, sew, drape } from '../app/js/patternio.js';

const GORES = 8, ROWS = 36, EASE = 1.0;

function draftFor(torso) {
  const body_band = torso.band('bodice');
  const BODY_WAIST_V = torso.landmarkV('waist');
  const shell = buildGridShell(torso, { u: 1, cols: GORES, rows: ROWS, ...body_band, ease: EASE });
  const { panels } = makePattern(shell, { mode: 'strips', stripWidth: 1, surface: torso });
  return exportPatternJSON(panels, { gores: GORES, rows: ROWS, ease: EASE, ...body_band, waistV: BODY_WAIST_V }, shell);
}

const standard = new Body();
const json = draftFor(standard);
mkdirSync('out', { recursive: true });
writeFileSync('out/pattern.json', JSON.stringify(json));
console.log(`drafted for the default body: ${json.panels.length} panels,`
  + ` ${json.panels.reduce((a, p) => a + p.tris.length, 0)} triangles`
  + `  -> out/pattern.json\n`);

const pattern = importPatternJSON(JSON.stringify(json));

const bodies = [
  ['the body it was drafted for', {}],
  ['bust +6 cm', { bust: 98 }],
  ['bust +16 cm', { bust: 108 }],
  ['bust +26 cm', { bust: 118 }],
  ['bust -10 cm', { bust: 82 }],
  ['waist +16 cm', { waist: 88 }],
  ['waist -10 cm', { waist: 62 }],
  ['hip +18 cm', { lowHip: 116 }],
  ['one shoulder 5 cm lower', { shoulderDrop: 5 }],
  ['6 cm lateral spine deviation', { lateralShift: 6 }],
  ['much bigger cup (bust +12, underbust same)', { bust: 104 }],
  ['two sizes larger all over', { bust: 102, underbust: 86,
    waist: 84, lowHip: 108 }],
  ['two sizes smaller all over', { bust: 82, underbust: 66,
    waist: 62, lowHip: 88 }],
];

const pad = (s, n) => String(s).padStart(n);
console.log('body                             min gap   p10  median   p90   tension  tight  verdict');
console.log('                                   (cm)    (cm)   (cm)    (cm)    mean%  spots');
for (const [name, changes] of bodies) {
  const body = new Body(changes);
  const garment = sew(pattern, body, { ease: EASE });
  const fit = drape(garment, body);
  console.log(`${name.padEnd(32)} ${pad(fit.minGapCm.toFixed(2), 6)} ${pad(fit.p10GapCm.toFixed(2), 6)}`
    + ` ${pad(fit.medianGapCm.toFixed(2), 6)} ${pad(fit.p90GapCm.toFixed(2), 7)}`
    + ` ${pad(fit.meanTensionPct.toFixed(2), 8)} ${pad(fit.tightSpots, 6)}  ${fit.verdict}`);
}
