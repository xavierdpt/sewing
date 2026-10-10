// Hand the garment to the drape side-car and get it back settled.
//
// The viewer's own solver resolves contact as a point query per vertex, so it
// holds the cloth off the body AT ITS VERTICES and nowhere else: a triangle
// spanning a convex bulge dips below it, and the dress form shows through.
// Measured on a four-panel skirt, the same garment draped both ways -- this
// project 0.47 cm through the body at 130 sample points, the side-car 0 cm at
// none. So the local drape is a preview and this is the answer.
//
// Start the side-car with:  python3 sim/server.py

import { buildJob } from './drapejob.js';

export const DEFAULT_URL = 'http://127.0.0.1:8778';

/** Is the side-car up, and what can it run? */
export async function health(url = DEFAULT_URL, timeoutMs = 2000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${url}/health`, { signal: ac.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

/**
 * Drape `asm` on `surface` remotely. Returns the settled vertices in the SAME
 * order, so they drop straight back into the Assembly.
 */
export async function drapeRemote(asm, surface, opts = {}) {
  const { url = DEFAULT_URL, ...rest } = opts;   // `session` rides along in rest
  const job = buildJob(asm, surface, rest);
  const r = await fetch(`${url}/drape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  });
  const out = await r.json();
  if (!r.ok) throw new Error(out.error || `side-car returned ${r.status}`);
  if (!out.verts || out.verts.length !== asm.verts.length) {
    throw new Error(`side-car returned ${out.verts ? out.verts.length : 0} vertices,`
      + ` expected ${asm.verts.length}`);
  }
  return out;
}
