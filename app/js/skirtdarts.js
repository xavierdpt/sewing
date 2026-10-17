// Asymmetric darts, cut into a skirt pattern on purpose.
//
// WHY THIS EXISTS. Everything this project assembles so far is symmetric:
// identical panels, identical seams, the same thing four times. A symmetric
// garment hides a whole class of mistakes, because a left-right error looks
// the same as no error at all -- a mirrored piece, a seam paired to the wrong
// side, a dart closed against its neighbour instead of against itself. The
// only way to see those is to sew something that is NOT the same twice.
//
// So this cuts darts that differ deliberately: different intakes, different
// positions across the panel, different depths, one of them tilted off the
// radial, and one panel with none at all. Nothing here is a shape anyone
// would draft for a skirt; it is a test fixture, and its asymmetry is the
// specification rather than a side effect.
//
// VISIBLE ON PURPOSE. The fixture's own intakes are 4.6-13.2 deg, which on
// the four-panel skirt is a notch 3.96 cm across at its widest: geometrically
// there, and nearly invisible in the viewer once the piece is standing beside
// the body with the next panel behind it. `scale` multiplies every intake,
// and the viewer defaults it to 2 -- a 7.20 cm notch -- because a fixture
// nobody can see is not a fixture. Measured, scale 1 / 2 / 3: notch 3.96 /
// 7.20 / 11.12 cm, cloth removed 54.5 / 110.5 / 169.3 cm2.
//
// IT IS NOT A NEW DART MECHANISM. patternedit.js already takes a wedge out
// exactly -- the cloth either side is untouched and the two cut edges get
// matching vertex ids, so assemble.js stitches a dart closed without knowing
// it is one (see its header). This file only decides WHERE the wedges go, in
// the panel's own coordinates, from the numbers flaredSkirtPattern recorded
// in `meta`. That is why it works on a pattern loaded from a file as well as
// on one just drafted.
//
// Three.js-free, like the rest of app/js, so the viewer's button and
// `node tools/trace.mjs --darts` cut the same darts (rule 7).

import { takeOutWedge } from './patternedit.js';

/**
 * The panel's own geometry, recovered from the pattern's meta.
 *
 * A flared panel is an annular sector with its centre at (0, r0): the waist
 * arc is at radius r0, the hem at r0 + L, and `phi` runs across the panel.
 * An unflared one is a rectangle with the waist at y = 0. Both are handled,
 * because a gathered skirt with no flare is a legitimate thing to dart.
 */
function panelFrame(meta) {
  const panels = meta.panels;
  const L = meta.lengthCm;
  const w = (meta.patternWaistCm || meta.waistCm) / panels;
  const theta = (meta.sectorAngleDeg || 0) * Math.PI / 180;
  const r0 = meta.innerRadiusCm;
  const flared = !!(r0 && Math.abs(theta) > 1e-9);
  return {
    L, w, flared,
    /** A point `depth` cm in from the waist, at fraction `f` across. */
    at(f, depth) {
      if (!flared) return { p: [-w / 2 + w * f, -depth], towardsDeg: 90 };
      const phi = -theta / 2 + theta * f;
      const r = r0 + depth;
      return {
        p: [r * Math.sin(phi), r0 - r * Math.cos(phi)],
        // the waist is INWARD from here: the wedge opens towards it
        towardsDeg: Math.atan2(Math.cos(phi), -Math.sin(phi)) * 180 / Math.PI,
      };
    },
  };
}

/**
 * The default fixture: what each panel gets, cycled over however many panels
 * the skirt has.
 *
 * `across` is the fraction of the panel's waist the dart sits at, `depthCm`
 * how far its apex is from the waist, `intakeDeg` how much it takes out, and
 * `tiltDeg` how far it leans off the radial -- a dart that is not
 * perpendicular to the seam it ends on, which is the case that catches
 * leg-pairing errors.
 */
export const ASYMMETRIC = [
  // two darts on one panel, unequal and unevenly spaced
  [{ across: 0.30, depthCm: 13, intakeDeg: 12 },
   { across: 0.72, depthCm: 9, intakeDeg: 6 }],
  // one, leaning
  [{ across: 0.45, depthCm: 12, intakeDeg: 9, tiltDeg: 10 }],
  // none: a plain panel next to darted ones
  [],
  // one, wide and deep, well off centre
  [{ across: 0.35, depthCm: 16, intakeDeg: 15 }],
];

/**
 * How much of the waist EDGE a set of darts removes.
 *
 * Each dart's opening at the edge is the chord between its two legs,
 * 2 r sin(theta/2). This is the number that decides whether a darted garment
 * can be sewn at all, and it was missed at first: a skirt drafted to the
 * body's waist already has exactly as much cloth as the body needs, so every
 * centimetre a dart takes out is a centimetre the waist seam no longer has.
 * Measured on this fixture at 2x: 16.59 cm out of a 78.28 cm waist, against
 * 3.76 cm of give in a woven at its 6.1 % limit. The darts then cannot close,
 * the sewing stops with them open, and nothing is wrong with the solver --
 * the pattern is 13 cm short.
 */
export function dartAllowanceCm(pattern) {
  let taken = 0;
  for (const panel of pattern.panels) {
    for (const d of (panel.darts || [])) {
      const r = ((d.legCm?.[0] ?? 0) + (d.legCm?.[1] ?? 0)) / 2;
      taken += 2 * r * Math.sin((d.intakeDeg * Math.PI / 180) / 2);
    }
  }
  return taken;
}

/**
 * A darted skirt that can actually be sewn: drafted with the dart allowance
 * ADDED to its waist, so that what is left after cutting them still fits the
 * body.
 *
 * This is what a pattern cutter does without thinking about it -- the dart
 * intake is part of the draft, not something subtracted from a finished
 * waist -- and doing it the other way round produced a fixture that could not
 * close by 13 cm, which looked for a while like a defect in the solver.
 *
 * Two passes, because the allowance depends on the geometry the darts are cut
 * into: draft at the body's waist to find out what the fixture takes, then
 * draft again that much wider and cut for real.
 *
 * @param draftAtWaist  (waistCm) => pattern
 */
export function dartedSkirt(draftAtWaist, opts = {}) {
  const trial = asymmetricDarts(draftAtWaist(opts.waistCm), opts);
  const allowance = dartAllowanceCm(trial.pattern);
  const cut = asymmetricDarts(draftAtWaist(opts.waistCm + allowance), opts);
  const left = dartAllowanceCm(cut.pattern);
  return {
    ...cut,
    allowanceCm: +allowance.toFixed(2),
    // what the waist measures once the darts are closed: the draft minus what
    // they take, which is the body's waist again if the allowance was right
    finishedWaistCm: +(opts.waistCm + allowance - left).toFixed(2),
  };
}

/**
 * Cut the fixture into a flared skirt pattern, in place.
 *
 * @param pattern  a flaredSkirtPattern (or anything with the same meta)
 * @param opts.spec   per-panel dart lists, default ASYMMETRIC
 * @param opts.scale  multiply every intake, to sweep how much shape is taken
 * @returns {pattern, darts, removedCm2, skipped}
 */
export function asymmetricDarts(pattern, { spec = ASYMMETRIC, scale = 1 } = {}) {
  const meta = pattern.meta || {};
  if (!meta.lengthCm || !pattern.panels || !pattern.panels.length) {
    throw new Error('asymmetricDarts needs a drafted skirt pattern (meta.lengthCm)');
  }
  const frame = panelFrame({ panels: pattern.panels.length, ...meta });
  const darts = [], skipped = [];
  let removed = 0;
  pattern.panels.forEach((panel, pi) => {
    // No jitter and no randomness: the same pattern gives the same darts
    // every run, so two traces are comparable. The variation across panels
    // comes from the fixture itself, and from a deterministic nudge so that
    // an eight-panel skirt is not two identical halves.
    const nudge = 1 + 0.12 * (((pi * 7) % 5) - 2);
    for (const d of (spec[pi % spec.length] || [])) {
      const intakeDeg = +(d.intakeDeg * scale * nudge).toFixed(2);
      const depthCm = Math.min(d.depthCm, frame.L * 0.6);
      const { p, towardsDeg } = frame.at(d.across, depthCm);
      const bisectDeg = towardsDeg + (d.tiltDeg || 0);
      try {
        const r = takeOutWedge(pattern, pi, { apex: p, bisectDeg, intakeDeg });
        removed += r.removedCm2;
        darts.push({
          panel: panel.name, intakeDeg, depthCm,
          across: d.across, tiltDeg: d.tiltDeg || 0,
          removedCm2: r.removedCm2, legCm: r.legCm,
          legMismatchCm: r.legMismatchCm, pairs: r.pairs,
        });
      } catch (e) {
        // A wedge that does not reach the edge of the piece is a fixture
        // that does not fit this skirt, not a crash: say which one and go on,
        // so a short or narrow skirt still gets the darts that do fit.
        skipped.push({ panel: panel.name, intakeDeg, depthCm, why: String(e.message || e) });
      }
    }
  });
  pattern.meta.darts = darts.map((d) => ({
    panel: d.panel, intakeDeg: d.intakeDeg, depthCm: d.depthCm, tiltDeg: d.tiltDeg,
  }));
  pattern.meta.dartIntakeDeg = +darts.reduce((a, d) => a + d.intakeDeg, 0).toFixed(2);
  return { pattern, darts, skipped, removedCm2: +removed.toFixed(2) };
}
