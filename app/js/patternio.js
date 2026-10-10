// Saving a pattern, loading it back, sewing it up and seeing how it sits on a
// body -- which may not be the body it was drafted for.
//
// That last part is the point. Sewing a pattern back onto the body it came from
// only proves the round trip. Sewing it onto a DIFFERENT body -- a size chart's
// idea of you, or you six months later, or you with one shoulder lower -- is a
// fit test, and it is what a commercial pattern never tells you.
//
// The format keeps, for every 2D point, the id of the 3D vertex it was unfolded
// from. Points sharing that id are the ones that get sewn to each other, so the
// seam correspondence is exact and needs no matching heuristics.

import { sub, add, mul, dot, cross, norm, len, dist, clamp } from './geom.js';
import { Assembly } from './assembly.js';

export const PATTERN_FORMAT = 'triangulated-bodice-pattern/1';

// -------------------------------------------------------------- export

export function exportPatternJSON(panels, meta = {}, asm = null) {
  const out = { format: PATTERN_FORMAT, units: 'cm', meta, panels: [] };
  for (const p of panels) {
    const ids = new Map();              // point object id -> index in this panel
    const pts = [];
    const put = (pt, v3) => {
      if (!ids.has(pt.id)) {
        ids.set(pt.id, pts.length);
        const rec = { x: +pt.x.toFixed(5), y: +pt.y.toFixed(5), v3 };
        // placement hint: where on the body this point was drafted to sit
        if (asm && asm.gridUV && asm.gridUV[v3]) {
          rec.uv = [+asm.gridUV[v3][0].toFixed(5), +asm.gridUV[v3][1].toFixed(5)];
        }
        pts.push(rec);
      }
      return ids.get(pt.id);
    };
    const tris = [];
    for (const t of p.flat.tiles) {
      const m = p.flat.pts.get(t);
      const vs = Object.keys(m).map(Number);
      if (vs.length < 3) continue;
      tris.push(vs.map((v3) => put(m[v3], v3)));
    }
    // the outline, as indices into pts, for cutting
    const loop = (p.flat.loops[0] || []).map((s) => ids.get(s.from.id))
      .filter((i) => i !== undefined);
    out.panels.push({
      name: p.name, pts, tris, loop,
      areaCm2: +p.areaCm2.toFixed(2),
      darts: p.darts.map((d) => ({ apex: d.apex, intakeDeg: +d.intakeDeg.toFixed(2) })),
    });
  }
  return annotateSeams(out);
}

/**
 * Work out which edge of which panel is sewn to which, and which end is up.
 *
 * Every point knows the 3D vertex it was unfolded from, so two panels share a
 * seam exactly where they share a consecutive run of those ids. No matching
 * heuristics, no tolerance, no guessing: the correspondence is combinatorial.
 *
 * Adds to each panel a list of `runs` along its outline, each classified as a
 * seam (with its partner panel and a seam id) or as a free edge at the top or
 * the bottom of the garment. Adds a `seams` table to the pattern.
 */
export function annotateSeams(pattern) {
  const owners = new Map();                   // v3 -> Set of panel indices
  pattern.panels.forEach((p, pi) => {
    for (const q of p.pts) {
      if (q.v3 === undefined || q.v3 === null) continue;
      if (!owners.has(q.v3)) owners.set(q.v3, new Set());
      owners.get(q.v3).add(pi);
    }
  });

  // which way is up? use the placement hints if the pattern has them
  const vOf = (p, i) => (p.pts[i].uv ? p.pts[i].uv[1] : null);

  const partnerOf = (p, i, j) => {
    const a = owners.get(p.pts[i].v3), b = owners.get(p.pts[j].v3);
    if (!a || !b) return null;
    for (const x of a) if (b.has(x) && x !== p.__index) return x;
    return null;
  };

  pattern.panels.forEach((p, pi) => { p.__index = pi; });

  // A seam is identified by the pair of panels AND by which of their edges it
  // is. Keying on the panel pair alone merges the two seams of a two-piece
  // garment -- front joined to back down both sides -- into one id, and prints
  // a pattern with "S01" on two different seams. The run's own vertex ids tell
  // them apart: both sides of one physical seam share the same ids, and the
  // other seam has different ones.
  const seamKey = (a, b, vs) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const ids = vs.filter((x) => x !== undefined && x !== null);
    const sig = ids.length ? `${Math.min(...ids)}-${Math.max(...ids)}` : 'x';
    return `${lo}:${hi}:${sig}`;
  };
  const seamIds = new Map();

  pattern.panels.forEach((p, pi) => {
    const loop = p.loop || [];
    const runs = [];
    let cur = null;
    for (let k = 0; k < loop.length; k++) {
      const i = loop[k], j = loop[(k + 1) % loop.length];
      const partner = partnerOf(p, i, j);
      if (!cur || cur.partner !== partner) {
        cur = { partner, pts: [i, j] };
        runs.push(cur);
      } else {
        cur.pts.push(j);
      }
    }
    // the first and last run may be the same run wrapped around the loop
    if (runs.length > 1 && runs[0].partner === runs[runs.length - 1].partner) {
      const last = runs.pop();
      runs[0].pts = last.pts.concat(runs[0].pts.slice(1));
    }
    for (const r of runs) {
      if (r.partner === null) {
        // Top or bottom is decided against the PANEL's own mean, not against
        // v = 0.5. A bodice panel straddles the middle of the body so the
        // absolute test happens to work; a skirt panel lives entirely below
        // the waist, where every v is under 0.5, and the absolute test called
        // its waist edge the bottom.
        const vs = r.pts.map((i) => vOf(p, i)).filter((x) => x !== null);
        const allV = p.pts.map((q) => (q.uv ? q.uv[1] : null)).filter((x) => x !== null);
        const mean = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
        const allMeanV = allV.length ? allV.reduce((a, b) => a + b, 0) / allV.length : null;
        const ys = r.pts.map((i) => p.pts[i].y);
        const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
        const allMeanY = p.pts.reduce((a, q) => a + q.y, 0) / p.pts.length;
        r.kind = (mean !== null && allMeanV !== null ? mean > allMeanV : meanY > allMeanY)
          ? 'top' : 'bottom';
      } else {
        r.kind = 'seam';
        const key = seamKey(pi, r.partner, r.pts.map((i) => p.pts[i].v3));
        if (!seamIds.has(key)) seamIds.set(key, `S${String(seamIds.size + 1).padStart(2, '0')}`);
        r.seam = seamIds.get(key);
        r.partnerName = pattern.panels[r.partner].name;
        r.v3 = r.pts.map((i) => p.pts[i].v3);
      }
      let L = 0;
      for (let k = 1; k < r.pts.length; k++) {
        const a = p.pts[r.pts[k - 1]], b = p.pts[r.pts[k]];
        L += Math.hypot(b.x - a.x, b.y - a.y);
      }
      r.lengthCm = +L.toFixed(2);
    }
    p.runs = runs;
  });

  pattern.seams = [...seamIds.entries()].map(([key, id]) => {
    const [a, b] = key.split(':').map(Number);
    const ra = pattern.panels[a].runs.find((r) => r.seam === id);
    return {
      id,
      a: pattern.panels[a].name,
      b: pattern.panels[b].name,
      lengthCm: ra ? ra.lengthCm : null,
    };
  }).sort((x, y) => x.id.localeCompare(y.id));

  pattern.panels.forEach((p) => { delete p.__index; });
  return pattern;
}

export function importPatternJSON(data) {
  const d = typeof data === 'string' ? JSON.parse(data) : data;
  if (d.format !== PATTERN_FORMAT) {
    throw new Error(`not a bodice pattern file (format: ${d.format || 'missing'})`);
  }
  if (!d.seams) annotateSeams(d);
  return d;
}

// -------------------------------------------------------------- sewing

/**
 * Sew the panels into one closed garment mesh.
 *
 * Every 2D point carries the id of the 3D vertex it was unfolded from, so the
 * points that must be stitched together are exactly those sharing an id. They
 * are welded into one vertex, and each triangle keeps the side lengths it has
 * ON THE PATTERN -- because that is what the cut fabric will actually hold it
 * to, whatever body you then put it on.
 *
 * The garment is positioned by wrapping each panel around a cylinder sized to
 * the body, which is just "offering the pieces up" before the fitting.
 */
export function sew(pattern, surface, { ease = 1.0, place = 'body' } = {}) {
  const asm = new Assembly({ u: 1, weldTol: 1e-9 });
  const vertOf = new Map();            // v3 id -> assembly vertex index
  const seamCount = new Map();

  const yAll = pattern.panels.flatMap((p) => p.pts.map((q) => q.y));
  const yMin = Math.min(...yAll), yMax = Math.max(...yAll);
  const yMid = (yMin + yMax) / 2;
  const vLo = pattern.meta && pattern.meta.vLo !== undefined ? pattern.meta.vLo : 0.05;
  const vHi = pattern.meta && pattern.meta.vHi !== undefined ? pattern.meta.vHi : 0.95;

  // Fallback placement: a plain cylinder sized to the body.
  let R = 20;
  if (place === 'cylinder') {
    let g = 0;
    for (let k = 0; k <= 10; k++) g += surface.girthAt(k / 10);
    R = (g / 11) / (2 * Math.PI) + ease;
  }
  const totalW = pattern.panels.reduce((a, p) => {
    const xs = p.pts.map((q) => q.x);
    return a + (Math.max(...xs) - Math.min(...xs));
  }, 0);

  const N = pattern.panels.length;
  let angle = 0;

  /**
   * Where on the body does each point of this panel belong?
   *
   * A gore's two long edges are its seams, and every one of its points lies on
   * one or the other -- a one-cell-wide strip has no interior points at all.
   * So split the outline at its highest and lowest points into a left chain and
   * a right chain, and send each chain to the seam it came from, spacing the
   * points along it by arc length.
   *
   * The obvious shortcut -- treat the x coordinate within the panel's bounding
   * box as the across-gore fraction -- does not work, because a gore is 10 cm
   * wide at the waist and 15 cm at the hip, so its left seam wanders across the
   * box. That mistake started the garment 15% stretched and no amount of
   * relaxation got it back out, a triangulated shell being nearly rigid.
   */
  const chainsOf = (p) => {
    const loop = p.loop;
    if (!loop || loop.length < 4) return null;
    let iTop = 0, iBot = 0;
    loop.forEach((pi2, k) => {
      if (p.pts[pi2].y > p.pts[loop[iTop]].y) iTop = k;
      if (p.pts[pi2].y < p.pts[loop[iBot]].y) iBot = k;
    });
    const take = (from, to) => {
      const out = [];
      for (let k = from; ; k = (k + 1) % loop.length) {
        out.push(loop[k]);
        if (k === to) break;
        if (out.length > loop.length) break;
      }
      return out;
    };
    const A = take(iBot, iTop), B = take(iTop, iBot);
    if (A.length < 2 || B.length < 2) return null;
    const meanX = (c) => c.reduce((a, i) => a + p.pts[i].x, 0) / c.length;
    return meanX(A) <= meanX(B) ? { left: A, right: B.slice().reverse() }
                                : { left: B.slice().reverse(), right: A };
  };

  // Arc-length tables. A gore's unfolded length is the distance ALONG the body,
  // which is longer than the straight span between its end heights, and its
  // unfolded width is the girth it covers, which varies with height. Mapping
  // the panel's 2D coordinates linearly onto (u,v) therefore lands every point
  // in the wrong place and starts the garment badly stretched -- 15% in the
  // first version of this. These tables invert arc length instead.
  const NV = 96;
  const vArc = [0];
  for (let k = 1; k <= NV; k++) {
    const v0 = vLo + (vHi - vLo) * (k - 1) / NV;
    const v1 = vLo + (vHi - vLo) * k / NV;
    vArc.push(vArc[k - 1] + dist(surface.point(0, v0), surface.point(0, v1)));
  }
  const vTotal = vArc[NV];
  const vAt = (frac) => {
    const target = frac * vTotal;
    let k = 1;
    while (k < NV && vArc[k] < target) k++;
    const t = (target - vArc[k - 1]) / ((vArc[k] - vArc[k - 1]) || 1);
    return vLo + (vHi - vLo) * ((k - 1) + t) / NV;
  };
  pattern.panels.forEach((p, pi) => {
    const xs = p.pts.map((q) => q.x);
    const x0 = Math.min(...xs), w = Math.max(...xs) - x0 || 1;
    const span = (w / totalW) * 2 * Math.PI;
    const local = [];
    // arc-length position along each seam chain, and which chain each point is on
    const ch = place === 'body' ? chainsOf(p) : null;
    const where = new Map();
    if (ch) {
      for (const [side, chain] of [[0, ch.left], [1, ch.right]]) {
        let L = 0;
        const cum = [0];
        for (let k = 1; k < chain.length; k++) {
          const a = p.pts[chain[k - 1]], b = p.pts[chain[k]];
          L += Math.hypot(b.x - a.x, b.y - a.y);
          cum.push(L);
        }
        chain.forEach((pi2, k) => {
          if (!where.has(pi2)) where.set(pi2, { side, t: L > 0 ? cum[k] / L : 0 });
        });
      }
    }
    for (let qi = 0; qi < p.pts.length; qi++) {
      const q = p.pts[qi];
      const hint = where.get(qi);
      const frac = hint ? hint.side : (q.x - x0) / w;
      const yFrac = hint ? hint.t : (q.y - yMin) / ((yMax - yMin) || 1);
      let pos;
      if (place === 'body' && q.uv) {
        // the pattern says where this point belongs; offer it up there
        const c = surface.closestOnOffset(surface.point(q.uv[0], q.uv[1]), ease);
        pos = [c.point[0], c.point[1], c.point[2]];
      } else if (place === 'body') {
        // Offer each piece up to the place on the body it was drafted for.
        // A fitter does exactly this before pinning anything; starting from a
        // bare cylinder instead leaves the mesh jammed in a stretched state it
        // cannot relax out of, because a triangulated shell is nearly rigid.
        const u = ((pi + frac) / N) % 1;
        const v = vAt(yFrac);
        const c = surface.closestOnOffset(surface.point(u, v), ease);
        pos = [c.point[0], c.point[1], c.point[2]];
      } else {
        const a = angle + frac * span;
        pos = [-Math.sin(a) * R, q.y - yMid, Math.cos(a) * R];
      }
      const hasId = q.v3 !== undefined && q.v3 !== null;
      if (hasId && vertOf.has(q.v3)) {
        seamCount.set(q.v3, seamCount.get(q.v3) + 1);
        local.push(vertOf.get(q.v3));
        continue;
      }
      asm.verts.push(pos);
      asm.pinned.push(false);
      const idx = asm.verts.length - 1;
      if (hasId) { vertOf.set(q.v3, idx); seamCount.set(q.v3, 1); }
      local.push(idx);
    }
    for (const t of p.tris) {
      const A = p.pts[t[0]], B = p.pts[t[1]], C = p.pts[t[2]];
      // side i is opposite vertex i, measured ON THE PATTERN -- this is what
      // the cut fabric holds the garment to, whatever body it is put on
      const sides = [
        Math.hypot(B.x - C.x, B.y - C.y),
        Math.hypot(C.x - A.x, C.y - A.y),
        Math.hypot(A.x - B.x, A.y - B.y),
      ];
      const v = [local[t[0]], local[t[1]], local[t[2]]];
      if (new Set(v).size < 3) continue;
      asm.addRawTile(v, sides, p.name);
    }
    angle += span;
  });

  asm.meta = { sewn: true, panels: N, place };
  asm.seams = [...seamCount.entries()].filter(([, n]) => n > 1).map(([v3]) => vertOf.get(v3));
  return asm;
}

// -------------------------------------------------------------- draping

/**
 * Settle a sewn garment onto a body. No attraction to the surface: the garment
 * is held only by its own seam lengths, pushed outward by the body it cannot
 * pass through, and pulled down by gravity. Where the pattern is too small it
 * will stretch; where it is too big it will stand away.
 */
export function drape(asm, surface, {
  iters = 140, gravity = 0.005, edgePasses = 4, edgeStiffness = 0.7,
  push = 1.0, ease = 0, settleIters = 120, supportTopCm = 2.0,
  // Face clearance is OFF by default here, unlike in relax.js.
  // Lifting a whole tile out whenever one of its interior samples dips below
  // the surface fights the edge constraints, and the equilibrium they settle
  // into is an inflated, stretched garment: it took a perfectly fitting shell
  // from 0% to 31% peak strain, and to 207% when the offset it was clearing
  // was the same one the garment was drafted to sit on. It earns its keep on
  // the coarse tiled shell, where a 10 cm tile sags over a centimetre, but a
  // pattern mesh has ~1 cm triangles whose sag is under half a millimetre, so
  // vertex-level collision is enough.
  faceClearance = 0, faceDeadbandCm = 0.05,
} = {}) {
  const V = asm.verts;
  // A bodice hangs from the shoulders. Without that support gravity simply
  // drags the whole garment down the body until it jams on the hips, which
  // stretches every seam and swamps the fit signal you were looking for.
  if (supportTopCm > 0) {
    const yMax = Math.max(...asm.verts.map((p) => p[1]));
    asm.verts.forEach((p, i) => { if (p[1] > yMax - supportTopCm) asm.pinned[i] = true; });
  }
  const edges = [...asm.edges.values()];
  const BARY = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];

  // Phase 1: let the seams find their own lengths, symmetrically and stiffly,
  // with no gravity. This is the garment taking the shape its pattern dictates.
  // Without it the mesh stays jammed in whatever strain the initial placement
  // left behind, because a triangulated shell is nearly rigid and cannot work
  // its way out one-sidedly.
  for (let it = 0; it < settleIters; it++) {
    for (let pass = 0; pass < edgePasses; pass++) {
      for (const e of edges) {
        const a = V[e.a], b = V[e.b];
        const d = sub(b, a), L = len(d);
        if (L < 1e-9) continue;
        const corr = ((L - e.target) / L) * 0.5;
        const wa = asm.pinned[e.a] ? 0 : (asm.pinned[e.b] ? 2 : 1);
        const wb = asm.pinned[e.b] ? 0 : (asm.pinned[e.a] ? 2 : 1);
        for (let m = 0; m < 3; m++) { a[m] += d[m] * corr * wa; b[m] -= d[m] * corr * wb; }
      }
    }
    for (let i = 0; i < V.length; i++) {
      if (asm.pinned[i]) continue;
      const c = surface.closestOnOffset(V[i], ease);
      if (c.signed < 0) {
        const s = -c.signed;
        V[i][0] += c.normal[0] * s; V[i][1] += c.normal[1] * s; V[i][2] += c.normal[2] * s;
      }
    }
  }

  for (let it = 0; it < iters; it++) {
    if (gravity) for (let i = 0; i < V.length; i++) if (!asm.pinned[i]) V[i][1] -= gravity;

    for (let pass = 0; pass < edgePasses; pass++) {
      for (const e of edges) {
        const a = V[e.a], b = V[e.b];
        const d = sub(b, a), L = len(d);
        if (L < 1e-9) continue;
        // seams resist stretching much more than they resist going slack;
        // fabric buckles rather than compressing, so the pull-in is softened
        const over = L > e.target;
        const k = edgeStiffness * (over ? 1.0 : 0.45);
        const corr = ((L - e.target) / L) * 0.5 * k;
        const wa = asm.pinned[e.a] ? 0 : (asm.pinned[e.b] ? 2 : 1);
        const wb = asm.pinned[e.b] ? 0 : (asm.pinned[e.a] ? 2 : 1);
        for (let m = 0; m < 3; m++) { a[m] += d[m] * corr * wa; b[m] -= d[m] * corr * wb; }
      }
    }

    if (faceClearance > 0) {
      for (const tl of asm.tiles) {
        const [i, j, k] = tl.v;
        let worst = 0, wn = null;
        for (const bc of BARY) {
          const p = [0, 1, 2].map((m) => V[i][m] * bc[0] + V[j][m] * bc[1] + V[k][m] * bc[2]);
          const c = surface.closestOnOffset(p, ease);
          if (c.signed < worst) { worst = c.signed; wn = c.normal; }
        }
        if (worst < -faceDeadbandCm && wn) {
          const s = (-worst - faceDeadbandCm) * faceClearance;
          for (const vi of [i, j, k]) {
            if (asm.pinned[vi]) continue;
            V[vi][0] += wn[0] * s; V[vi][1] += wn[1] * s; V[vi][2] += wn[2] * s;
          }
        }
      }
    }

    if (push > 0) {
      for (let i = 0; i < V.length; i++) {
        if (asm.pinned[i]) continue;
        const c = surface.closestOnOffset(V[i], ease);
        if (c.signed < 0) {
          const s = -c.signed * push;
          V[i][0] += c.normal[0] * s; V[i][1] += c.normal[1] * s; V[i][2] += c.normal[2] * s;
        }
      }
    }
  }
  return fitReport(asm, surface);
}

/**
 * How does it fit?
 *
 * `tension` is the fraction of seam length being stretched beyond what was cut:
 * the garment is too small there. `gap` is how far the cloth stands off the
 * body: too big there. Both are what you would read off a toile with a tape
 * measure and a pin.
 */
export function fitReport(asm, surface) {
  const strains = asm.edgeStrains();
  const stretched = strains.filter((s) => s.strain > 0.02);
  const gaps = asm.verts.map((p) => surface.closestPoint(p).signed);
  const sorted = [...gaps].sort((a, b) => a - b);
  const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const tension = strains.map((s) => Math.max(0, s.strain));
  return {
    vertices: asm.verts.length,
    seams: strains.length,
    meanGapCm: gaps.reduce((a, b) => a + b, 0) / gaps.length,
    minGapCm: sorted[0],
    p10GapCm: q(0.1),
    medianGapCm: q(0.5),
    p90GapCm: q(0.9),
    maxGapCm: sorted[sorted.length - 1],
    seamsStretchedPct: 100 * stretched.length / strains.length,
    meanTensionPct: 100 * tension.reduce((a, b) => a + b, 0) / tension.length,
    maxTensionPct: 100 * Math.max(0, ...tension),
    tightSpots: strains.filter((s) => s.strain > 0.08).length,
    verdict: verdict(sorted, tension),
  };
}

// Thresholds calibrated against the baseline: sewn onto the body it was drafted
// for, with a realistic hang, the pattern reads 0.24% mean tension and a median
// gap equal to the ease it was drafted with. Anything much past that is the
// pattern disagreeing with the body, not solver noise.
function verdict(sortedGaps, tension) {
  const med = sortedGaps[Math.floor(sortedGaps.length / 2)];
  const maxT = Math.max(0, ...tension) * 100;
  const meanT = tension.reduce((a, b) => a + b, 0) / tension.length * 100;
  if (meanT > 2.5 || maxT > 20) return 'TOO SMALL - straining badly';
  if (meanT > 1.0 || maxT > 10) return 'tight - pulls in places';
  if (med > 4.0) return 'TOO LOOSE - stands off the body';
  if (med > 2.5) return 'loose but wearable';
  if (med < 0.15) return 'very close fitting';
  return 'good fit';
}

/** Per-vertex fit, for colouring the garment in the viewer. */
export function fitField(asm, surface) {
  const gap = asm.verts.map((p) => surface.closestPoint(p).signed);
  const tension = new Array(asm.verts.length).fill(0);
  for (const s of asm.edgeStrains()) {
    const t = Math.max(0, s.strain);
    tension[s.e.a] = Math.max(tension[s.e.a], t);
    tension[s.e.b] = Math.max(tension[s.e.b], t);
  }
  return { gap, tension };
}

// ------------------------------------------------- sewing up, laid out flat

/**
 * Sew a pattern and hold it in a horizontal plane, unmoved from the shape it
 * was cut as. The pattern's own (x, y) become world (x, z); the plane's height
 * and centre are given.
 *
 * This is the other half of `sew()`. `sew()` offers each piece up to the place
 * on the body it was drafted for, which is what a fitter does and what a fit
 * test needs. `sewFlat()` does the opposite: it refuses to place the cloth at
 * all, and lets gravity and contact decide where the garment ends up. Nothing
 * is pinned and nothing is attracted to anything, so the only reason the cloth
 * stays up is that the body is in the way -- which is the honest version of the
 * question "will this hang on a shoulder or slide off it?".
 *
 * Multi-panel patterns work unchanged: points sharing a `v3` id are welded, so
 * the panels arrive as ONE mesh whose seams are ordinary interior edges. The
 * flat layout of a multi-panel pattern is of course not the garment -- it is
 * the pieces lying on the table, joined -- so for anything but a single-piece
 * test you normally want `sew()` and then the simulation. Both produce the same
 * kind of Assembly, and cloth.js does not know which it was given.
 */
export function sewFlat(pattern, { y = 0, center = [0, 0], scale = 1 } = {}) {
  const asm = new Assembly({ u: 1, weldTol: 1e-9 });
  const vertOf = new Map();
  const seamCount = new Map();

  for (const p of pattern.panels) {
    const local = [];
    for (const q of p.pts) {
      const hasId = q.v3 !== undefined && q.v3 !== null;
      if (hasId && vertOf.has(q.v3)) {
        seamCount.set(q.v3, seamCount.get(q.v3) + 1);
        local.push(vertOf.get(q.v3));
        continue;
      }
      asm.verts.push([center[0] + q.x * scale, y, center[1] + q.y * scale]);
      asm.pinned.push(false);
      const idx = asm.verts.length - 1;
      if (hasId) { vertOf.set(q.v3, idx); seamCount.set(q.v3, 1); }
      local.push(idx);
    }
    for (const t of p.tris) {
      const A = p.pts[t[0]], B = p.pts[t[1]], C = p.pts[t[2]];
      // side i is opposite vertex i, measured ON THE PATTERN: this is the
      // length the cut cloth holds, and the only thing resisting gravity
      const sides = [
        Math.hypot(B.x - C.x, B.y - C.y) * scale,
        Math.hypot(C.x - A.x, C.y - A.y) * scale,
        Math.hypot(A.x - B.x, A.y - B.y) * scale,
      ];
      const v = [local[t[0]], local[t[1]], local[t[2]]];
      if (new Set(v).size < 3) continue;
      asm.addRawTile(v, sides, p.name);
    }
  }
  asm.meta = { sewn: true, flat: true, panels: pattern.panels.length };
  asm.seams = [...seamCount.entries()].filter(([, n]) => n > 1).map(([v3]) => vertOf.get(v3));
  return asm;
}
