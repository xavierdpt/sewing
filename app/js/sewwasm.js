// Sewing in the page: the seams drawn closed by sewcloth, a frame at a time.
//
// THE COUNTERPART OF drapewasm.js, AND DELIBERATELY A DIFFERENT SHAPE. A
// drape is one solve: create a cloth, step six seconds, hand back the
// vertices, dispose. Sewing is watched -- the whole point of W is seeing the
// pieces close on the body, with the person free to stop it where it is -- so
// the cloth here LIVES ACROSS FRAMES. It is built when the pieces are laid
// out, stepped once per rendered frame, and destroyed when the garment is
// rebuilt or cleared. `sc_positions()` returns a pointer that never moves,
// which is what makes that cheap.
//
// WHAT IT IS FOR. `app/js/cloth.js` sews at 126 ms a frame on the plain
// four-panel skirt -- 7.9 fps against a 16.7 ms budget -- and 58 % of that is
// the bending solve (`node tools/profile.mjs --scenario sew`). The algorithm
// is not the problem and is not being replaced: the constant-rate feed closes
// seams to 0.024 cm where Blender's own sewing springs leave 9.2 cm. What
// moves is where it runs.
//
// NOT WIRED TO W YET. docs/19-todo.md item 1 step 5 is that step, and until
// it lands this module is a capability with no caller -- which is rule 9, and
// the reason this comment says so rather than implying otherwise.

import { bendingStencils, BEND_SCALE } from './bending.js';
import { FABRICS, rigidityOf } from './cloth.js';
import { WasmCloth } from './wasmcloth.js';
import { sewclothModule, fieldFor } from './drapewasm.js';

/**
 * The fabric, as sewcloth wants it.
 *
 * STATED AS AN OPEN QUESTION RATHER THAN AS A FACT. `FABRICS` carries a
 * weight, a bending length and a measured strain limit; sewcloth takes a
 * mass, a spring tension and a damping. Mapping one onto the other by
 * measurement against the oracle is docs/19-todo.md item 2 -- the drape
 * already settles 6 % longer in the hem than Blender does, which is the same
 * mapping showing up as a number. These are the values that make the sewing
 * phase behave; they are not claimed to be the fabric.
 */
export function fabricFor(name) {
  const preset = FABRICS[name] || FABRICS.linen;
  const gsm = preset.gsm ?? 150;
  return {
    // grams per vertex is the solver's mass; a garment's own areal weight
    // would need the vertex's share of area, which is item 2's business.
    mass: 0.5,
    // Stiff enough that the pieces do not stretch while being pulled
    // together: the sewing phase is quasi-static and gravity is off.
    tension: 20000,
    damping: 0.995,
    gsm,
    rigidity: rigidityOf(gsm, preset.bendLengthCm ?? 2.0),
    stretchAlpha: preset.stretch ?? 1e-8,
    // The one fabric number that is NOT a guess: measured, 6.1 % across the
    // wovens, 25 % for jersey (sim/cipc/fabrics.md, via FABRICS). Without it
    // the wasm sewing stretched this skirt 34.5 %.
    maxStrain: preset.maxStrain ?? 0.061,
  };
}

/**
 * A garment being sewn, in wasm.
 *
 * @param mod      an instantiated sewcloth module
 * @param asm      the laid-out assembly; its `verts` are the source of truth
 *                 and are written back on every `step`
 * @param stitches the stitch list from `layOut`
 * @param surface  the body, or null
 */
export class WasmSewing {
  constructor(mod, {
    asm, stitches, surface = null, fabric = 'cotton poplin',
    sewSpeedCmPerSec = 4, maxTensionGf = 250, stitchSoftness = 50,
    // The lag the feed will tolerate before waiting for the cloth. ONE
    // centimetre, because that is what cloth.js uses (`sewSlackCm`) and the
    // two have to sew at the same speed to be comparable at all; half of it,
    // which this defaulted to at first, makes the feed wait most frames and
    // a pass that should take 4 seconds take minutes.
    sewSlackCm = 1.0,
    // MEASURED, not inherited. The sewing phase is quasi-static -- gravity
    // off, the cloth creeping along at the feed rate -- so it does not need
    // the drop test's budget, and taking it costs both speed and closure.
    // On the darted fixture, 126 frames each, worst gap / ms per frame:
    //
    //   substeps 10, bend 8, strain 200   0.250 cm   59.8 ms
    //   substeps 10, bend 8, strain  20   0.239 cm   29.3 ms
    //   substeps  8, bend 4, strain  20   0.170 cm   17.0 ms   <- this
    //   substeps  6, bend 4, strain  20   0.148 cm   13.5 ms
    //   substeps  6, bend 2, strain   8   0.144 cm   10.5 ms
    //
    // The cheap settings close the seams BETTER, which is not a paradox: 200
    // strain passes and 8 bend sweeps are the cloth fighting the thread, and
    // a dart has to fold to close. 8/4/20 is taken rather than the cheapest
    // because 6 substeps is the floor cloth.js's own sweep established for a
    // drop, and a margin above a floor is worth 3.5 ms.
    substeps = 8, bendSweeps = 4, strainPasses = 20, tension = null,
    cell = 1.0, selfCollision = false,
  } = {}) {
    const f = fabricFor(fabric);
    this.asm = asm;
    this.stitches = stitches;
    this.substeps = substeps;
    this.cloth = new WasmCloth(mod, {
      verts: asm.verts,
      edges: asm.edges.values ? asm.edges.values() : asm.edges,
      sdf: surface ? fieldFor(surface, { cell }) : null,
      fabric: {
        mass: f.mass, tension: tension ?? f.tension, damping: f.damping,
        // Cut pieces may pass through each other while they are still cut
        // pieces: a wide panel cannot be arranged near the body without
        // overlapping its neighbours, and treating that as a collision
        // tangles the garment before a seam has closed (assemble.js).
        selfCollision,
        // Contact thickness is floored against the mesh and the field in
        // drapewasm for the drape; the sewing wants the same floor for the
        // same reason, so it is passed rather than defaulted.
        thickness: Math.max(0.4, cell * 0.8),
        friction: 0.4,
      },
    });
    // GRAVITY OFF. The seams have to travel a long way and doing that while
    // the cloth is also falling fills a nearly inextensible mesh with strain
    // it can never work back out (assemble.js phase 2).
    this.cloth.setGravity(0, 0, 0);
    this.cloth.setHinges(bendingStencils(asm), f.rigidity, BEND_SCALE);
    this.cloth.setBendSweeps(bendSweeps);
    this.cloth.setStitches(stitches);
    // Softer than the cloth, so when seam and fabric disagree the SEAM
    // yields -- the same ratio cloth.js uses.
    this.cloth.setStitchParams(f.stretchAlpha * stitchSoftness, maxTensionGf, 1);
    this.cloth.setSewSpeed(sewSpeedCmPerSec, sewSlackCm);
    // The ceiling the springs cannot express. Last stage of the substep, so a
    // seam that closed by stretching the cloth is pulled back and the residual
    // gap stays the measurement.
    this.cloth.setStrainLimit(f.maxStrain, strainPasses);
    for (let i = 0; i < asm.verts.length; i++) {
      if (asm.pinned[i]) this.cloth.pin(i, true);
    }
    this._best = Infinity;
    this._sinceBest = 0;
  }

  /** Put the thread in and start feeding. */
  start() { this.cloth.armStitches(true); return this; }

  /** Stop feeding, leaving the seams holding wherever they got to. */
  stop() { this.cloth.setSewSpeed(0); return this; }

  /**
   * Has the sewing stopped getting anywhere?
   *
   * THIS IS THE END CONDITION THAT MATTERS, not "the feed is spent". A dart
   * cut deeper than the body has room for cannot close, however much thread
   * is fed at it: the feed then waits for cloth that is never going to catch
   * up, and a pass with no stall test runs for ever with the seam sitting at
   * the same gap. Stopping the moment it stops improving is what leaves the
   * garment on screen WHERE IT GOT TO, with the open darts visible and
   * measurable -- which is the answer a fitting wants, and the whole reason
   * the stitch is force-limited rather than forced shut.
   *
   * @param frames  how long nothing may improve before the pass is declared
   *                stalled, at 60 a second
   * @param epsCm   what counts as an improvement
   */
  stalled(frames = 90, epsCm = 0.002) {
    return this._sinceBest > frames && this._best < Infinity;
  }

  /** The gap it got to, and the gap it has been stuck at. */
  progress() {
    return { bestCm: +this._best.toFixed(3), stuckFrames: this._sinceBest };
  }

  /** One frame. The positions are written back into the assembly, so every
   *  reader of `asm.verts` -- the viewer's mesh, clearance.js, the seam
   *  report -- sees the same garment the solver does. */
  step(dt = 1 / 60) {
    this.cloth.step(dt, this.substeps);
    const gap = this.maxGapCm();
    if (gap < this._best - 0.002) { this._best = gap; this._sinceBest = 0; }
    else this._sinceBest++;
    const p = this.cloth.positions();
    const V = this.asm.verts;
    for (let i = 0; i < V.length; i++) {
      V[i][0] = p[i * 3]; V[i][1] = p[i * 3 + 1]; V[i][2] = p[i * 3 + 2];
    }
    return this;
  }

  isSewing() { return this.cloth.isSewing(); }

  /**
   * Write the solver's stitch state back onto the caller's own stitch
   * records: the rest length the feed has reached, the tension, the peak.
   *
   * This is what lets the viewer keep ONE set of stitch objects while the
   * sewing runs somewhere else. Every reader it already had --
   * `sim.remainingFeedCm()`, `sim.isSewing()`, the seam report, the HUD --
   * goes on working unchanged, because the records they read are kept true
   * rather than replaced. Rule 7, applied to a backend swap: the two paths
   * have to leave the same state behind, or everything downstream quietly
   * reads the state of the one that is no longer running.
   */
  mirrorOnto(stitches) {
    const rests = this.cloth.stitchRests();
    const tens = this.cloth.stitchTensions();
    const peaks = this.cloth.stitchPeaks();
    this.stitches.forEach((st, k) => {
      const target = stitches ? stitches[k] : st;
      if (!target) return;
      target.rest = rests[k];
      target.tensionGf = tens[k];
      if (peaks[k] > (target.peakGf || 0)) target.peakGf = peaks[k];
      target.feeding = rests[k] > 0;
      target.active = true;
    });
  }

  feedLeftCm() { return this.cloth.feedLeftCm(); }

  /** The widest gap still open, cm -- the headline number of the phase. */
  maxGapCm() {
    const g = this.cloth.stitchGaps();
    return g.length ? Math.max(...g) : 0;
  }

  /** Per stitch, with the pattern's own labels on it, so a report can say
   *  WHICH seam rather than which index. */
  seamReport() {
    const gaps = this.cloth.stitchGaps();
    const peaks = this.cloth.stitchPeaks();
    const by = new Map();
    this.stitches.forEach((st, k) => {
      const id = st.seam || (st.pa === st.pb ? `dart@P${st.pa}` : `P${st.pa}-P${st.pb}`);
      if (!by.has(id)) by.set(id, { seam: id, stitches: 0, maxGapCm: 0, peakGf: 0 });
      const r = by.get(id);
      r.stitches++;
      if (gaps[k] > r.maxGapCm) r.maxGapCm = gaps[k];
      if (peaks[k] > r.peakGf) r.peakGf = peaks[k];
    });
    return [...by.values()].map((r) => ({
      ...r,
      maxGapCm: +r.maxGapCm.toFixed(3),
      peakGf: +r.peakGf.toFixed(0),
    }));
  }

  dispose() { this.cloth.dispose(); }
}

/**
 * Sew a laid-out garment to completion, headless: the counterpart of
 * `assembleGarment`'s stitching phase, for the trace and the tests.
 *
 * Stops when the feed is spent and the cloth has caught up, or at
 * `maxSeconds` -- a seam that cannot close is the measurement, not a reason to
 * run for ever.
 */
export async function sewWasm(asm, stitches, surface, opts = {}) {
  const {
    dt = 1 / 60, maxSeconds = 8, settleSeconds = 1.0, onFrame = null, ...rest
  } = opts;
  const mod = await sewclothModule(opts.moduleUrl);
  const sew = new WasmSewing(mod, { asm, stitches, surface, ...rest });
  sew.start();
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  let frames = 0;
  const maxFrames = Math.round(maxSeconds / dt);
  while (frames < maxFrames) {
    sew.step(dt);
    frames++;
    if (onFrame) onFrame(asm.verts, frames);
    if (!sew.isSewing() || sew.stalled()) break;
  }
  // A quiet settle once the feed is spent, so the seams converge against the
  // stretch constraints rather than being read mid-pull.
  const settle = Math.round(settleSeconds / dt);
  for (let f = 0; f < settle; f++) { sew.step(dt); frames++; }
  const ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
  const out = {
    frames, ms, msPerFrame: ms / frames,
    stalled: sew.stalled(),
    ...sew.progress(),
    maxGapCm: +sew.maxGapCm().toFixed(4),
    feedLeftCm: +sew.feedLeftCm().toFixed(4),
    seams: sew.seamReport(),
  };
  sew.dispose();
  return out;
}
