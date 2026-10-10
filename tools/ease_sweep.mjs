// How much wearing ease does a tiled shell actually need?
//
// Not a comfort question: a flat tile spanning a curved region sags about
// h^2/(8R) below the surface, so unless the ease exceeds that sag the tile
// faces cut into the body however well the corners fit.   node tools/ease_sweep.mjs
import { Body } from '../app/js/body.js';
import { buildGridShell, quantize } from '../app/js/lattice.js';
import { settle, faceClearanceReport, clearanceReport } from '../app/js/relax.js';

const torso = new Body();
const body_band = torso.band('bodice');
console.log(' ease  tiles  facesCuttingIn  deepest  minGap  meanGap  strain%');
for (const ease of [0.4, 0.8, 1.2, 1.6, 2.0, 2.5, 3.0]) {
  const sh = buildGridShell(torso, { u: 2, ...body_band, ease });
  const { asm } = settle(sh, torso, quantize, {
    rounds: 6,
    relaxOpts: { iters: 40, ease, attract: 0.4, tangentDrift: 1, edgePasses: 4 },
  });
  const fc = faceClearanceReport(asm, torso, 0);
  const cl = clearanceReport(asm, torso);
  const s = asm.stats(torso, ease);
  console.log(`${ease.toFixed(1).padStart(5)} ${String(s.tiles).padStart(6)}`
    + ` ${String(fc.tilesCuttingIn).padStart(15)} ${fc.deepestFaceCm.toFixed(2).padStart(8)}`
    + ` ${cl.minGapCm.toFixed(2).padStart(7)} ${cl.meanGapCm.toFixed(2).padStart(8)}`
    + ` ${(s.rmsStrain * 100).toFixed(1).padStart(8)}`);
}
