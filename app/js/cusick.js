// The Cusick drape test (BS 5058 / ISO 9073-9), which is the standard answer
// to "does this behave like linen, like cardboard, or like nothing at all".
//
// A circular specimen is laid on a smaller rigid support disc and allowed to
// drape over its rim. Seen from above, a rigid sheet still covers the full
// specimen circle; a limp one collapses to little more than the support. The
// drape coefficient is where the shadow falls between those two:
//
//     DC = (A_draped - A_support) / (A_specimen - A_support)
//
// DC = 1 is a sheet of card. DC -> 0 is a cloth with no stiffness at all.
// That is the whole scale, and it is the reason this test is worth having:
// every other number in this repo says how the cloth behaves against some
// other number of ours, and this one is comparable with a value a textile lab
// publishes for a real fabric.
//
// THREE.JS-FREE, so the headless tool and the viewer run the same code
// (docs/17-interface.md, and the rule about the viewer and the headless path
// not diverging).
//
// Standard geometry: a 30 cm specimen on an 18 cm support. Those are the
// dimensions in the standard and the dimensions the published tables are for,
// so they are the defaults and changing them makes the published comparison
// meaningless -- `geometryIsStandard` says so in the result rather than
// leaving it to be noticed.
import { annulusPattern } from './testpieces.js';
import { sewFlat } from './patternio.js';
import { Cloth } from './cloth.js';

/**
 * Published drape coefficients BY FABRIC CLASS, as percentages.
 *
 * THESE ARE CLASS RANGES FROM THE TEXTILE LITERATURE, NOT MEASUREMENTS OF
 * THESE PARTICULAR CLOTHS -- the same footing as `shearLockDeg` in cloth.js,
 * and marked as such for the same reason. A 120 gsm poplin and another 120 gsm
 * poplin do not have the same drape coefficient, and no number here should be
 * read as if they did. They are wide enough to be worth something only as a
 * sanity band: a fabric reading outside its class's range is wrong in a way
 * that does not depend on which poplin you meant.
 *
 * The useful property of this scale is its ends. Paper and card sit near 100,
 * a fluid silk near 20. Anything reading 95 is behaving like card whatever it
 * was asked to be, and anything reading 5 is behaving like nothing at all.
 */
export const PUBLISHED_DC = {
  'silk habotai': [15, 35],
  'cotton jersey': [20, 40],
  'cotton poplin': [40, 65],
  'wool crepe': [35, 60],
  linen: [50, 75],
  denim: [65, 90],
  'interfaced twill': [80, 97],
  '(paper, for the top of the scale)': [95, 100],
};

/** Shoelace area of a closed polygon given as [x, z] pairs, in cm^2. */
function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

/**
 * Is the projected outline star-shaped about its centroid?
 *
 * THE VALIDITY FLAG FOR THE AREA ABOVE. The shoelace area of a polygon that
 * crosses itself is not the area of its shadow -- the overlap cancels instead
 * of counting once -- so a deep enough fold that tucks one part of the hem
 * under another makes `A_draped` quietly too small, and DC quietly too low.
 * A real apparatus does not have this problem because it traces the outline
 * optically.
 *
 * Checking that the hem sweeps a monotonic angle about the centroid catches
 * exactly that case. Reported rather than thrown, because a cloth limp enough
 * to do it is a real cloth and the rest of the row is still informative; but
 * a DC quoted from a run where this is false is not a measurement.
 */
function isStarShaped(pts) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cz = pts.reduce((s, p) => s + p[1], 0) / n;
  let turned = 0;
  let prev = Math.atan2(pts[0][1] - cz, pts[0][0] - cx);
  for (let i = 1; i <= n; i++) {
    const a = Math.atan2(pts[i % n][1] - cz, pts[i % n][0] - cx);
    let d = a - prev;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    turned += d;
    prev = a;
  }
  // one clean revolution, to within a few degrees of accumulated noise
  return Math.abs(Math.abs(turned) - 2 * Math.PI) < 0.1;
}

/**
 * Run the test on one fabric.
 *
 * @param {object} opts
 * @param {number} [opts.specimenR] specimen radius, cm (standard: 15)
 * @param {number} [opts.supportR]  support disc radius, cm (standard: 9)
 * @param {number} [opts.edge]      triangle edge, cm
 * @param {string} [opts.fabric]
 * @param {number} [opts.seconds]   settle budget
 */
export function setupCusick({
  specimenR = 15, supportR = 9, edge = 1.0, y = 0, center = [0, 0], jitterCm = 0,
} = {}) {
  if (!(supportR < specimenR)) throw new Error('the support must be smaller than the specimen');

  // A small centre hole, as the standard specimen has for its pin. It is well
  // inside the support disc, so it is pinned and plays no part in the drape.
  const pattern = annulusPattern({ innerR: 1.0, outerR: specimenR, edge });
  const asm = sewFlat(pattern, { y, center });

  // THE SUPPORT DISC IS THE PINNED SET, not a collider. The cloth inside the
  // support radius cannot move, which is what resting on a rigid disc means;
  // everything outside bends over the rim under its own weight. No collider,
  // no floor: the standard apparatus holds the specimen in free air, and a
  // floor within reach would be measuring the table instead of the cloth.
  let pinned = 0;
  for (let i = 0; i < asm.verts.length; i++) {
    const p = asm.verts[i];
    if (Math.hypot(p[0] - center[0], p[2] - center[1]) <= supportR + 1e-6) {
      asm.pinned[i] = true; pinned++;
    }
  }
  // SYMMETRY BREAKING, off by default.
  //
  // A perfectly circular specimen, perfectly meshed, under perfectly vertical
  // gravity has no reason to prefer one fold pattern over another -- or over
  // none. Buckling needs an imperfection to choose a mode, and a real
  // specimen has thousands: yarn count, a crease from the cutting table, the
  // weave itself. A simulation starting from exact symmetry can sit in the
  // unstable flat equilibrium indefinitely, which LOOKS like cloth that is
  // too stiff to drape and is nothing of the kind.
  //
  // This is a property of the experiment, not of the solver, which is why it
  // is an input and is reported in the result: a DC measured with jitter and
  // a DC measured without are answers to different questions, and the number
  // alone does not say which.
  if (jitterCm > 0) {
    // deterministic, so a run can be repeated exactly
    let seed = 20261017;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296 - 0.5;
    };
    for (let i = 0; i < asm.verts.length; i++) {
      if (asm.pinned[i]) continue;
      asm.verts[i][1] += rnd() * 2 * jitterCm;
    }
  }

  return { pattern, asm, pinned, specimenR, supportR, edge, center, jitterCm };
}

/**
 * Score a specimen that has already been draped, however it was draped.
 *
 * SEPARATE FROM THE SETTLE so the viewer and the headless tool measure with
 * the same code. The viewer wants to watch the cloth fall and then ask for a
 * number; the tool wants the number and nothing else. If the scoring lived
 * inside the settle, the page would have to reimplement it -- which is how
 * the viewer and the headless path came to disagree before (docs/17).
 */
export function measureCusick({ pattern, asm, specimenR, supportR, edge, center = [0, 0] }) {
  // ---- the shadow, from the hem
  const hemIds = pattern.panels[0].loop;
  const outline = hemIds.map((i) => [asm.verts[i][0] - center[0], asm.verts[i][2] - center[1]]);
  const drapedCm2 = polygonArea(outline);
  const starShaped = isStarShaped(outline);

  const supportCm2 = Math.PI * supportR ** 2;
  const specimenCm2 = Math.PI * specimenR ** 2;
  const dc = (drapedCm2 - supportCm2) / (specimenCm2 - supportCm2);

  // ---- folds, as the node count the standard reports beside DC
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
  const cz = outline.reduce((s, p) => s + p[1], 0) / outline.length;
  const r = outline.map((p) => Math.hypot(p[0] - cx, p[1] - cz));
  const n = r.length;
  const smooth = r.map((_, k) => (r[(k - 1 + n) % n] + r[k] + r[(k + 1) % n]) / 3);
  const meanR = smooth.reduce((a, b) => a + b, 0) / n;

  // A FOLD HAS TO BE DEEPER THAN THE MESH IS COARSE.
  //
  // Counting every local maximum above the mean reported 30 and 32 folds on a
  // 23-fold mesh -- more folds than the triangles can represent, which is not
  // a fold count but discretisation noise on an outline that is very nearly a
  // circle. It is at its worst exactly where it does most damage: a specimen
  // that barely drapes has an almost constant radius, so the noise is all
  // there is, and the count comes out high and reads as "lots of folds" when
  // the truth is "no drape at all".
  //
  // `edge / 4` as the floor: a wave shallower than a quarter of one triangle
  // is below what this mesh can claim to resolve. The threshold is a property
  // of the mesh, not of the cloth, which is why it is not a tuning constant.
  const minProminence = edge / 4;
  const troughNear = (k, dir) => {
    for (let d = 1; d <= n; d++) {
      const j = (k + dir * d + n * 2) % n;
      const prev = smooth[(j - dir + n * 2) % n];
      const next = smooth[(j + dir + n * 2) % n];
      if (smooth[j] <= prev && smooth[j] < next) return smooth[j];
    }
    return Math.min(...smooth);
  };
  let folds = 0;
  for (let k = 0; k < n; k++) {
    if (!(smooth[k] > smooth[(k - 1 + n) % n] && smooth[k] >= smooth[(k + 1) % n]
        && smooth[k] > meanR)) continue;
    const prominence = smooth[k] - (troughNear(k, -1) + troughNear(k, +1)) / 2;
    if (prominence >= minProminence) folds++;
  }

  // The mesh cannot represent a fold narrower than a couple of its triangles,
  // so a fold count at the ceiling is a statement about the mesh and not about
  // the cloth. Printed beside the count rather than left to be inferred --
  // todos/18-validation.md Step 2 asks for exactly this.
  const hemCircumferenceCm = 2 * Math.PI * specimenR;
  const foldCeiling = Math.floor(hemCircumferenceCm / (4 * edge));

  // HOW FAR THE HEM FELL, which DC alone cannot say. A specimen that droops
  // into a smooth cone and one that has not moved at all both lose projected
  // area slowly at first, so a high DC is ambiguous between "too stiff to
  // fold" and "not bending whatsoever". The hem's drop below the support
  // plane separates them in one number.
  const supportY = asm.verts.findIndex((_, i) => asm.pinned && asm.pinned[i]);
  const planeY = supportY >= 0 ? asm.verts[supportY][1] : 0;
  const hemY = hemIds.map((i) => asm.verts[i][1]);
  const hemDropCm = +(planeY - Math.min(...hemY)).toFixed(2);

  return {
    DC: +(dc * 100).toFixed(1),
    hemDropCm,
    overhangCm: +(specimenR - supportR).toFixed(2),
    drapedCm2: +drapedCm2.toFixed(1),
    supportCm2: +supportCm2.toFixed(1),
    specimenCm2: +specimenCm2.toFixed(1),
    folds,
    foldCeiling,
    foldsAtCeiling: folds >= foldCeiling,
    minFoldProminenceCm: +minProminence.toFixed(3),
    edge,
    vertices: asm.verts.length,
    starShaped,
    geometryIsStandard: specimenR === 15 && supportR === 9,
  };
}

/**
 * Score the specimen repeatedly AS IT DRAPES, not once at the end.
 *
 * THE INSTRUMENT FOR A DEFECT NOTHING ELSE CAN SEE. Measured against Blender
 * on a skirt, this solver's folds get SHALLOWER the longer it runs -- mean
 * fold 1.56 cm at a 6 s budget, 0.64 cm at 30 s, while Blender holds its
 * folds indefinitely (todos/18-validation.md 6.11). A single reading at the
 * end cannot show that, and a reading taken before the cloth has settled is
 * not a measurement either, so the shape over time is the only honest way to
 * look at it: a drape that converges and a drape that is still flattening
 * produce the same number at any one instant.
 *
 * Returns one row per sample: the time, DC, the fold count and how fast the
 * cloth is still moving. A DC that keeps climbing toward 100 is cloth losing
 * its folds; a DC that flattens out is a drape that has converged.
 *
 * @param {object} opts  see setupCusick, plus `fabric`, `seconds`, `every`
 */
export function drapeTrace({
  specimenR = 15, supportR = 9, edge = 1.0, fabric = 'cotton poplin',
  seconds = 30, every = 2, cloth: clothOpts = {}, dt = 1 / 60, onSample = null,
  jitterCm = 0,
} = {}) {
  const rig = setupCusick({ specimenR, supportR, edge, jitterCm });
  const sim = new Cloth(rig.asm, null, { fabric, floorY: -1e5, ...clothOpts });
  const samples = [];
  const stepsPer = Math.max(1, Math.round(every / dt));
  const total = Math.round(seconds / dt);
  for (let f = 1; f <= total; f++) {
    sim.step(dt);
    if (f % stepsPer && f !== total) continue;
    const m = measureCusick(rig);
    const row = {
      t: +(f * dt).toFixed(2),
      DC: m.DC,
      folds: m.folds,
      'rms cm/s': +sim.rmsSpeed().toFixed(2),
      'outline ok': m.starShaped,
    };
    samples.push(row);
    if (onSample) onSample(row);
    if (!sim.healthy()) { row.blewUp = true; break; }
  }
  return { fabric, edge, samples, rig, cloth: sim };
}

/**
 * Set it up, drop it, and score it: the headless path.
 *
 * @param {object} opts  see setupCusick, plus `fabric` and `seconds`
 */
export function drapeCoefficient({
  specimenR = 15, supportR = 9, edge = 1.0, fabric = 'cotton poplin',
  seconds = 8, cloth: clothOpts = {}, dt = 1 / 60, jitterCm = 0,
} = {}) {
  const rig = setupCusick({ specimenR, supportR, edge, jitterCm });
  const sim = new Cloth(rig.asm, null, { fabric, floorY: -1e5, ...clothOpts });
  const settle = sim.settle({ maxSeconds: seconds, dt });
  return {
    fabric,
    ...measureCusick(rig),
    pinned: rig.pinned,
    jitterCm,
    settled: !!settle.settled,
    seconds: settle.seconds,
    pattern: rig.pattern, asm: rig.asm, cloth: sim,
  };
}

/**
 * The verdict against the published class band.
 *
 * Returns a sentence, not a boolean: "in range" is not the same claim as
 * "correct", because the bands are class-wide. What it can say honestly is
 * that a cloth is outside the range its whole class occupies.
 */
export function verdictFor(name, dc) {
  const want = PUBLISHED_DC[name];
  if (!want) return 'no published band for this fabric';
  if (dc < want[0]) return `${(want[0] / Math.max(dc, 0.1)).toFixed(1)}x too limp (class is ${want[0]}-${want[1]})`;
  if (dc > want[1]) return `${(dc / want[1]).toFixed(1)}x too stiff (class is ${want[0]}-${want[1]})`;
  return `in the ${want[0]}-${want[1]} band for its class`;
}
