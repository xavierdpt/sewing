// The real garment, the real body, no Blender: what does it cost and does it
// stay out of the body?
//
// Same pipeline as tools/check_sidecar.mjs up to the weld -- pattern, layout,
// sewing with the project's own feed -- and then the drape goes to wasm
// instead of over the wire.
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { Body } from '../app/js/body.js';
import { Cloth } from '../app/js/cloth.js';
import { flaredSkirtPattern, waistRing } from '../app/js/skirt.js';
import { layOut, weldStitched } from '../app/js/assemble.js';
import { drapeWasm, setSewclothModule, fieldFor } from '../app/js/drapewasm.js';

const require = createRequire(import.meta.url);
const base = new URL('../src/sewcloth/build/', import.meta.url).pathname;
setSewclothModule(await require(base + 'sewcloth.cjs')({
  wasmBinary: readFileSync(base + 'sewcloth.wasm'),
}));

const b = new Body();
b.includeArms = true; b.includeLegs = true;
const waistV = b.landmarkV('waist');
const ring = waistRing(b, { waistV, ease: 1.0 });

for (const edge of [5.0, 3.0]) {
  const pattern = flaredSkirtPattern({
    panels: 4, waistCm: ring.circumferenceCm, hemCm: 160, lengthCm: 55,
    gather: 1.0, edge, waistV,
  });
  const laid = layOut(pattern, b, { standoffCm: 6 });
  const sew = new Cloth(laid.asm, b, {
    fabric: 'cotton poplin', gravityScale: 0, stitches: laid.stitches,
    selfCollision: false, substeps: 10, sewSpeedCmPerSec: 12,
  });
  sew.stitchStrength = 1; sew.startSewing();
  while (sew.isSewing()) sew.step(1 / 60);
  const w = weldStitched(laid.asm, sew.stitches, { velocities: sew.vel, closedCm: 0.25 });

  const waistIds = new Set();
  for (const p of pattern.panels) for (const r of p.runs || []) {
    if (r.kind !== 'top') continue;
    for (const i of r.pts) if (laid.v3Of.has(p.pts[i].v3)) waistIds.add(w.map[laid.v3Of.get(p.pts[i].v3)]);
  }

  const out = await drapeWasm(w.asm, b, {
    seconds: 4, fps: 30, pinned: [...waistIds],   // substeps: the default, 8
    fabric: { mass: 0.5, tension: 20000, damping: 0.995, thickness: 0.35, friction: 0.3 },
  });

  // Is any of it inside the body? Ask the same field the solver used.
  const sdf = fieldFor(b, { cell: 1.0 });
  let worst = Infinity, inside = 0;
  for (const v of out.verts) {
    const d = sdf.at(v);
    if (!Number.isFinite(d)) continue;
    worst = Math.min(worst, d);
    if (d < 0) inside++;
  }

  console.log(`edge ${edge} cm: ${out.verts.length} verts, ${w.asm.edges.size} edges`);
  console.log(`  ${out.msPerFrame.toFixed(2)} ms/frame  (${(1000 / out.msPerFrame).toFixed(1)} fps)` +
              `   ${out.frames} frames in ${out.ms.toFixed(0)} ms total`);
  console.log(`  contacts ${out.report.contacts}, deepest correction ` +
              `${out.report.deepestCm.toFixed(3)} cm, CG ${out.report.cgIterations} iterations`);
  console.log(`  closest vertex to the body surface ${worst.toFixed(3)} cm, ` +
              `${inside} vertices inside\n`);
}
