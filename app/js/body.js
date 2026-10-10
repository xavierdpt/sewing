// The body, from tape measurements.
//
// This is step one, and it stands alone: no tiles, no gores, no pattern. Get the
// body right and everything downstream is just geometry.
//
// The parameter set is the one a made-to-measure pattern service actually asks
// for, because those are the measurements a person can take with a tape and a
// mirror. Notably it does NOT ask for bust projection, which is almost
// impossible to measure on yourself; it asks instead for two lengths taken from
// the centre back neck point, and infers prominence from the difference. That is
// the classic patternmaking trick and it is why this parametrisation is better
// than the one it replaces.
//
// Units are centimetres internally, y = 0 at the natural waist, +z forward,
// +x to the wearer's left.

import {
  sub, add, mul, dot, cross, norm, len, dist, monotone, clamp, smoothstep,
} from './geom.js';

export const INCH = 2.54;

// ---------------------------------------------------------------- the schema

/** Belly protuberance A (flat) to F (very protruding), in cm of bulge. */
export const BELLY = { A: 0.0, B: 1.1, C: 2.2, D: 3.4, E: 4.7, F: 6.2 };

/** Buttocks shape, in cm of bulge at the seat (negative = flatter than average). */
export const BUTTOCKS = {
  'Very Flat': -2.6, Flat: -1.3, Average: 0.0, Curvy: 1.9, 'Very Curvy': 3.8,
};

/**
 * Posture, as a set of sagittal-plane displacements. Each entry gives
 * [upper-back roundness, lumbar hollow, chest lift, forward lean of the top],
 * all in cm; lumbar hollow is a scoop in the back at waist level.
 */
export const POSTURE = {
  'Straight Back':    { roundBack: 0.0, lumbar: 0.4, chestLift: 0.0, lean:  0.0 },
  'Military Posture': { roundBack: -0.6, lumbar: 1.6, chestLift: 1.1, lean: -0.8 },
  'Round Shoulders':  { roundBack: 2.2, lumbar: 0.5, chestLift: -0.7, lean:  1.4 },
  'Hollow Back':      { roundBack: 0.6, lumbar: 2.4, chestLift: 0.4, lean: -0.4 },
  'Saddle Back':      { roundBack: 1.2, lumbar: 2.9, chestLift: 0.0, lean:  0.2 },
};

/** Shoulder slope, as the drop from the neck base to the shoulder point (cm). */
export const SHOULDER_SLOPE = {
  Square: 3.0, Normal: 4.4, 'Slightly Sloping Shoulders': 5.8, 'Very Sloping Shoulders': 7.2,
};

/**
 * Predefined poses.
 *
 * Not an animation rig: a handful of named positions a garment has to survive.
 * A bodice fitted with the arms down pulls across the back the moment you reach
 * forward, and the allowance patternmakers add for that is largely folklore.
 * With these, the drape can measure it instead -- see tools/poses.mjs.
 */
export const POSES = {
  'Rest (standing)':  { armRaise: 10, armForward: 5, rotation: 0,
                        legSpread: 2, legForward: 0, stride: 0 },
  'Arms forward':     { armRaise: 14, armForward: 62, rotation: 0,
                        legSpread: 2, legForward: 0, stride: 0 },
  'Reach across':     { armRaise: 18, armForward: 85, rotation: 9,
                        legSpread: 2, legForward: 0, stride: 0 },
  'Arms raised':      { armRaise: 92, armForward: 8, rotation: 0,
                        legSpread: 2, legForward: 0, stride: 0 },
  'Arms overhead':    { armRaise: 108, armForward: 4, rotation: 0,
                        legSpread: 2, legForward: 0, stride: 0 },
  'Slouched':         { armRaise: 12, armForward: 26, rotation: 0,
                        legSpread: 2, legForward: 0, stride: 0,
                        posture: 'Round Shoulders' },
  // the ones a skirt has to survive
  'Walking stride':   { armRaise: 10, armForward: 8, legSpread: 3, legForward: 0, stride: 22 },
  'Long stride':      { armRaise: 10, armForward: 12, legSpread: 4, legForward: 0, stride: 36 },
  'Climbing stairs':  { armRaise: 10, armForward: 10, legSpread: 4, legForward: 14, stride: 30 },
  'Sitting':          { armRaise: 8, armForward: 30, legSpread: 6, legForward: 82, stride: 0 },
  'Legs apart':       { armRaise: 12, armForward: 5, legSpread: 18, legForward: 0, stride: 0 },
};

export const DEFAULT_BODY = {
  units: 'cm',
  height: 168,                  // total stature
  bust: 92,
  underBust: 76,
  waist: 72,
  lowHip: 98,
  neckCircumference: 36,
  neckHeight: 7,                // how much neck to carry above the nape
  backLength: 41,               // centre back neck point, down the back, to the waist
  bustHeightFromCBNP: 30,       // over the shoulder to the bust apex
  frontLengthFromCBNP: 54,      // over the shoulder and the apex, to the waist
  backWidth: 35,
  apexToApex: 19,
  // Breadth and depth. A girth alone does not say what SHAPE the cross section
  // is: 98 cm of hip can be wide and flat or narrow and deep, and they need
  // different patterns. Leave at 0 to use a default proportion.
  //
  // Naming follows apparel practice, which differs from anthropometry and from
  // itself. Here:
  //   hipWidth     = side-to-side breadth at the low hip. Anthropometry calls
  //                  the bony version BITROCHANTERIC BREADTH.
  //   hipThickness = front-to-back depth at the same level. Anthropometry calls
  //                  it BUTTOCK DEPTH.
  //   waistToHip   = the VERTICAL drop from waist to low hip. Several drafting
  //                  books call this one "hip depth", which is why the
  //                  front-to-back measurement is called thickness here.
  hipWidth: 0,
  hipThickness: 0,
  waistWidth: 0,
  waistThickness: 0,
  // lower body
  thighGirth: 58,               // fullest part of the upper thigh
  midThighGirth: 0,             // 0 = taper smoothly from thigh to knee
  kneeGirth: 37,
  waistToHip: 20,               // waist down to the low hip
  crotchDepth: 27,              // waist down to the crotch (the rise)
  waistToKnee: 58,
  upperArmGirth: 28,            // around the widest part of the upper arm
  armRaise: 10,                 // abduction: degrees away from the side
  armForward: 5,                // flexion: degrees forward of the coronal plane
  legSpread: 2,                 // abduction: degrees apart
  legForward: 0,                // both hips flexed, as in sitting
  stride: 0,                    // antisymmetric flexion: one leg forward, one back
  bellyProtuberance: 'B',
  buttocksShape: 'Average',
  posture: 'Straight Back',
  shoulderSlope: 'Normal',
  // Modelling constants, exposed because they are assumptions, not measurements.
  // ribAtBust is the fraction of the bust-minus-underbust difference that
  // belongs to the ribcage rather than to the breasts; the rest becomes apex
  // projection. See build().
  ribAtBust: 0.35,
  superness: 2.6,
  // asymmetry, which no size chart has ever offered
  shoulderDrop: 0.0,
  lateralShift: 0.0,
  bustAsym: 0.0,
  rotation: 0.0,
};

/**
 * A generic European size chart. NOT any particular brand's: vanity sizing makes
 * published charts disagree by several centimetres, so treat these as a starting
 * point to edit, which is the whole premise of the project anyway.
 */
export const SIZE_CHART = {
  labels: { eu: [32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52],
            us: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
            uk: [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26],
            fr: [34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54],
            it: [38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58],
            ru: [38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58] },
  rows: [
    //  bust under waist   hip  neck  back bustH front backW  apex
    // Girths grade 4-6 cm per size. LENGTHS grade about half a centimetre:
    // a larger size is wider, not taller. Grading the vertical columns as
    // steeply as the girths drove the bust apex so high that there was no
    // room left below the nape for the chest and shoulder rings, and the
    // back-length solve had nowhere to go.
    [   80,    64,    60,    86,  33.1,  39.2,  28.5,  51.3,  31.7,  16.4],
    [   84,    68,    64,    90,  34.1,  39.8,  29.0,  52.2,  32.8,  17.3],
    [   88,    72,    68,    94,  35.0,  40.4,  29.5,  53.1,  33.9,  18.1],
    [   92,    76,    72,    98,  36.0,  41.0,  30.0,  54.0,  35.0,  19.0],
    [   96,    80,    76,   102,  37.0,  41.6,  30.5,  54.9,  36.1,  19.9],
    [  100,    84,    81,   106,  37.9,  42.2,  31.0,  55.8,  37.2,  20.7],
    [  104,    88,    86,   110,  38.9,  42.8,  31.5,  56.7,  38.3,  21.6],
    [  110,    94,    92,   116,  39.8,  43.4,  32.0,  57.6,  39.4,  22.4],
    [  116,   100,    98,   122,  40.8,  44.0,  32.5,  58.5,  40.5,  23.2],
    [  122,   106,   104,   128,  41.7,  44.6,  33.0,  59.4,  41.6,  24.1],
    [  128,   112,   110,   134,  42.6,  45.2,  33.5,  60.3,  42.7,  24.9],
  ],
  keys: ['bust', 'underBust', 'waist', 'lowHip', 'neckCircumference',
    'backLength', 'bustHeightFromCBNP', 'frontLengthFromCBNP', 'backWidth', 'apexToApex'],
};

/** Measurements for a standard size, in cm. */
export function standardSize(index) {
  const row = SIZE_CHART.rows[clamp(index, 0, SIZE_CHART.rows.length - 1)];
  const out = {};
  SIZE_CHART.keys.forEach((k, i) => { out[k] = row[i]; });
  return out;
}

/** Fields that are lengths, and so need converting when the units change. */
export const LENGTH_KEYS = ['height', 'bust', 'underBust', 'waist', 'lowHip',
  'neckCircumference', 'neckHeight', 'backLength', 'bustHeightFromCBNP', 'frontLengthFromCBNP',
  'backWidth', 'apexToApex', 'upperArmGirth', 'thighGirth', 'kneeGirth',
  'midThighGirth', 'waistToHip', 'crotchDepth', 'waistToKnee',
  'hipWidth', 'hipThickness', 'waistWidth', 'waistThickness',
  'shoulderDrop', 'lateralShift', 'bustAsym'];

// ------------------------------------------------------------ the surface

/** Monotone-chain convex hull of 2D points. */
function convexHull2(pts) {
  const p = pts.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (arr) => {
    const out = [];
    for (const q of arr) {
      while (out.length >= 2 && cr(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out;
  };
  return half(p).slice(0, -1).concat(half(p.slice().reverse()).slice(0, -1));
}

function superUnit(t, n) {
  const c = Math.cos(t), s = Math.sin(t);
  const e = 2 / n;
  return [Math.sign(c) * Math.abs(c) ** e, Math.sign(s) * Math.abs(s) ** e];
}

function superPerimeter(a, b, n, steps = 240) {
  let p = 0, prev = null;
  for (let i = 0; i <= steps; i++) {
    const [cx, cz] = superUnit((i / steps) * Math.PI * 2, n);
    const q = [cx * a, cz * b];
    if (prev) p += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    prev = q;
  }
  return p;
}

/** Semi-axes for a ring of the given girth and width/depth ratio. */
function axesFor(girth, ratio, n) {
  const b = girth / superPerimeter(ratio, 1, n);
  return { a: ratio * b, b };
}

// The body is a tube from the crotch up: one closed loop at every height, which
// is what a torso actually is. It STOPS at the crotch, because below that a
// body is two loops -- one per leg -- and a tube parametrisation cannot express
// that. Below the crotch the body is legs, modelled as articulated tubes.
//
// Nothing wraps the legs. An earlier version carried the tube down to the knee
// as an "envelope" around both of them, on the grounds that a skirt is that
// shape. It is, but a body is not, and conflating the two made a seated pose
// render as a vertical column with legs sticking out of it.
//
// A skirt is drafted on the body down to the hip and then EXTENDED to length
// with a chosen flare, which is how skirts are really drafted: below the hip
// the body dictates nothing except how much room the legs need to move.
const BODY_RINGS = ['crotch', 'lowHip', 'highHip', 'waist',
  'underBust', 'bust', 'chest', 'shoulder', 'neck', 'neckTop'];

/**
 * The nape -- the base of the neck, where a collar sits and where the two
 * "from centre back neck point" measurements start.
 *
 * It is no longer the top of the model: a stub of neck continues above it, so
 * necklines and collars have something to be cut against. Anything that means
 * "the nape" must say so, because v = 1 is now the top of the neck column.
 */
const NAPE_V = BODY_RINGS.indexOf('neck') / (BODY_RINGS.length - 1);
const RATIO = {
  lowHip: 1.42, highHip: 1.40, waist: 1.38, underBust: 1.34,
  bust: 1.30, chest: 1.34, shoulder: 1.62, neck: 1.12, neckTop: 1.10,
};
/** Rings whose semi-axes come from the legs or a breadth, not from a girth. */
const ENVELOPE_RINGS = ['crotch', 'shoulder'];

export class Body {
  constructor(m = {}) {
    this.m = { ...DEFAULT_BODY, ...m };
    this.build();
  }

  set(key, value) { this.m[key] = value; this.build(); return this; }
  update(obj) { Object.assign(this.m, obj); this.build(); return this; }

  /** Measurements in centimetres, whatever units they were entered in. */
  cm() {
    const k = this.m.units === 'in' ? INCH : 1;
    const out = { ...this.m };
    for (const key of LENGTH_KEYS) if (typeof out[key] === 'number') out[key] *= k;
    return out;
  }

  /** Adopt a named pose, keeping every measurement. */
  applyPose(name) {
    const p = POSES[name];
    if (!p) throw new Error(`unknown pose ${name}`);
    this.poseName = name;
    return this.update(p);
  }

  /** Apply a standard size, keeping units, posture and asymmetry. */
  applyStandardSize(index) {
    const s = standardSize(index);
    const k = this.m.units === 'in' ? 1 / INCH : 1;
    const scaled = {};
    for (const [key, v] of Object.entries(s)) scaled[key] = +(v * k).toFixed(2);
    return this.update(scaled);
  }

  build() {
    const M = this.cm();
    this.M = M;
    const n = M.superness;
    const hf = M.height / 168;                       // height scaling
    this.posture = POSTURE[M.posture] || POSTURE['Straight Back'];
    this.belly = BELLY[M.bellyProtuberance] ?? 0;
    this.seat = BUTTOCKS[M.buttocksShape] ?? 0;
    this.shoulderDropCm = (SHOULDER_SLOPE[M.shoulderSlope] ?? 4.4) * hf;
    this.hf = hf;

    // --- girths that are not measured, derived from those that are
    const chestGirth = M.underBust + 0.55 * (M.bust - M.underBust);
    const highHipGirth = M.waist + 0.55 * (M.lowHip - M.waist);
    // The ring at bust level is the RIBCAGE, not the bust. Sizing that ring to
    // the measured bust girth and then adding apex bumps on top double counts
    // the breasts -- which is what the first version did, and it drove the
    // projection solve straight into its lower bound.
    const ribAtBustGirth = M.underBust + M.ribAtBust * (M.bust - M.underBust);

    // --- the shoulder ring is set by back width, not by a girth
    const chestAxes = axesFor(chestGirth, RATIO.chest, n);
    // Shoulder point to shoulder point is a little wider than the across-back
    // measurement, which is taken between the armhole creases.
    const shoulderA = (M.backWidth * 1.12) / 2;
    const shoulderB = chestAxes.b * 0.95;

    // --- legs. Centres close enough that the thighs meet at the crotch.
    const thighR = M.thighGirth / (2 * Math.PI);
    const kneeR = M.kneeGirth / (2 * Math.PI);
    this.legs = { thighR, kneeR, spacing: thighR * 1.08 };
    const legHalf = this.legs.spacing / 2;
    const radAt = (y) => {
      // 0 at the crotch, 1 at the knee; y is negative below the waist
      const t = clamp((-y - M.crotchDepth) / (M.waistToKnee - M.crotchDepth || 1), 0, 1);
      return thighR + (kneeR - thighR) * t;
    };
    this.legRadiusAt = radAt;

    // --- vertical landmarks. bustY and neckY are solved below; seed them.
    this.heights = {
      knee: -M.waistToKnee,
      midThigh: -(M.crotchDepth + (M.waistToKnee - M.crotchDepth) * 0.42),
      crotch: -M.crotchDepth,
      lowHip: -M.waistToHip, highHip: -M.waistToHip * 0.5, waist: 0,
      underBust: 12 * hf, bust: 20 * hf, chest: 26 * hf,
      shoulder: 36 * hf, neck: 40 * hf, neckTop: 40 * hf + M.neckHeight,
    };
    this.bustProjection = 3.5 * hf;

    if (!this.girthScale) {
      this.girthScale = { lowHip: 1, highHip: 1, waist: 1, underBust: 1, chest: 1, neck: 1 };
    }
    const G = this.girthScale;
    // A measured breadth and depth fix the ASPECT of a ring; the girth still
    // fixes its size. Giving all three over-determines the ellipse, so girth
    // wins and measure() reports the breadth and depth actually achieved, which
    // is where you see the disagreement.
    const ratioOf = (key, fallback) => {
      const w = { lowHip: M.hipWidth, waist: M.waistWidth }[key] || 0;
      const d = { lowHip: M.hipThickness, waist: M.waistThickness }[key] || 0;
      return (w > 0 && d > 0) ? w / d : fallback;
    };
    const setRings = () => {
      // Derive into a LOCAL copy. Writing the derived heights back onto
      // this.heights let the clamp below accumulate across solver iterations.
      const H = { ...this.heights };
      // The chest (armpit level) sits partway between the bust apex and the
      // nape, not a fixed distance above the apex: on a large body a fixed
      // 6 cm offset crowded it right up against the shoulder ring.
      H.chest = H.bust + Math.max(3 * hf, 0.45 * (H.neck - H.bust));
      H.underBust = H.bust - 8 * hf;
      H.shoulder = H.neck - this.shoulderDropCm;
      H.neckTop = H.neck + M.neckHeight;

      // The ring stack MUST ascend. It is a loft: if two rings cross, the
      // surface folds back on itself and every arc measured on it becomes
      // meaningless -- which is exactly what happened above EU 46, where the
      // chest ring rose above the shoulder, the back-length arc blew up, and
      // the solver read that as "too long, lower the neck", driving itself
      // further into the fold. A self-reinforcing trap that silently produced
      // a broken body for the four largest sizes.
      const MIN_GAP = 1.5 * hf;
      const upward = ['waist', 'underBust', 'bust', 'chest', 'shoulder', 'neck', 'neckTop'];
      this.clamped = [];
      for (let i = 1; i < upward.length; i++) {
        const floorY = H[upward[i - 1]] + MIN_GAP;
        if (H[upward[i]] < floorY) {
          H[upward[i]] = floorY;
          this.clamped.push(upward[i]);
        }
      }
      this.ringHeights = H;
      this.rings = BODY_RINGS.map((key) => {
        const y = H[key];
        if (key === 'shoulder') return { key, y, a: shoulderA, b: shoulderB };
        if (ENVELOPE_RINGS.includes(key)) {
          // half-width spans from the outside of one leg to the outside of the
          // other; half-depth is just the leg itself
          const r = (key === 'midThigh' && M.midThighGirth > 0)
            ? M.midThighGirth / (2 * Math.PI) : radAt(y);
          // Use where the legs ACTUALLY are at this height, not where they
          // would be if they hung perfectly vertically: even two degrees of
          // spread moves them a centimetre apart by the knee, and an envelope
          // built on the vertical assumption is narrower than the legs it is
          // supposed to contain.
          const spread = (M.legSpread * Math.PI) / 180;
          const outAt = legHalf + Math.max(0, -y - M.crotchDepth) * Math.tan(spread);
          // a few millimetres of clearance, so the legs sit INSIDE the envelope
          // rather than exactly on it -- coincident surfaces z-fight, and more
          // importantly a skirt hangs off the envelope, not off the skin
          return { key, y, a: outAt + r + 0.35, b: r * 1.06 + 0.35 };
        }
        const girth = { lowHip: M.lowHip, highHip: highHipGirth, waist: M.waist,
          underBust: M.underBust, bust: ribAtBustGirth, chest: chestGirth,
          // the neck narrows a little going up from the nape
          neck: M.neckCircumference, neckTop: M.neckCircumference * 0.93 }[key];
        const { a, b } = axesFor(girth * (G[key] === undefined ? 1 : G[key]),
          ratioOf(key, RATIO[key]), n);
        return { key, y, a, b };
      });
      this.ys = this.rings.map((r) => r.y);
      this.as = this.rings.map((r) => r.a);
      this.bs = this.rings.map((r) => r.b);
      this.yMin = this.ys[0];
      this.yMax = this.ys[this.ys.length - 1];
      this._samples = null;
      this._hash = null;
    };
    setRings();

    // --- solve the three measurements that are arc lengths on the surface.
    // Each is monotone in its own parameter, so plain bisection is enough and
    // cannot wander the way a Newton step would near the bust.
    // Bisection, with a residual check. A solve that rails against its bounds
    // silently produces a body that does not match the measurement it was given,
    // which is the worst possible failure mode here: everything downstream still
    // runs, and the numbers merely stop being true.
    this.unmet = [];
    const solve = (name, lo, hi, measure, target, apply, iters = 26, tol = 0.15) => {
      for (let i = 0; i < iters; i++) {
        const mid = (lo + hi) / 2;
        apply(mid);
        setRings();
        if (measure() < target) lo = mid; else hi = mid;
      }
      apply((lo + hi) / 2);
      setRings();
      const got = measure();
      if (Math.abs(got - target) > tol) {
        this.unmet.push({ measurement: name, asked: target, got, errorCm: got - target });
      }
    };

    // 1. neck height, from the back length (nape to waist, down the centre back)
    // lower bound keeps the neck above the chest and shoulder, so the search
    // never enters the folded region in the first place
    // Just enough room for the chest and shoulder rings above the bust. The
    // MIN_GAP clamp in setRings already guarantees the stack cannot invert, so
    // this only has to keep the search out of the clamped region -- an extra
    // margin on top of it simply made large sizes infeasible for no reason.
    const neckFloor = () => this.heights.bust + 6 * hf + this.shoulderDropCm + 1.0 * hf;
    solve('backLength', neckFloor(), 80 * hf,
      () => this.arcLength(0.5, NAPE_V, this.vOfY(0)), M.backLength,
      (v) => { this.heights.neck = v; });

    // 2. bust apex height, from (front length - bust height), which is the arc
    //    from the apex down to the waist and cancels the over-shoulder detour
    const apexToWaist = M.frontLengthFromCBNP - M.bustHeightFromCBNP;
    const uApex = this.uOfApex();
    solve('apex to waist (front)', 4 * hf, this.heights.neck - 6 * hf,
      () => this.arcLength(uApex, this.vOfY(this.heights.bust), this.vOfY(0)), apexToWaist,
      (v) => { this.heights.bust = v; });

    // 3. bust projection, from the bust girth: the apices must add exactly the
    //    girth the ribcage ring does not already account for. Monotone, and it
    //    needs no calibration constant -- unlike trying to reconstruct the
    //    over-the-shoulder path of the CBNP measurements, which has no
    //    counterpart on a lofted torso and was the previous approach's fudge.
    solve('bust', 0.0, 16 * hf,
      () => this.girthAt(this.vOfY(this.heights.bust), 240), M.bust,
      (v) => { this.bustProjection = v; });

    // the apex height solve above was run against a flat chest, so redo it now
    // that the apices exist
    solve('apex to waist (front)', 4 * hf, this.heights.neck - 6 * hf,
      () => this.arcLength(this.uOfApex(), this.vOfY(this.heights.bust), this.vOfY(0)),
      apexToWaist, (v) => { this.heights.bust = v; }, 18);
    solve('bust', 0.0, 16 * hf,
      () => this.girthAt(this.vOfY(this.heights.bust), 240), M.bust,
      (v) => { this.bustProjection = v; }, 18);

    // --- calibrate the rings against what a tape would actually read.
    // The bust apices bleed girth onto the underbust ring and the posture
    // fields move the neck, so the nominal girth of a ring is not its measured
    // girth. Scale each ring until the two agree, then re-run the arc solves,
    // because moving a ring moves the arcs that located it. Converges in three.
    // Calibrate only against girths that were actually MEASURED. highHip and
    // chest are derived, so forcing the surface to reproduce them is circular --
    // and it was the chest one that shrank its ring to two thirds of its width
    // to cancel out the neighbouring shoulder, flaring the surface into a
    // horizontal plate at the shoulders on the largest sizes.
    const targets = { lowHip: M.lowHip, waist: M.waist,
      underBust: M.underBust, neck: M.neckCircumference };
    for (const k2 of ENVELOPE_RINGS) delete G[k2];     // these are not girth-driven
    for (let round = 0; round < 3; round++) {
      for (const key of Object.keys(targets)) {
        const got = this.girthAt(this.vOfY(this.heights[key]), 200);
        if (got > 1) G[key] *= targets[key] / got;
      }
      setRings();
      solve('backLength', neckFloor(), 80 * hf,
        () => this.arcLength(0.5, NAPE_V, this.vOfY(0)), M.backLength,
        (v) => { this.heights.neck = v; }, 18);
      solve('apex to waist (front)', 4 * hf, this.heights.neck - 6 * hf,
        () => this.arcLength(this.uOfApex(), this.vOfY(this.heights.bust), this.vOfY(0)),
        apexToWaist, (v) => { this.heights.bust = v; }, 18);
      solve('bust', 0.0, 16 * hf,
        () => this.girthAt(this.vOfY(this.heights.bust), 200), M.bust,
        (v) => { this.bustProjection = v; }, 18);
    }

    const notes = [];
    if (this.clamped && this.clamped.length) {
      notes.push(`ring heights clamped (${[...new Set(this.clamped)].join(', ')})`);
    }
    for (const u of this.unmet) {
      notes.push(`${u.measurement} off by ${u.errorCm.toFixed(1)} cm`
        + ` (asked ${u.asked.toFixed(1)}, model ${u.got.toFixed(1)})`);
    }
    this.warning = notes.length
      ? `these measurements do not fit together: ${notes.join('; ')}` : null;

    this.derived = {
      chestGirth, highHipGirth, bustProjection: this.bustProjection,
      neckY: this.heights.neck, bustY: this.heights.bust,
      shoulderY: this.heights.shoulder,
    };
  }

  /**
   * v of a named landmark. Everything downstream should ask for 'waist' rather
   * than for 0.5: adding the legs moved every numeric v, and anything holding a
   * literal silently started pointing somewhere else on the body.
   */
  landmarkV(name) {
    const H = this.ringHeights || this.heights;
    if (H[name] === undefined) throw new Error(`no landmark ${name}`);
    const y = H[name];
    if (y < this.yMin - 1e-6) {
      throw new Error(`landmark '${name}' is below the body, which stops at the`
        + ' crotch; below that there are legs, not a surface');
    }
    return this.vOfY(y);
  }

  /** The v band a garment covers. */
  band(garment = 'bodice', inset = 0.012) {
    // Everything stops at the crotch, because that is where the body stops.
    // Skirt length below it is added afterwards, as flare.
    const spans = {
      bodice: ['lowHip', 'neck'],
      skirt: ['crotch', 'waist'],
      dress: ['crotch', 'neck'],
      torso: ['lowHip', 'shoulder'],
      full: ['crotch', 'neck'],
    };
    const [lo, hi] = spans[garment] || spans.bodice;
    return { vLo: this.landmarkV(lo) + inset, vHi: this.landmarkV(hi) - inset };
  }

  /** v parameter of a given height, by inverting the ring stack. */
  vOfY(y) {
    const n = this.rings.length - 1;
    for (let i = 0; i < n; i++) {
      if (y >= this.ys[i] && y <= this.ys[i + 1]) {
        const t = (y - this.ys[i]) / ((this.ys[i + 1] - this.ys[i]) || 1);
        return (i + t) / n;
      }
    }
    return y < this.ys[0] ? 0 : 1;
  }

  /** The u where the bust apex sits (x = -apexToApex/2, wearer's left). */
  uOfApex() {
    const half = this.M.apexToApex / 2;
    const v = this.vOfY(this.heights.bust);
    let best = 0.12, bestErr = Infinity;
    for (let i = 0; i <= 200; i++) {
      const u = 0.25 * (i / 200);                 // front quarter only
      const p = this.point(u, v);
      const e = Math.abs(-p[0] - half);
      if (e < bestErr) { bestErr = e; best = u; }
    }
    return best;
  }

  /** Arc length along a meridian u, between two v values. */
  arcLength(u, vA, vB, steps = 160) {
    const lo = Math.min(vA, vB), hi = Math.max(vA, vB);
    let L = 0, prev = this.point(u, lo);
    for (let i = 1; i <= steps; i++) {
      const q = this.point(u, lo + (hi - lo) * (i / steps));
      L += len(sub(q, prev));
      prev = q;
    }
    return L;
  }

  point(u, v) {
    const M = this.M;
    const nSteps = this.rings.length - 1;
    const t = clamp(v, 0, 1) * nSteps;
    let y = monotone(this.ys, t);
    const a = monotone(this.as, t);
    const b = monotone(this.bs, t);
    const [sx, sz] = superUnit(u * Math.PI * 2 + Math.PI / 2, M.superness);
    let x = sx * a;
    let z = sz * b;

    const front = z > 0 ? smoothstep(0, 0.35 * b, z) : 0;
    const back = z < 0 ? smoothstep(0, 0.35 * b, -z) : 0;
    const hf = this.hf;
    const bump = (yc, sigY, amp, lateral = null, sigX = null, sigYBelow = null) => {
      const s2 = (y < yc && sigYBelow !== null) ? sigYBelow : sigY;
      let f = Math.exp(-(((y - yc) / s2) ** 2));
      if (lateral !== null) f *= Math.exp(-(((x - lateral) / sigX) ** 2));
      return amp * f;
    };

    // --- bust apices
    if (front > 0 && this.bustProjection > 0) {
      for (const side of [-1, 1]) {
        const ax = side * M.apexToApex / 2;
        const amp = this.bustProjection + (side < 0 ? M.bustAsym : 0);
        // Horizontal spread follows the apex spacing; VERTICAL extent follows
        // the underbust-to-apex gap, which is about 8 cm on any body. Scaling
        // the vertical sigma from apexToApex too meant that at EU 52 the breast
        // still had 84% of its projection six centimetres above the apex -- the
        // chest ring then got shrunk to a sixth of its width to compensate, and
        // the surface flared out into a horizontal plate at the shoulders.
        const r = Math.max(5, M.apexToApex * 0.5);
        const vert = Math.max(4, (this.heights.bust - this.heights.underBust) * 0.95);
        z += bump(this.heights.bust, vert, amp, ax, r, vert * 0.62) * front;
      }
    }
    // --- belly
    if (front > 0 && this.belly > 0) {
      z += bump(this.heights.lowHip * 0.4, 9 * hf, this.belly) * front;
    }
    // --- seat
    if (back > 0 && this.seat !== 0) {
      z -= bump(this.heights.lowHip * 0.75, 10 * hf, this.seat) * back;
    }
    // --- posture
    const P = this.posture;
    if (back > 0) {
      z -= bump(this.heights.shoulder - 6 * hf, 9 * hf, P.roundBack) * back;
      z += bump(-1 * hf, 6 * hf, P.lumbar) * back;           // lumbar hollow
    }
    if (front > 0) {
      z += bump(this.heights.chest, 7 * hf, P.chestLift) * front;
    }
    if (P.lean) {
      const above = smoothstep(0, this.heights.neck, y);
      z += P.lean * above;
    }

    // --- asymmetry
    const above = smoothstep(0, this.heights.shoulder, y);
    if (M.lateralShift) {
      x += M.lateralShift * Math.sin(Math.PI * clamp(y / this.heights.shoulder, 0, 1));
    }
    if (M.shoulderDrop) {
      y -= M.shoulderDrop * above * smoothstep(0, 1, clamp(x / (0.6 * a), 0, 1));
    }
    if (M.rotation) {
      const ang = (M.rotation * Math.PI / 180) * above;
      const c = Math.cos(ang), s = Math.sin(ang);
      const nx = x * c - z * s, nz = x * s + z * c;
      x = nx; z = nz;
    }
    return [x, y, z];
  }

  normal(u, v) {
    const e = 1e-3;
    const du = sub(this.point(u + e, v), this.point(u - e, v));
    const dv = sub(this.point(u, clamp(v + e, 0, 1)), this.point(u, clamp(v - e, 0, 1)));
    let nrm = norm(cross(dv, du));
    const p = this.point(u, v);
    if (dot(nrm, [p[0], 0, p[2]]) < 0) nrm = mul(nrm, -1);
    return nrm;
  }

  frame(u, v) {
    const e = 1e-3;
    const du = norm(sub(this.point(u + e, v), this.point(u - e, v)));
    const nr = this.normal(u, v);
    return [du, norm(cross(nr, du)), nr];
  }

  mesh({ nu = 110, nv = 80 } = {}) {
    const positions = [], normals = [], indices = [], uvs = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = (i / nu) % 1, v = j / nv;
        const p = this.point(u, v), nr = this.normal(u, v);
        positions.push(p[0], p[1], p[2]);
        normals.push(nr[0], nr[1], nr[2]);
        uvs.push(i / nu, v);
      }
    }
    const row = nu + 1;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const A = j * row + i, B = A + 1, C = A + row, D = C + 1;
      indices.push(A, C, B, B, C, D);
    }
    return { positions, normals, indices, uvs };
  }

  girthAt(v, steps = 480) {
    let p = 0, prev = this.point(0, v);
    for (let i = 1; i <= steps; i++) {
      const q = this.point(i / steps, v);
      p += len(sub(q, prev));
      prev = q;
    }
    return p;
  }

  /** Surface area, optionally over a v band only. */
  surfaceArea(nu = 180, nv = 130, vLo = 0, vHi = 1) {
    const V = (j) => vLo + (vHi - vLo) * (j / nv);
    let A = 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const p00 = this.point(i / nu, V(j)), p10 = this.point((i + 1) / nu, V(j));
      const p01 = this.point(i / nu, V(j + 1)), p11 = this.point((i + 1) / nu, V(j + 1));
      A += 0.5 * len(cross(sub(p10, p00), sub(p01, p00)));
      A += 0.5 * len(cross(sub(p10, p11), sub(p01, p11)));
    }
    return A;
  }

  /** Surface area of the band a garment covers. */
  bandArea(garment = 'bodice', nu = 180, nv = 130) {
    const { vLo, vHi } = this.band(garment);
    return this.surfaceArea(nu, nv, vLo, vHi);
  }

  /**
   * Measure the model the way a tape would, so the inputs can be checked
   * against the outputs. This is the only honest test of a body generator.
   */
  measure() {
    const uApex = this.uOfApex();
    const vWaist = this.vOfY(0);
    return {
      bust: this.girthAt(this.vOfY(this.heights.bust)),
      underBust: this.girthAt(this.vOfY(this.heights.underBust)),
      waist: this.girthAt(vWaist),
      lowHip: this.girthAt(this.vOfY(this.heights.lowHip)),
      neckCircumference: this.girthAt(NAPE_V),
      backLength: this.arcLength(0.5, NAPE_V, vWaist),
      apexToWaistFront: this.arcLength(uApex, this.vOfY(this.heights.bust), vWaist),
      // the model's own front length, from the neck ring down over the apex.
      // It is shorter than the measured frontLengthFromCBNP by the
      // over-the-shoulder detour, which a lofted torso has no shelf for.
      frontArc: this.arcLength(uApex, NAPE_V, vWaist),
      apexToApex: 2 * Math.abs(this.point(uApex, this.vOfY(this.heights.bust))[0]),
      hipWidth: 2 * Math.abs(this.point(0.25, this.landmarkV('lowHip'))[0]),
      hipThickness: this.point(0, this.landmarkV('lowHip'))[2]
        - this.point(0.5, this.landmarkV('lowHip'))[2],
      waistWidth: 2 * Math.abs(this.point(0.25, this.landmarkV('waist'))[0]),
      waistThickness: this.point(0, this.landmarkV('waist'))[2]
        - this.point(0.5, this.landmarkV('waist'))[2],
      thighGirth: 2 * Math.PI * this.legs.thighR,
      kneeGirth: 2 * Math.PI * this.legs.kneeR,
      // measured off the legs, not off a ring: there is no knee ring any more
      acrossKnees: this.legSpanAt(this.heights.knee).widthCm,
      bustProjection: this.bustProjection,
    };
  }

  // ------------------------------------------------------------------- arms
  //
  // The torso stays a clean (u,v) tube -- everything downstream depends on that
  // -- and the arms are added as separate jointed primitives that take part in
  // collision and define the armscye. A full skinned rig would buy animation
  // this project has no use for; what it needs from arms is an armhole and the
  // ability to raise them and see what binds.

  /**
   * The two legs, as tapered capsules hinged at the hip.
   *
   * Same treatment as the arms: the garment surface stays the standing
   * envelope, and the limbs move through it. A skirt that fits standing is not
   * the question -- whether you can sit down or take a stride in it is.
   */
  legSegments() {
    const M = this.M;
    const half = this.legs.spacing / 2;
    const L = M.waistToKnee - M.crotchDepth;
    const spread = (M.legSpread * Math.PI) / 180;
    const fwd = (M.legForward * Math.PI) / 180;
    const stride = (M.stride * Math.PI) / 180;
    return [-1, 1].map((side) => {
      // the left leg strides forward, the right one back
      const flex = fwd + (side < 0 ? stride : -stride);
      const d = norm([
        side * Math.sin(spread) * Math.cos(flex),
        -Math.cos(spread) * Math.cos(flex),
        Math.sin(flex),
      ]);
      const a = [side * half, this.heights.crotch, 0];
      return { side, a, b: add(a, mul(d, L)), rA: this.legs.thighR,
        rB: this.legs.kneeR, dir: d };
    });
  }

  /**
   * How much room the legs need at a given height: the convex hull of their two
   * cross sections there.
   *
   * This is the number a skirt lives or dies by. A hem narrower than this
   * perimeter cannot be walked or sat in, however well it fits standing, and it
   * is why tight skirts get a vent.
   */
  legSpanAt(y) {
    const pts = [];
    let nearHorizontal = false;
    for (const seg of this.legSegments()) {
      const ab = sub(seg.b, seg.a);
      // A horizontal plane cuts a tilted cylinder in an ELLIPSE: semi-minor is
      // the radius, semi-major is radius / |cos(tilt)|. The first version
      // instead gathered every circle within a vertical window of the plane,
      // which quietly inflated the radius by the taper across that window and
      // reported a leg fatter than the envelope that contains it.
      if (Math.abs(ab[1]) < 1e-6) continue;              // leg is horizontal
      let t = (y - seg.a[1]) / ab[1];
      // the hem sits at the knee landmark, and a leg tilted even slightly ends
      // a few millimetres short of it, so allow a little slack at both ends
      if (t < -0.03 || t > 1.03) continue;                // the plane misses it
      t = clamp(t, 0, 1);
      const c = add(seg.a, mul(ab, t));
      const r = seg.rA + (seg.rB - seg.rA) * t;
      const dl = len(ab);
      const cosA = Math.abs(ab[1]) / (dl || 1);          // tilt from vertical
      // Past about 70 degrees from vertical the plane slices the thigh along
      // its LENGTH, and the resulting hull is not a girth any garment has to
      // pass over -- a skirt drapes across a seated lap, it does not thread
      // over it. Report it rather than returning a number that looks like one.
      if (cosA < 0.34) { nearHorizontal = true; continue; }
      const major = r / cosA;
      // the major axis lies along the horizontal projection of the leg's axis
      const hx = ab[0], hz = ab[2];
      const hl = Math.hypot(hx, hz);
      const ux = hl > 1e-9 ? hx / hl : 1, uz = hl > 1e-9 ? hz / hl : 0;
      for (let k = 0; k < 48; k++) {
        const th = (k / 48) * Math.PI * 2;
        const e = major * Math.cos(th), f = r * Math.sin(th);
        pts.push([c[0] + e * ux - f * uz, c[2] + e * uz + f * ux]);
      }
    }
    if (pts.length < 3) {
      return { perimeterCm: 0, widthCm: 0, depthCm: 0, hull: [], nearHorizontal };
    }
    const hull = convexHull2(pts);
    let per = 0;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length];
      per += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const xs = hull.map((q) => q[0]), zs = hull.map((q) => q[1]);
    return {
      perimeterCm: per,
      widthCm: Math.max(...xs) - Math.min(...xs),
      depthCm: Math.max(...zs) - Math.min(...zs),
      hull,
      nearHorizontal,
    };
  }

  /**
   * Compare what the legs need against what a garment offers, at every height
   * it covers. The binding point is rarely the hem: stride and the knee rises,
   * so the hem may clear nothing at all while the thigh is jammed.
   *
   * `offeredAt(y)` returns the garment's circumference at that height, usually
   * taken from the body it was cut for.
   */
  clearanceProfile(offeredAt, yLo, yHi, step = 2) {
    const rows = [];
    let skipped = 0;
    for (let y = yLo; y <= yHi + 1e-9; y += step) {
      const span = this.legSpanAt(y);
      if (span.nearHorizontal) { skipped++; continue; }
      const need = span.perimeterCm;
      if (need <= 0) continue;
      const have = offeredAt(y);
      rows.push({ y, needCm: need, haveCm: have, spareCm: have - need });
    }
    const worst = rows.reduce((a, r) => (a === null || r.spareCm < a.spareCm ? r : a), null);
    return { rows, worst, skippedNearHorizontal: skipped };
  }

  /** Distance from p to the nearer leg, with its closest point and normal. */
  closestLeg(p) {
    let best = null;
    for (const seg of this.legSegments()) {
      const ab = sub(seg.b, seg.a);
      const t = clamp(dot(sub(p, seg.a), ab) / (dot(ab, ab) || 1), 0, 1);
      const q = add(seg.a, mul(ab, t));
      const r = seg.rA + (seg.rB - seg.rA) * t;
      const d = dist(p, q);
      const signed = d - r;
      if (!best || signed < best.signed) {
        const n = d > 1e-6 ? mul(sub(p, q), 1 / d) : [seg.side, 0, 0];
        best = { point: add(q, mul(n, r)), normal: n, signed, seg, t };
      }
    }
    return best;
  }

  /** The crotch point: where the two legs meet, at the top of the inseam. */
  crotchPoint() {
    return [0, this.heights.crotch, -this.legs.thighR * 0.15];
  }

  /**
   * Triangle mesh for the legs. Below the crotch these ARE the body, so they
   * get a closed cap at the knee rather than an open tube end.
   */
  legMesh({ radial = 26, along = 14 } = {}) {
    const positions = [], normals = [], indices = [];
    for (const seg of this.legSegments()) {
      const base = positions.length / 3;
      const d = seg.dir;
      const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const e1 = norm(cross(up, d)), e2 = cross(d, e1);
      for (let j = 0; j <= along; j++) {
        const t = j / along;
        const c = add(seg.a, mul(sub(seg.b, seg.a), t));
        const r = seg.rA + (seg.rB - seg.rA) * t;
        for (let i = 0; i <= radial; i++) {
          const th = (i / radial) * Math.PI * 2;
          const n = add(mul(e1, Math.cos(th)), mul(e2, Math.sin(th)));
          const p = add(c, mul(n, r));
          positions.push(p[0], p[1], p[2]);
          normals.push(n[0], n[1], n[2]);
        }
      }
      const row = radial + 1;
      for (let j = 0; j < along; j++) for (let i = 0; i < radial; i++) {
        const A = base + j * row + i, B = A + 1, C = A + row, D = C + 1;
        indices.push(A, C, B, B, C, D);
      }
      // cap the knee end
      const capC = positions.length / 3;
      positions.push(seg.b[0], seg.b[1], seg.b[2]);
      normals.push(d[0], d[1], d[2]);
      const lastRow = base + along * row;
      for (let i = 0; i < radial; i++) indices.push(capC, lastRow + i + 1, lastRow + i);
    }
    return { positions, normals, indices, uvs: null };
  }

  /** Shoulder joint centres, left and right, in torso coordinates. */
  shoulderJoints() {
    const M = this.M;
    const yj = this.heights.shoulder - 1.5 * this.hf;
    const half = (M.backWidth * 1.12) / 2;
    return [-1, 1].map((side) => {
      const drop = side < 0 ? (M.shoulderDrop || 0) : 0;   // asymmetry
      return { side, p: [side * (half - 1.2), yj - drop, 0] };
    });
  }

  /** Upper arm as a capsule: centre line plus radius. */
  armSegments() {
    const M = this.M;
    const r = M.upperArmGirth / (2 * Math.PI);
    const L = 0.19 * M.height;
    const raise = (M.armRaise * Math.PI) / 180;
    const fwd = (M.armForward * Math.PI) / 180;
    return this.shoulderJoints().map(({ side, p }) => {
      // hangs down, swung out by the raise angle and forward by the flexion
      const d = norm([
        side * Math.sin(raise) * Math.cos(fwd),
        -Math.cos(raise),
        Math.sin(fwd),
      ]);
      return { side, a: p, b: add(p, mul(d, L)), r, dir: d };
    });
  }

  /** Distance from p to the arm capsules, with the closest point and normal. */
  closestArm(p) {
    let best = null;
    for (const seg of this.armSegments()) {
      const ab = sub(seg.b, seg.a);
      const t = clamp(dot(sub(p, seg.a), ab) / (dot(ab, ab) || 1), 0, 1);
      const q = add(seg.a, mul(ab, t));
      const d = dist(p, q);
      const signed = d - seg.r;
      if (!best || signed < best.signed) {
        const n = d > 1e-6 ? mul(sub(p, q), 1 / d) : [seg.side, 0, 0];
        best = { point: add(q, mul(n, seg.r)), normal: n, signed, seg, t };
      }
    }
    return best;
  }

  /**
   * The armscye: the closed curve on the torso where the arm meets it.
   *
   * Found by walking the torso surface and keeping the points that sit within
   * `margin` of the arm capsule -- the arm root carves its own hole, so the
   * shape responds to shoulder slope, back width and arm pose, instead of being
   * a drawn oval that has to be redrawn whenever the body changes.
   */
  armscye(side = -1, { margin = 1.0, samples = 220 } = {}) {
    const seg = this.armSegments().find((s2) => s2.side === side);
    if (!seg) return [];
    const inside = (u, v) => {
      const p = this.point(u, v);
      const ab = sub(seg.b, seg.a);
      const t = clamp(dot(sub(p, seg.a), ab) / (dot(ab, ab) || 1), 0, 1);
      return dist(p, add(seg.a, mul(ab, t))) - seg.r < margin;
    };
    // march a ring of directions out from the joint's (u,v) and find the edge
    const vJ = this.vOfY(seg.a[1]);
    let uJ = 0.25 * (side < 0 ? 1 : -1);
    if (uJ < 0) uJ += 1;
    const loop = [];
    for (let k = 0; k < samples; k++) {
      const th = (k / samples) * Math.PI * 2;
      const du = Math.cos(th) * 0.0025, dv = Math.sin(th) * 0.004;
      let lo = 0, hi = 60;
      if (!inside(uJ, vJ)) return [];           // the arm does not reach the torso
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (inside((uJ + du * mid + 1) % 1, clamp(vJ + dv * mid, 0, 1))) lo = mid; else hi = mid;
      }
      const u = (uJ + du * lo + 1) % 1, v = clamp(vJ + dv * lo, 0, 1);
      loop.push({ u, v, p: this.point(u, v) });
    }
    return loop;
  }

  /** Triangle mesh for the arms, for display. */
  armMesh({ radial = 20, along = 14 } = {}) {
    const positions = [], normals = [], indices = [];
    for (const seg of this.armSegments()) {
      const d = seg.dir;
      const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const e1 = norm(cross(up, d)), e2 = cross(d, e1);
      const base = positions.length / 3;
      void along;
      // A capsule, properly: straight shaft between the two centres with a
      // hemisphere on each end. The first attempt tapered the radius to zero at
      // both ends with a sine, which draws a lens, not a limb.
      const L = len(sub(seg.b, seg.a));
      const total = L + 2 * seg.r;
      for (let j = 0; j <= along; j++) {
        const sAlong = (j / along) * total - seg.r;       // -r .. L+r from a
        let rad, axial;
        if (sAlong < 0) {                                  // proximal cap
          rad = seg.r * Math.sqrt(Math.max(0, 1 - (sAlong / seg.r) ** 2));
          axial = sAlong;
        } else if (sAlong > L) {                           // distal cap
          const o = sAlong - L;
          rad = seg.r * Math.sqrt(Math.max(0, 1 - (o / seg.r) ** 2));
          axial = sAlong;
        } else {
          rad = seg.r;
          axial = sAlong;
        }
        const c = add(seg.a, mul(d, axial));
        for (let i = 0; i <= radial; i++) {
          const th = (i / radial) * Math.PI * 2;
          const n = add(mul(e1, Math.cos(th)), mul(e2, Math.sin(th)));
          const p = add(c, mul(n, rad));
          positions.push(p[0], p[1], p[2]);
          // on the caps the outward normal tilts along the axis
          const nn = norm(add(mul(n, rad), mul(d, sAlong < 0 ? axial : (sAlong > L ? axial - L : 0))));
          normals.push(nn[0], nn[1], nn[2]);
        }
      }
      const row = radial + 1;
      for (let j = 0; j < along; j++) for (let i = 0; i < radial; i++) {
        const A = base + j * row + i, B = A + 1, C = A + row, D = C + 1;
        indices.push(A, C, B, B, C, D);
      }
    }
    return { positions, normals, indices, uvs: null };
  }

  // ---------------------------------------------------------------- queries

  _ensureSamples(nu = 144, nv = 96, cell = 3.0) {
    if (this._samples) return;
    const pts = [], nrm = [], uv = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) {
      const u = i / nu, v = j / nv;
      pts.push(this.point(u, v));
      nrm.push(this.normal(u, v));
      uv.push([u, v]);
    }
    const hash = new Map();
    const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    pts.forEach((p, i) => {
      const k = key(p[0], p[1], p[2]);
      if (!hash.has(k)) hash.set(k, []);
      hash.get(k).push(i);
    });
    this._samples = { pts, nrm, uv };
    this._hash = { hash, cell, key };
  }

  closestPoint(p) {
    this._ensureSamples();
    const { pts, nrm, uv } = this._samples;
    const { hash, cell } = this._hash;
    let best = -1, bestD2 = Infinity;
    for (let r = 1; r <= 6 && best < 0; r++) {
      const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
        if (r > 1 && Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) < r) continue;
        const bucket = hash.get(`${cx + i},${cy + j},${cz + k}`);
        if (!bucket) continue;
        for (const idx of bucket) {
          const q = pts[idx];
          const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
          if (d2 < bestD2) { bestD2 = d2; best = idx; }
        }
      }
    }
    if (best < 0) {
      for (let idx = 0; idx < pts.length; idx++) {
        const q = pts[idx];
        const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = idx; }
      }
    }
    const q = pts[best], nq = nrm[best];
    return { point: q, normal: nq, uv: uv[best], dist: Math.sqrt(bestD2), signed: dot(sub(p, q), nq) };
  }

  closestOnOffset(p, ease = 0.6) {
    const c = this.closestPoint(p);
    let best = { point: add(c.point, mul(c.normal, ease)), normal: c.normal,
      uv: c.uv, signed: c.signed - ease };
    if (this.includeArms) {
      // a garment cannot pass through an arm either
      const a = this.closestArm(p);
      if (a && a.signed - ease < best.signed) {
        best = { point: add(a.point, mul(a.normal, ease)), normal: a.normal,
          uv: c.uv, signed: a.signed - ease, onArm: true };
      }
    }
    if (this.includeLegs) {
      const l = this.closestLeg(p);
      if (l && l.signed - ease < best.signed) {
        best = { point: add(l.point, mul(l.normal, ease)), normal: l.normal,
          uv: c.uv, signed: l.signed - ease, onLeg: true };
      }
    }
    return best;
  }
}
