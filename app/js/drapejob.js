// Building a drape job: pure geometry and unit conversion, no I/O.
//
// It lives in app/js, with the other three.js-free geometry modules, for two
// reasons: the browser has to be able to fetch it (the viewer is served from
// app/), and this project's standing rule is that every geometry module runs
// under plain node so the headless checks exercise the same code the viewer
// does.
//
// Shared deliberately. The node driver (sim/drape.mjs) and the browser client
// (app/js/remote.js) must agree exactly about what a job IS -- the body mesh,
// the units, how a fabric preset becomes solver settings -- or a drape
// triggered from the viewer and the same drape run headlessly would quietly
// differ, and the headless checks would stop being checks of the thing the
// viewer does. So it is written once, here, and imported by both.

import { FABRICS } from './cloth.js';

/** The body as a plain indexed triangle mesh, in cm. */
export function bodyMesh(surface, { nu = 96, nv = 64 } = {}) {
  const verts = [];
  const index = new Map();
  const id = (p) => {
    const k = `${p[0].toFixed(4)},${p[1].toFixed(4)},${p[2].toFixed(4)}`;
    if (!index.has(k)) { index.set(k, verts.length); verts.push([p[0], p[1], p[2]]); }
    return index.get(k);
  };
  const tris = [];
  const ring = (v) => Array.from({ length: nu }, (_, i) => surface.point(i / nu, v));
  let prev = ring(0);
  for (let j = 1; j <= nv; j++) {
    const cur = ring(j / nv);
    for (let i = 0; i < nu; i++) {
      const i2 = (i + 1) % nu;
      tris.push([id(prev[i]), id(cur[i]), id(cur[i2])]);
      tris.push([id(prev[i]), id(cur[i2]), id(prev[i2])]);
    }
    prev = cur;
  }
  return { verts, tris };
}

/**
 * Blender cloth settings from one of this project's fabric presets.
 *
 * These are NOT a conversion, and saying so matters. XPBD compliance is an
 * inverse stiffness with units; Blender's stiffnesses are dimensionless spring
 * constants its own solver interprets. What IS carried across exactly is the
 * part that is physical -- areal density, and therefore the weight of the
 * garment, which is the one number both solvers must agree on.
 */
export function clothSettings(fabric, areaCm2, vertexCount, {
  clothThicknessCm = 0.35, selfCollision = true, quality = 14,
  collisionQuality = 12, sewingForceMax = 0,
} = {}) {
  const f = FABRICS[fabric] || FABRICS['cotton poplin'];
  const totalKg = (areaCm2 / 10000) * (f.gsm / 1000);
  const stiff = (alpha, lo, hi) => {
    const t = Math.min(1, Math.max(0, Math.log10(alpha / 1e-7) / 2.5));
    return hi + (lo - hi) * t;
  };
  return {
    vertexMassKg: totalKg / Math.max(1, vertexCount),
    tension: stiff(f.stretch, 2, 40),
    compression: stiff(f.stretch, 2, 40),
    shear: stiff(f.stretch, 1, 20),
    bending: Math.max(0.05, 0.5 * (f.bend / 4e-3)),
    damping: 5 * (f.damp ?? 0.75) / 0.75,
    airDamping: 1.0,
    clothThicknessCm,
    selfCollision,
    quality,
    collisionQuality,
    sewingForceMax,
    gsm: f.gsm,
    totalKg: +totalKg.toFixed(4),
  };
}

/** The area of an Assembly's triangles, from their cut side lengths, cm^2. */
export function assemblyAreaCm2(asm) {
  return asm.tiles.reduce((a, t) => {
    const [x, y, z] = t.sides;
    const s = (x + y + z) / 2;
    return a + Math.sqrt(Math.max(0, s * (s - x) * (s - y) * (s - z)));
  }, 0);
}

/** Everything a solver needs, as plain JSON. */
export function buildJob(asm, surface, {
  fabric = 'cotton poplin', seconds = 6, fps = 30, pinned = null,
  bodyThicknessCm = 0.35, clothThicknessCm = 0.35, selfCollision = true,
  gravity = true, quality = 14, collisionQuality = 12,
  nu = 96, nv = 64, sewEdges = null, sewingForceMax = 0, backend = 'blender',
  // so the server's log line for this drape joins up with the viewer's
  session = null,
} = {}) {
  return {
    backend,
    session,
    fps,
    frames: Math.max(1, Math.round(seconds * fps)),
    gravity,
    bodyThicknessCm,
    body: bodyMesh(surface, { nu, nv }),
    garment: { verts: asm.verts, tris: asm.tiles.map((t) => t.v) },
    pinned: pinned || asm.pinned.map((p, i) => (p ? i : -1)).filter((i) => i >= 0),
    sewEdges: sewEdges || [],
    cloth: clothSettings(fabric, assemblyAreaCm2(asm), asm.verts.length,
      { clothThicknessCm, selfCollision, quality, collisionQuality, sewingForceMax }),
  };
}
