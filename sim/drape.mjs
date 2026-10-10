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
import { buildJob, bodyMesh, clothSettings, assemblyAreaCm2 } from '../app/js/drapejob.js';

export { bodyMesh, clothSettings, assemblyAreaCm2 };

const HERE = dirname(fileURLToPath(import.meta.url));

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
  // Seams to close, as pairs of vertex indices. Given these, Blender sews the
  // pieces together and drapes the result in one solve -- no separate
  // stitching phase, and the sewing happens behind the same collision that
  // the drape does.
  sewEdges = null, sewingForceMax = 0,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'drape-'));
  const jobPath = join(dir, 'job.json');
  const outPath = join(dir, 'out.json');

  const job = buildJob(asm, surface, {
    fabric, seconds, fps, pinned, bodyThicknessCm, clothThicknessCm,
    selfCollision, gravity, quality, collisionQuality, nu, nv,
    sewEdges, sewingForceMax,
  });
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
