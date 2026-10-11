# 19 — TODO

The working queue for [18-validation.md](18-validation.md).

**How this document is maintained.** New items are added **on top**, so the
newest candidate is always the first thing read. When an item is done it is
removed from here and **referenced from its place in
[18-validation.md](18-validation.md)** — against the step, artifact or decision
it settled, with the numbers it produced. The consequence is the point: because
finished work is recorded there and only unfinished work lives here,
`18-validation.md` can be read directly to find the next simple candidate —
anything it describes that carries no "done" reference is still open, and the
short ones are the candidates. This document is the queue; that one is the
record.

---

## Open

- [ ] **Make the cantilever an actual Peirce test: bisect the overhang.**
      [18-validation.md](18-validation.md) §6.9. The tool clamps a fixed
      overhang and finds where along it the chord crosses 41.5°; the Peirce
      test slides the specimen out until *the tip* reaches 41.5° and reports
      `c = L/2`. Only the second is a material property. Measured on silk
      habotai at edge 0.4, varying only the specimen length: no crossing at
      4 cm, 2.423 at 6, 1.204 at 10, 0.588 at 30 — a 4× spread from a
      parameter that must not appear in the answer, with the default at the
      worst end.

      *Do:* bisect the free length until the tip chord angle is 41.5°, then
      report `c = L/2`. Each trial is a short strip and cheap. Keep the
      within-row interpolation for locating the tip angle, and keep
      `rowsToCrossing` as the resolution guard. A sensible bracket is
      0.5–8× the asked bending length.

      *Acceptance:* the reported `c` is independent of the initial bracket and
      of the specimen width, and mesh-independent to within 5 % over a 3×
      refinement. Then re-run all seven presets and rewrite Step 3's table a
      third time — and only then is §6.8's calibration question answerable.

      *Why it is first:* every bending verdict this project holds is
      conditioned on an arbitrary 30 cm overhang, so the one axis of the model
      that is nominally calibrated against published values currently has no
      valid measurement at all. `BEND_SCALE` cannot be fitted against a
      quantity the literature does not report.

---

## Done

Removed from the queue and recorded in [18-validation.md](18-validation.md):

- **Fix the cantilever readout so it stops quantising to `edge/2`** — done
  2026-10-11, and it uncovered two deeper faults. The interpolation works: the
  scan is monotone and repeat-free (0.412 … 9.607 against the old
  0.75 / 0.75 / 0.75 / 1.50 …). The tool now also reports `rowsToCrossing`,
  `rowPitchCm` and `resolved`, and refuses a stiffness verdict when the
  crossing falls inside fewer than two rows — the limp presets were all in
  that state at the default settings. But mesh-independence still fails and
  does not converge (0.403 / 0.470 / 0.588 / 0.442 at edges 1.0 / 0.6 / 0.4 /
  0.25), and the cause is §6.9: the test is not Peirce's, and its answer
  depends on the specimen length. Carried as item 1. Recorded at
  [18-validation.md](18-validation.md) Step 3, §6.8 and §6.9.


- **Fix the cantilever readout so it stops quantising to `edge/2`** — done
  2026-10-11. The 41.5° crossing is interpolated within the row. The scan is
  monotone and repeat-free (0.412 … 9.607 against the old 0.75 / 0.75 / 0.75
  / 1.50 …), all seven verdicts re-run and rewritten, and silk habotai's old
  readings withdrawn as artifacts. **Mesh-independence still fails** (1.95×
  over a 3× refinement, was 3.0×) and that residue is the solver's, now
  carried as item 1 and §6.8. Also un-withdrew interfaced twill's "1.6× too
  stiff": 9.76 interpolates to 9.587, so quantisation was never its problem.
  Recorded at [18-validation.md](18-validation.md) Step 3.


- **Find which pre-session `cloth.js` change regressed the dart seam
  closure** — done 2026-10-11. It was the replacement of cross-spring bending
  with dihedral hinges on Peirce bending lengths, and **it is not a defect**:
  linen's 2.3 cm is inside its published 2.0–2.6 range, and the dart gap
  tracks bending stiffness monotonically (0.252 cm at 2.3, 0.097 at 1.0,
  0.026 at 0.3 — the old model behaved like 0.3). What actually stops the
  seam is the cloth's **guessed** 3 % strain ceiling: `seamsAtTheLimit: 0`,
  `peakTensionGf: 28`, `maxStretchPct: 3`. Raising it to any measured value
  from `sim/cipc/fabrics.md` closes the dart (0.185 cm at 6.1 %, 0.030 at
  13.4 %). Same root cause as §6.6. Recorded at
  [18-validation.md](18-validation.md) §6.3; the fix is §8 decision 5.

- **Attribute the dart-closing gate failure against a pristine checkout** —
  done 2026-10-11. Clean worktree at `d9d6f01`: **268 pass, 0 fail**, dart
  check **0.029 cm**. Working tree: 0.252 cm. Therefore a regression from
  uncommitted work, not committed code. Recorded at
  [18-validation.md](18-validation.md) §6.3.
