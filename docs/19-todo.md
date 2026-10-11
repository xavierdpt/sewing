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

- [ ] **Fix the discrete bending model's normalisation against element size,
      against an analytic ground truth.**
      [18-validation.md](18-validation.md) §6.8. On a valid Peirce measurement
      — width-independent, converged, specimen length solved for — denim
      measures `c` = 2.105 cm at a 0.275 cm row and 1.208 cm at a 0.183 cm
      row: **1.74× for a 1.5× refinement**, finer being limper. Eliminated
      already: the instrument, the specimen geometry, solver convergence (3×
      sweeps and 3× substeps move it by 0 and 2 %), and the obvious reading of
      the compliance formula, which is the standard `k = D·|e|²/A_e`.

      *Done so far:* the analytic ground truth exists —
      `node tools/fabric.mjs --beam`, using `δ = L⁴/8c³` (the weight cancels
      because `D = w·c³`), reporting the measured drop against the closed
      form, `δ/L` so the validity of the linear regime is visible, and
      `c_eff = (L⁴/8δ)^⅓`. It says denim droops **3.5× to 157×** more than
      theory, worsening with refinement, and that `c_eff` moves with the span
      as well as the row size — so this is **not** a constant calibration
      error. See §6.8 for the table and the three candidate mechanisms.

      *Still to do:* establish the
      scaling exponent from three or more refinement points before touching
      `g.alpha = g.area / (BEND_SCALE · rigidity · g.len²)`, and check the
      hinge stencil's `area` and `len` are the quantities that formula assumes
      (combined area of both triangles, and the shared edge).

      *Acceptance:* tip deflection within 5 % of the closed form at three row
      sizes, then Peirce `c` within 5 % over a 3× refinement. Only then re-fit
      `BEND_SCALE` against the published ranges and rewrite Step 3's table.
      Gate it: this is a tuned constant in a tuned system, baseline 276 pass /
      2 fail.

      *Why it is first:* bending is the only axis of the model nominally
      calibrated against published values, and it currently has no
      mesh-independent value at all — so every preset, every drape result and
      the whole shear and plasticity programme downstream of it are resting on
      a number that changes when the mesh does.

      *Note on cost:* `--rows 24` timed out three times at 550 s on both
      fabrics, and the obvious vertex count (~700 for the denim cell) does not
      explain it. Find out why before scaling the refinement sweep up. The
      `--beam` check is far cheaper per data point and needs no bisection, so
      prefer it for the convergence study.

      *Note on scope:* this is a correctness defect in the constitutive model,
      not a tuning job, and it should start from reading `bendingStencils` and
      `_solveHinges` rather than from a sweep. Deliberately left for a fresh
      session rather than hacked at the end of a long one.

---

## Done

Removed from the queue and recorded in [18-validation.md](18-validation.md):

- **Settle whether the fine-mesh penetration floor is real or a statistic** —
  done 2026-10-11. `penetration()` now reports the distribution behind its
  maxima. The extent converges monotonically — 4.55 % → 1.16 % → 0.31 % of
  sampled points inside the body at edges 2.2 / 1.5 / 1.1, a 15× reduction —
  so contact is converging and the "floor" was not a defect. The depths do
  not converge, because at the fine end only ~34 points are inside at all and
  a p95 over those is its second-worst member. Rule: compare `insidePct`,
  never `deepestEdgeCm` or a percentile, across mesh sizes. Recorded at
  [18-validation.md](18-validation.md) §6.6.

- **Swap the accordion gate check from a stack-height ratio to
  `deepOverlaps`** — done 2026-10-11. The old control wanted contact-on to
  stack 5× taller than contact-off, which only worked while a crease had no
  radius; a real fillet gives the limp control loft of its own and the ratio
  fell to 2.5× *while the thickness model got better*. The check now asserts
  the proposition — pairs more than half a thickness through each other — and
  reads 5 against 35,206, a 7,000× discrimination. Threshold not loosened:
  20× margin with a floor of 20. **Gate 277 pass / 1 fail**, back to its
  pre-session count, the remaining failure being the dart's guessed strain
  limits (§8.5). Recorded at [18-validation.md](18-validation.md) §6.3.

- **A substep floor, or a warning, for the run that slid off the body** —
  done 2026-10-11. Swept a wool crepe disc: 2 substeps slides off entirely
  (97 cm, never settles), 4 is confidently wrong (names the shoulder instead
  of the neck, grain at 1.9× the tear limit, body 2.3 cm through the cloth),
  6 is the floor for a right answer and 10 for the strain limit to hold.
  `healthy()` catches none of it — it only looks for NaN. The obvious
  diagnostic failed: the strain limiter's residual is zero at every substep
  count, since it converges to its ceiling every time. The signal that works
  is `report().grainOverLimit`, the grain strain against the fabric's own
  `maxStrain`, which warns once above 1.2 — 1.88 at 4 substeps, 0.80 at 10,
  0.36 at 16. Recorded at [18-validation.md](18-validation.md) §6.7.

- **Make the cantilever an actual Peirce test: bisect the overhang** — done
  2026-10-11. `peirce()` solves for the free length by regula falsi on the tip
  angle and reports `c = L/2` with its convergence state. Width-independent
  (0.501 / 0.500 / 0.498 at widths 5 / 2 / 1.5), converges in 5 settles on
  denim with the bracket centred on `L = 2c`, and the specimen-length
  dependence that invalidated every earlier verdict is gone by construction.
  **Mesh-independence fails** — 1.74× over a 1.5× refinement — and that
  failure is now attributable to the solver, which is the handoff this item
  existed to produce. Two bugs of mine fixed inside it: the mesh sized from
  the trial length (self-referential runaway to a 0.45 cm specimen), and a
  silently exhausted settle budget. Recorded at
  [18-validation.md](18-validation.md) §6.9, §6.8 and Step 3.


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
