// Module-size sweep: how fit quality, seam length and library quantisation
// error trade off against each other.   node tools/sweep.mjs
import { Body } from '../app/js/body.js';
import { buildGridShell, quantize } from '../app/js/lattice.js';
import { settle } from '../app/js/relax.js';
const torso = new Body();
const body_band = torso.band('bodice');
console.log('  u(cm)  tiles  seam(m)  strain%  fit(cm)  conflicts  meanDefect  area(m2)');
for (const u of [1.0, 1.5, 2.0, 2.5, 3.0, 4.0]) {
  const sh = buildGridShell(torso, { u, ...body_band, ease: 0.8 });
  const { asm } = settle(sh, torso, quantize, {
    rounds: 8,
    relaxOpts: { iters: 40, ease: 0.8, attract: 0.4, tangentDrift: 1, edgePasses: 4 },
  });
  const s = asm.stats(torso, 0.8);
  console.log(`  ${u.toFixed(1).padStart(5)}  ${String(s.tiles).padStart(5)}`
    + `  ${(s.seamLengthCm/100).toFixed(1).padStart(7)}`
    + `  ${(s.rmsStrain*100).toFixed(2).padStart(7)}`
    + `  ${s.rmsFitCm.toFixed(3).padStart(7)}`
    + `  ${String(s.conflictEdges).padStart(9)}`
    + `  ${s.meanAbsDefectDeg.toFixed(1).padStart(10)}`
    + `  ${(s.areaCm2/10000).toFixed(3).padStart(8)}`);
}
