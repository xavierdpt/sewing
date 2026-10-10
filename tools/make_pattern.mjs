// Build a fitted bodice pattern and write a printable SVG.
//
//   node tools/make_pattern.mjs [gores] [rows] [out.svg]
//
// Defaults: 8 gores, 36 rows, 1 cm seam allowance, 1 cm ease, parametric torso.
//
// Why gores: a panel flattens without self-overlap only if the total angle
// defect it encloses is near zero. A body is not developable, so a wide blobby
// panel is unflattenable however many darts you cut -- its curvature is spread
// over dozens of vertices, each too small to justify a dart, collectively
// fatal. A strip one cell wide has no interior vertices at all, so it flattens
// EXACTLY, with no darts. That is what a gore is.
import { writeFileSync, mkdirSync } from 'node:fs';
import { Body } from '../app/js/body.js';
import { buildGridShell } from '../app/js/lattice.js';
import { makePattern, bbox } from '../app/js/panels.js';
import { patternSVG } from '../app/js/patternsvg.js';
import { exportPatternJSON } from '../app/js/patternio.js';

const gores = Number(process.argv[2] || 8);
const rows = Number(process.argv[3] || 36);
const out = process.argv[4] || 'out/pattern.svg';
const ease = 1.0;

const torso = new Body();
const body_band = torso.band('bodice');
const BODY_WAIST_V = torso.landmarkV('waist');
const shell = buildGridShell(torso, { u: 1, cols: gores, rows, ...body_band, ease });
const st = shell.stats(torso, ease);
console.log(`body     : waist ${torso.M.waist} cm, bust ${torso.M.bust} cm, height ${torso.M.height} cm,`
  + ` surface ${(torso.surfaceArea() / 10000).toFixed(3)} m2`);
console.log(`shell    : ${gores} x ${rows} grid, ${st.tiles} triangles,`
  + ` mean |defect| ${st.meanAbsDefectDeg.toFixed(2)} deg, total ${st.totalDefectDeg.toFixed(0)} deg`);

mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
const { panels } = makePattern(shell, { mode: 'strips', stripWidth: 1, surface: torso });

console.log(`\n panel  tiles   area cm2   w@top  w@mid  w@bot   len   darts  unfold err  overlaps`);
for (const p of panels) {
  const b = bbox(p.poly);
  const h = b.y1 - b.y0;
  const widthAt = (frac) => {
    const y = b.y0 + h * frac;
    const xs = [];
    for (let i = 0; i < p.poly.length; i++) {
      const a = p.poly[i], c = p.poly[(i + 1) % p.poly.length];
      if ((a.y - y) * (c.y - y) <= 0 && a.y !== c.y) xs.push(a.x + (c.x - a.x) * (y - a.y) / (c.y - a.y));
    }
    return xs.length >= 2 ? Math.max(...xs) - Math.min(...xs) : 0;
  };
  console.log(`  ${p.name}  ${String(p.tileCount).padStart(5)} ${p.areaCm2.toFixed(0).padStart(10)}`
    + ` ${widthAt(0.1).toFixed(1).padStart(6)} ${widthAt(0.5).toFixed(1).padStart(6)}`
    + ` ${widthAt(0.9).toFixed(1).padStart(6)} ${h.toFixed(1).padStart(5)}`
    + ` ${String(p.darts.length).padStart(7)} ${p.maxEdgeErr.toExponential(1).padStart(11)}`
    + ` ${String(p.overlaps).padStart(9)}`);
}

const tot = panels.reduce((a, p) => a + p.areaCm2, 0);
const bodyA = torso.surfaceArea();
console.log(`\nflat area ${(tot / 10000).toFixed(3)} m2 vs body ${(bodyA / 10000).toFixed(3)} m2`
  + `  -> ${(100 * tot / bodyA).toFixed(1)}% of the body surface captured`);
console.log(`worst unfold error : ${Math.max(...panels.map((p) => p.maxEdgeErr)).toExponential(2)} cm`
  + `  (exact to machine precision -- every triangle is already flat)`);
console.log(`self-overlaps      : ${panels.reduce((a, p) => a + p.overlaps, 0)}`);
console.log(`total seam to sew  : ${(panels.reduce((a, p) => {
  let L = 0;
  for (let i = 0; i < p.poly.length; i++) {
    const a2 = p.poly[i], b2 = p.poly[(i + 1) % p.poly.length];
    L += Math.hypot(b2.x - a2.x, b2.y - a2.y);
  }
  return a + L;
}, 0) / 2 / 100).toFixed(1)} m`);

const pattern = exportPatternJSON(panels, {
  gores, rows, ease, ...body_band, waistV: BODY_WAIST_V,
}, shell);
console.log(`\nseams: ${pattern.seams.map((s2) => `${s2.id} ${s2.a}-${s2.b}`).join(', ')}`);
writeFileSync(out.replace(/\.svg$/, '.json'), JSON.stringify(pattern));
const { svg, layout } = patternSVG(pattern, {
  fabricWidthCm: 140, seamAllowanceCm: 1.0, showTiles: false,
  title: `Bodice, ${gores} gores, ${ease} cm ease`,
});
writeFileSync(out, svg);
console.log(`\nfabric needed : ${layout.widthCm} cm wide x ${layout.heightCm.toFixed(0)} cm`);
console.log(`wrote ${out} (${(svg.length / 1024).toFixed(0)} kB)`);
