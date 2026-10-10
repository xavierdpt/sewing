// SVG pattern output, true scale, 1 cm = 10 mm.
//
// Takes the pattern JSON, not the internal panel objects, so the JSON is the
// single persisted artifact and the SVG is purely a view of it. A pattern
// loaded from disk can therefore be re-exported, which was not true of the
// first version.
//
// Everything needed to sew it up is on the sheet: which way is up, which edge
// joins which, and matched balance marks along every seam.

import { offsetPoly, polyArea, bbox, nest } from './panels.js';

const CM = 10;                       // SVG user units are mm
const f = (n) => Math.round(n * 1000) / 1000;
const A4 = { w: 21.0, h: 29.7, margin: 1.0 };
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// SVG's y axis points DOWN, while the panels were aligned with +y meaning "up
// the body". Flip once, here, so that up on the page is up on the wearer --
// otherwise every panel prints upside down with its grainline arrow reversed,
// which is exactly the kind of mistake you only notice after cutting.
const flipY = (panel) => ({ ...panel, pts: panel.pts.map((q) => ({ ...q, y: -q.y })) });
const polyOf = (panel) => (panel.loop || []).map((i) => ({ x: panel.pts[i].x, y: panel.pts[i].y }));

export function patternSVG(pattern, {
  fabricWidthCm = 140, gapCm = 2.0, seamAllowanceCm = 1.0,
  title = null, pageGuides = true, showTiles = false,
} = {}) {
  const panels = pattern.panels.map(flipY).map((p) => ({ ...p, poly: polyOf(p) }));
  const layout = nest(panels, { fabricWidthCm, gapCm, seamAllowanceCm });
  const W = layout.widthCm;
  const H = Math.max(layout.heightCm, 30) + 10 + Math.ceil((pattern.seams || []).length / 3) * 1.1;
  const name = title || `Bodice, ${panels.length} panels`;

  // Balance marks: three per seam, chosen by the 3D vertex id so that both
  // sides of a seam are marked at exactly the same place. Matching by distance
  // along the edge would drift; matching by identity cannot.
  const marks = new Map();                       // seam id -> [v3, v3, v3]
  for (const p of pattern.panels) {
    for (const r of (p.runs || [])) {
      if (r.kind !== 'seam' || marks.has(r.seam) || !r.v3) continue;
      const n = r.v3.length;
      marks.set(r.seam, [0.25, 0.5, 0.75].map((t) => r.v3[Math.round(t * (n - 1))]));
    }
  }
  const waistV = pattern.meta && pattern.meta.waistV;

  const S = [];
  S.push('<?xml version="1.0" encoding="UTF-8"?>');
  S.push(`<svg xmlns="http://www.w3.org/2000/svg" version="1.1"`
    + ` width="${f(W * CM)}mm" height="${f(H * CM)}mm"`
    + ` viewBox="0 0 ${f(W * CM)} ${f(H * CM)}">`);
  S.push(`<title>${esc(name)}</title>`);
  S.push(`<style>
    .cut    { fill:none; stroke:#000; stroke-width:0.6; }
    .stitch { fill:none; stroke:#c0392b; stroke-width:0.4; stroke-dasharray:3 2; }
    .tile   { fill:none; stroke:#d8d8d8; stroke-width:0.12; }
    .grain  { fill:none; stroke:#2c6fbb; stroke-width:0.5; }
    .notch  { fill:none; stroke:#000; stroke-width:0.6; }
    .waist  { fill:none; stroke:#2c6fbb; stroke-width:0.4; stroke-dasharray:2 1.5; }
    .page   { fill:none; stroke:#b9d4ec; stroke-width:0.25; stroke-dasharray:6 4; }
    .cal    { fill:none; stroke:#000; stroke-width:0.5; }
    text    { font-family:monospace; fill:#000; }
    .big    { font-size:6px; font-weight:bold; }
    .lab    { font-size:3.4px; }
    .seam   { font-size:3.0px; fill:#8a3b2e; }
    .edge   { font-size:3.4px; font-weight:bold; letter-spacing:0.6px; }
    .small  { font-size:2.6px; fill:#555; }
  </style>`);
  S.push('<rect width="100%" height="100%" fill="#fff"/>');

  if (pageGuides) {
    const pw = A4.w - 2 * A4.margin, ph = A4.h - 2 * A4.margin;
    const cols = Math.ceil(W / pw), rows = Math.ceil(H / ph);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      S.push(`<rect class="page" x="${f(c * pw * CM)}" y="${f(r * ph * CM)}"`
        + ` width="${f(pw * CM)}" height="${f(ph * CM)}"/>`);
      S.push(`<text class="small" x="${f((c * pw + 0.3) * CM)}" y="${f((r * ph + 0.9) * CM)}">`
        + `${String.fromCharCode(65 + r)}${c + 1}</text>`);
    }
  }

  for (const it of layout.placed) {
    const p = it.p, dx = it.dx, dy = it.dy;
    const X = (i) => (p.pts[i].x + dx) * CM;
    const Y = (i) => (p.pts[i].y + dy) * CM;
    S.push(`<g id="${p.name}">`);

    if (showTiles) {
      for (const t of p.tris) {
        S.push(`<path class="tile" d="M${f(X(t[0]))},${f(Y(t[0]))}`
          + ` L${f(X(t[1]))},${f(Y(t[1]))} L${f(X(t[2]))},${f(Y(t[2]))} Z"/>`);
      }
    }

    const cutLine = offsetPoly(p.poly, seamAllowanceCm);
    const path = (poly) => poly.map((q, i) => `${i ? 'L' : 'M'}${f((q.x + dx) * CM)},${f((q.y + dy) * CM)}`).join(' ') + ' Z';
    S.push(`<path class="cut" d="${path(cutLine)}"/>`);
    S.push(`<path class="stitch" d="${path(p.poly)}"/>`);

    // ---- per-run annotation: which edge is this, and what joins to it
    for (const r of (p.runs || [])) {
      const mid = r.pts[Math.floor(r.pts.length / 2)];
      const a = r.pts[0], b = r.pts[r.pts.length - 1];
      const ang = Math.atan2(p.pts[b].y - p.pts[a].y, p.pts[b].x - p.pts[a].x) * 180 / Math.PI;
      if (r.kind === 'seam') {
        // nudge the label inboard so it does not sit on the cut line
        const cx = p.poly.reduce((s2, q) => s2 + q.x, 0) / p.poly.length;
        const off = p.pts[mid].x < cx ? 1.6 : -1.6;
        let a2 = ang; if (a2 > 90 || a2 < -90) a2 += 180;
        S.push(`<text class="seam" transform="translate(${f(X(mid) + off * CM)},${f(Y(mid))})`
          + ` rotate(${f(a2)})" text-anchor="middle">`
          + `${r.seam} join to ${r.partnerName}</text>`);
      } else {
        const label = r.kind === 'top' ? 'TOP (neck)' : 'BOTTOM (waist)';
        // clear the cutting line, which sits a seam allowance outside the edge
        const off = r.kind === 'top' ? -(seamAllowanceCm + 0.7) : (seamAllowanceCm + 1.4);
        S.push(`<text class="edge" x="${f(X(mid))}" y="${f(Y(mid) + off * CM)}"`
          + ` text-anchor="middle">${label}</text>`);
      }
    }

    // ---- matched balance marks, placed by vertex identity
    for (const r of (p.runs || [])) {
      if (r.kind !== 'seam') continue;
      const want = marks.get(r.seam) || [];
      r.pts.forEach((pi, k) => {
        const v3 = p.pts[pi].v3;
        const isMark = want.includes(v3);
        const isWaist = waistV !== undefined && p.pts[pi].uv
          && Math.abs(p.pts[pi].uv[1] - waistV) < 0.012;
        if (!isMark && !isWaist) return;
        const prev = r.pts[Math.max(0, k - 1)], next = r.pts[Math.min(r.pts.length - 1, k + 1)];
        const tx = p.pts[next].x - p.pts[prev].x, ty = p.pts[next].y - p.pts[prev].y;
        const L = Math.hypot(tx, ty) || 1;
        const cx = p.poly.reduce((s2, q) => s2 + q.x, 0) / p.poly.length;
        const sgn = p.pts[pi].x < cx ? 1 : -1;
        const nx = (ty / L) * sgn, ny = (-tx / L) * sgn;
        const len2 = isWaist ? 1.1 : 0.6;
        S.push(`<path class="${isWaist ? 'waist' : 'notch'}"`
          + ` d="M${f(X(pi))},${f(Y(pi))} L${f(X(pi) + nx * len2 * CM)},${f(Y(pi) + ny * len2 * CM)}"/>`);
      });
    }

    // ---- name, grainline, stats
    const b = bbox(p.poly);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const gx = (cx + dx) * CM;
    const yTop = (b.y0 + 2 + dy) * CM, yBot = (b.y1 - 2 + dy) * CM;
    S.push(`<path class="grain" d="M${f(gx)},${f(yBot)} L${f(gx)},${f(yTop)}"/>`);
    S.push(`<path class="grain" d="M${f(gx - 0.5 * CM)},${f(yTop + 0.8 * CM)}`
      + ` L${f(gx)},${f(yTop)} L${f(gx + 0.5 * CM)},${f(yTop + 0.8 * CM)}"/>`);
    S.push(`<text class="small" transform="translate(${f(gx + 0.35 * CM)},${f((cy + 6 + dy) * CM)})`
      + ` rotate(-90)" text-anchor="middle">GRAIN / UP</text>`);
    S.push(`<text class="big" x="${f(gx)}" y="${f((cy + dy) * CM)}" text-anchor="middle">${p.name}</text>`);
    S.push(`<text class="lab" x="${f(gx)}" y="${f((cy + 1.2 + dy) * CM)}" text-anchor="middle">`
      + `cut 1${p.areaCm2 ? `  ${p.areaCm2.toFixed(0)} cm2` : ''}</text>`);
    if (p.darts && p.darts.length) {
      S.push(`<text class="lab" x="${f(gx)}" y="${f((cy + 2.2 + dy) * CM)}" text-anchor="middle">`
        + `${p.darts.length} dart${p.darts.length === 1 ? '' : 's'}</text>`);
    }
    S.push('</g>');
  }

  // ---- sewing schedule
  let y = layout.heightCm + 3.0;
  S.push(`<text class="lab" x="${f(1 * CM)}" y="${f(y * CM)}">`
    + `${esc(name)} - ${panels.length} panels, seam allowance ${seamAllowanceCm} cm.`
    + ` Solid = cut, dashed red = stitch line.</text>`);
  y += 1.4;
  S.push(`<text class="lab" x="${f(1 * CM)}" y="${f(y * CM)}">SEWING ORDER (match the balance marks):</text>`);
  y += 1.2;
  (pattern.seams || []).forEach((sm, i) => {
    const col = i % 3, rowI = Math.floor(i / 3);
    S.push(`<text class="small" x="${f((1 + col * 14) * CM)}" y="${f((y + rowI * 1.1) * CM)}">`
      + `${sm.id}: ${sm.a} to ${sm.b}  (${sm.lengthCm} cm)</text>`);
  });
  y += Math.ceil((pattern.seams || []).length / 3) * 1.1 + 1.6;

  S.push(`<rect class="cal" x="${f(1 * CM)}" y="${f(y * CM)}" width="${f(10 * CM)}" height="${f(2.5 * CM)}"/>`);
  S.push(`<text class="small" x="${f(1.4 * CM)}" y="${f((y + 1.6) * CM)}">`
    + '10 cm calibration - measure this before cutting</text>');

  S.push('</svg>');
  return { svg: S.join('\n'), layout };
}
