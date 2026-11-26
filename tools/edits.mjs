// The cutting table's edits, run headlessly: every operation on one pattern,
// with what each one costs.
//
//   node tools/edits.mjs                 all of them, on the darted skirt
//   node tools/edits.mjs --only true     one of them
//   node tools/edits.mjs --darts         just the closed-dart profile
//
// This is the instrument for app/js/patternedit.js the way tools/trace.mjs is
// the instrument for the sewing: every edit the viewer can make is applied
// here, in the same order a person would, and the numbers it prints are the
// ones the acceptance in docs/19-todo.md is written against. The viewer and
// this path call the SAME functions (rule 7) -- the only thing the viewer adds
// is the drag that chooses the arguments.
import { Body } from '../app/js/body.js';
import { flaredSkirtPattern, waistRing } from '../app/js/skirt.js';
import { dartedSkirt } from '../app/js/skirtdarts.js';
import {
  movePiece, turnPiece, mirrorPiece, splitPiece, joinPieces,
  closedDartProfile, trueDarts, editList, replayEdits, check,
} from '../app/js/patternedit.js';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const wants = (name) => !only || only === name;

const body = new Body();
body.includeArms = true; body.includeLegs = true;
const waistV = body.landmarkV('waist');
const ring = waistRing(body, { waistV, ease: 1.0 });
const draft = (waistCm) => flaredSkirtPattern({
  panels: 4, waistCm, hemCm: 160, lengthCm: 55, gather: 1.0, edge: 3.0, waistV,
});
const cut = dartedSkirt(draft, { waistCm: ring.circumferenceCm, scale: 2 });
const fresh = () => dartedSkirt(draft, { waistCm: ring.circumferenceCm, scale: 2 }).pattern;
// the UNDARTED draft the fixture's darts were cut into: what a replay starts
// from. Replaying darts onto a pattern that already has them asks for a wedge
// where the cloth has already gone, which is refused -- correctly.
const base = () => draft(ring.circumferenceCm + cut.allowanceCm);

const show = (title, obj) => {
  console.log(`\n=== ${title}`);
  console.table(obj);
};
const state = (p) => ({
  pieces: p.panels.length,
  seams: (p.seams || []).length,
  darts: p.panels.reduce((n, q) => n + (q.darts || []).length, 0),
  areaCm2: +p.panels.reduce((a, q) => a + (q.areaCm2 || 0), 0).toFixed(1),
  ok: check(p).ok,
});

let pattern = fresh();
show('the pattern as drafted and darted', [state(pattern)]);

if (args.includes('--darts') || wants('profile') || wants('true')) {
  const before = closedDartProfile(pattern);
  show('every dart, folded shut: the step and the turn it leaves in the edge', before.darts);
  console.log(`  step  worst ${before.step.worst} cm, mean ${before.step.mean} cm`);
  console.log(`  turn  worst ${before.turn.worst} deg, mean ${before.turn.mean} deg`);
  if (args.includes('--darts')) process.exit(0);
}

if (wants('true')) {
  const r = trueDarts(pattern);
  pattern = r.pattern;
  show('truing every dart', [{
    darts: r.darts, trued: r.trued,
    stepWorstBefore: r.stepBeforeCm.worst, stepWorstAfter: r.stepAfterCm.worst,
    turnWorstBefore: r.turnBeforeDeg.worst, turnWorstAfter: r.turnAfterDeg.worst,
  }]);
  if (r.failed.length) console.log('  could not true:', r.failed.join('; '));
  show('and the pattern after it', [state(pattern)]);
}

if (wants('move')) show('move piece 0 by (5, -3) cm', [movePiece(pattern, 0, { dx: 5, dy: -3 })].map(({ movedCm }) => ({ movedCm })));
if (wants('turn')) show('turn piece 0 by 12 deg about its centre', [turnPiece(pattern, 0, { degrees: 12 })].map(({ degrees, about }) => ({ degrees, about: about.join(', ') })));

if (wants('mirror')) {
  const r = mirrorPiece(pattern, 0, { axis: 'y', mode: 'copy' });
  pattern = r.pattern;
  show('mirror piece 0 (cut 2, one reversed)', [{ mode: r.mode, name: r.name, pieces: r.pieces }]);
  show('after it', [state(pattern)]);
}

if (wants('split')) {
  const p0 = pattern.panels[0];
  const xs = p0.pts.map((q) => q.x), ys = p0.pts.map((q) => q.y);
  const midx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const r = splitPiece(pattern, 0, { from: [midx, Math.min(...ys) - 10], to: [midx, Math.max(...ys) + 10] });
  pattern = r.pattern;
  show('cut piece 0 in two down the middle', [{
    names: r.names.join(' + '), shared: r.sharedPoints,
    cutLengthCm: r.cutLengthCm, areaLostCm2: r.areaLostCm2, pieces: r.pieces,
  }]);
  show('after it', [state(pattern)]);

  // and a cut the other way: ACROSS the piece, so it leaves through the two
  // side seams rather than the free waist and hem. That is the case where the
  // neighbouring piece has to be cut to match, and it is the one the page
  // found a 0.26 cm seam mismatch in.
  {
    const q = fresh().panels[1];
    const ys = q.pts.map((v) => v.y), xs = q.pts.map((v) => v.x);
    const midy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const across = splitPiece(fresh(), 1, {
      from: [Math.min(...xs) - 10, midy], to: [Math.max(...xs) + 10, midy],
    });
    show('cut piece 1 ACROSS, through its two side seams', [{
      names: across.names.join(' + '), shared: across.sharedPoints,
      neighboursCut: across.neighboursCut, pieces: across.pieces,
    }]);
    const c2 = check(across.pattern);
    console.log(`  ${c2.ok ? 'checks out' : 'PROBLEMS: ' + c2.problems.join('; ')}`
      + `  worst seam mismatch ${c2.worstSeamMismatchCm} cm`);
  }

  if (wants('join')) {
    try {
      const j = joinPieces(pattern, 0, 1, { toleranceCm: 0.5 });
      pattern = j.pattern;
      show('and join them back together', [{
        name: j.name, welded: j.weldedPoints, worstCm: j.worstCm, meanCm: j.meanCm,
        over: j.overToleranceOf, pieces: j.pieces,
      }]);
      show('after it', [state(pattern)]);
    } catch (err) {
      console.log(`\n=== joining them back refused: ${err.message}`);
    }
  }
}

if (wants('edits')) {
  show('the edits this pattern carries', editList(pattern));
  const onFresh = replayEdits(base(), pattern.edits);
  show('replayed onto the draft they were cut into', [{
    applied: onFresh.applied, skipped: onFresh.skipped.length, ...state(onFresh.pattern),
  }]);
  if (onFresh.skipped.length) console.log('  skipped:', onFresh.skipped.join(' | '));

  // the fit test: the same edits onto a pattern drafted for a bigger waist
  const wider = draft(ring.circumferenceCm + cut.allowanceCm + 6);
  const onWider = replayEdits(wider, pattern.edits);
  show('replayed onto a skirt drafted 6 cm wider in the waist', [{
    applied: onWider.applied, skipped: onWider.skipped.length, ...state(onWider.pattern),
  }]);
  if (onWider.skipped.length) console.log('  skipped:', onWider.skipped.join(' | '));
}

const c = check(pattern);
console.log(`\n${c.ok ? 'the pattern still checks out' : 'PROBLEMS: ' + c.problems.join('; ')}`);
