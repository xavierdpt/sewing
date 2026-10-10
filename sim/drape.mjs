// Drive Blender's cloth solver from node, on the same mesh and body the
// in-repo solver uses.
//
// docs/11-cloth.md names this as the right next step and says why: Blender's
// solver is C, it does triangle-against-triangle collision with a barycentric
// response rather than a point query per vertex, and it has edge-edge
// self-collision. This module is the plumbing -- mesh in, draped mesh out --
// and tools/drape_blender.mjs is the experiment that compares the two.

import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FABRICS } from '../app/js/cloth.js';

const HERE = dirname(fileURLToPath(import.meta.url));

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
 * These are NOT a conversion -- the two solvers do not share a parameterisation
 * and pretending otherwise would be the sort of false precision this project
 * avoids. XPBD compliance is an inverse stiffness with units; Blender's
 * stiffnesses are dimensionless spring constants its own solver interprets.
 * What IS carried across exactly is the part that is physical: areal density,
 * and therefore the weight of the garment.
 */
export function clothSettings(fabric, areaCm2, vertexCount, {
  clothThicknessCm = 0.2, selfCollision = true, quality = 10,
  collisionQuality = 5,
} = {}) {
  const f = FABRICS[fabric] || FABRICS['cotton poplin'];
  const totalKg = (areaCm2 / 10000) * (f.gsm / 1000);
  // stiffness scaled off the preset's compliance: softer cloth, softer springs
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
    gsm: f.gsm,
    totalKg: +totalKg.toFixed(4),
  };
}

/** Is Blender available to run jobs? */
export function available() {
  try {
    execFileSync('blender', ['--version'], { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

/**
 * Drape `asm` on `surface` with Blender, and return the settled vertices in
 * the SAME order, so the result drops straight back into the Assembly.
 */
export function drapeWithBlender(asm, surface, {
  // The defaults are the ones measured to leave NOTHING inside the body on a
  // four-panel skirt: 0/0/0 cm and zero penetrating samples, against 0.47 cm
  // and 130 samples for the in-repo solver on the same mesh. Thickness is what
  // does most of it -- 0.35 cm on each surface is 0.7 cm of separation, which
  // clears the half-centimetre of chord sag that the point-per-vertex solver
  // cannot see. It costs about a minute against four and a half seconds.
  fabric = 'cotton poplin', seconds = 6, fps = 30, pinned = null,
  bodyThicknessCm = 0.35, clothThicknessCm = 0.35, selfCollision = true,
  gravity = true, quality = 14, collisionQuality = 12,
  nu = 96, nv = 64, keep = false,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'drape-'));
  const jobPath = join(dir, 'job.json');
  const outPath = join(dir, 'out.json');

  const areaCm2 = asm.tiles.reduce((a, t) => {
    const [x, y, z] = t.sides;
    const s = (x + y + z) / 2;
    return a + Math.sqrt(Math.max(0, s * (s - x) * (s - y) * (s - z)));
  }, 0);

  const job = {
    fps,
    frames: Math.max(1, Math.round(seconds * fps)),
    gravity,
    bodyThicknessCm,
    body: bodyMesh(surface, { nu, nv }),
    garment: { verts: asm.verts, tris: asm.tiles.map((t) => t.v) },
    pinned: pinned || asm.pinned.map((p, i) => (p ? i : -1)).filter((i) => i >= 0),
    cloth: clothSettings(fabric, areaCm2, asm.verts.length,
      { clothThicknessCm, selfCollision, quality, collisionQuality }),
  };
  writeFileSync(jobPath, JSON.stringify(job));

  const t0 = Date.now();
  let log = '';
  try {
    log = execFileSync('blender', [
      '--background', '--factory-startup',
      '--python', join(HERE, 'blender_drape.py'),
      '--', jobPath, outPath,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
  } catch (e) {
    const msg = `${e.stdout || ''}\n${e.stderr || ''}`.trim();
    if (!keep) rmSync(dir, { recursive: true, force: true });
    throw new Error(`blender drape failed:\n${msg.slice(-3000)}`);
  }
  const res = JSON.parse(readFileSync(outPath, 'utf8'));
  if (!keep) rmSync(dir, { recursive: true, force: true });
  return {
    verts: res.verts,
    seconds: +((Date.now() - t0) / 1000).toFixed(1),
    frames: res.frames,
    settings: job.cloth,
    log,
  };
}
