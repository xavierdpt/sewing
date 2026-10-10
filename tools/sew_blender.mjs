// Arrange, then let Blender sew and drape -- in the two phases this project
// has already established are necessary.
//   node tools/sew_blender.mjs
//
// docs/13-assembly.md and the head of assemble.js both say why the phases are
// separate, with measurements: cut pieces have to be allowed to pass through
// each other while they are still cut pieces, and a garment sewn while it is
// also falling fills with strain it can never work back out. Those are
// properties of the PROBLEM, not of this project's solver, so they apply to
// Blender too.
import { Body } from '../app/js/body.js';
import { Cloth } from '../app/js/cloth.js';
import { flaredSkirtPattern, waistRing, hemProfile } from '../app/js/skirt.js';
import { layOut, weldStitched } from '../app/js/assemble.js';
import { floorOf } from '../app/js/droptest.js';
import { drapeWithBlender, available } from '../sim/drape.mjs';

if (!available()) { console.error('blender not on PATH'); process.exit(1); }

const b = new Body();
b.includeArms = true; b.includeLegs = true;
const waistV = b.landmarkV('waist');
const ring = waistRing(b, { waistV, ease: 1.0 });
const pattern = flaredSkirtPattern({
  panels: 4, waistCm: ring.circumferenceCm, hemCm: 160, lengthCm: 55,
  gather: 1.0, edge: 3.0, waistV,
});

const laid = layOut(pattern, b, { standoffCm: 6 });
const gapOf = (verts, st) => {
  const p = verts[st.a], q = verts[st.b];
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
};
const gap0 = Math.max(...laid.stitches.map((st) => gapOf(laid.asm.verts, st)));
console.log(`${pattern.panels.length} pieces arranged (rigid, no physics),`
  + ` ${laid.stitches.length} seams, widest ${gap0.toFixed(1)} cm open\n`);

const waistIds = new Set();
for (const p of pattern.panels) {
  for (const r of p.runs || []) {
    if (r.kind !== 'top') continue;
    for (const i of r.pts) if (laid.v3Of.has(p.pts[i].v3)) waistIds.add(laid.v3Of.get(p.pts[i].v3));
  }
}

// ---- phase 1: SEW. gravity off, self-collision off, body collision on.
const sewn = drapeWithBlender(laid.asm, b, {
  fabric: 'cotton poplin', seconds: 6, pinned: [...waistIds],
  sewEdges: laid.stitches.map((st) => [st.a, st.b]),
  sewingForceMax: 0,
  gravity: false,          // a garment sewn while falling fills with strain
  selfCollision: false,    // cut pieces may pass through each other
});
const gaps = laid.stitches.map((st) => gapOf(sewn.verts, st));
console.log(`phase 1, sewing (${sewn.seconds}s): widest gap`
  + ` ${Math.max(...gaps).toFixed(3)} cm, ${gaps.filter((g) => g < 0.25).length}`
  + `/${gaps.length} closed`);

// ---- weld what closed, with the project's own welder
sewn.verts.forEach((p, i) => { laid.asm.verts[i] = p; });
const w = weldStitched(laid.asm, laid.stitches, { closedCm: 0.25 });
const weldedWaist = [...waistIds].map((i) => w.map[i]);
console.log(`welded ${w.weldedPct} %, ${w.asm.verts.length} vertices`);

// ---- phase 2: DROP. gravity on, self-collision on.
const dropped = drapeWithBlender(w.asm, b, {
  fabric: 'cotton poplin', seconds: 6, pinned: weldedWaist,
  gravity: true, selfCollision: true,
});
dropped.verts.forEach((p, i) => { w.asm.verts[i] = p; });
const probe = new Cloth(w.asm, b, { fabric: 'cotton poplin', floorY: floorOf(b) });
const pen = probe.penetration();
const hem = hemProfile(w.asm);
console.log(`phase 2, drape  (${dropped.seconds}s): inside the body v/e/f =`
  + ` ${pen.vertexCm}/${pen.edgeCm}/${pen.faceCm} cm, ${pen.insideSamples} samples`);
console.log(`                 hem ${hem.hemLengthCm} cm (cut 160), ${hem.folds} folds,`
  + ` depth ${hem.foldDepthCm} cm`);
