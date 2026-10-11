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

- [ ] **Decide §8.6: accept, pay, or rewrite the bending solve.** Nothing
      smaller is now blocking, and the three options are measured
      ([18-validation.md](18-validation.md) §6.8). This one is a decision
      rather than a task, so it sits here until it is made.

      *If "accept":* the work is documentation plus a `--calibrated` preset
      (160 substeps) for headless runs, and re-running the Peirce table there.
      Half a day.

      *If "pay":* raise the default budget, then gate and profile — it trades
      directly against §6.5, where the viewer already cannot afford what it
      spends.

      *If "rewrite":* implicit or hierarchical bending. Substantial, and the
      only option that makes calibrated bending affordable interactively.

      *Free either way, but not yet licensed:* reallocating the existing
      budget toward substeps is 2.3× more accurate at identical cost
      (80/1/1 against the defaults' 10/8/8), which is what `cloth.js:142`
      says XPBD wants. It needs the disc, the skirt and the gate first,
      because the beam cannot see the closed-ring case that `stretchSweeps: 8`
      exists for.

---

## Done

Removed from the queue and recorded in [18-validation.md](18-validation.md):

- **Converge the bending solve, or make it converge cheaply** — done
  2026-10-11: the cost is measured and the answer is that it cannot be made
  cheap by tuning. Work per frame is `substeps × (stretch + bend sweeps)` and
  the defaults spend 160. Reaching 10 % accuracy needs 2560 — **16×** — at
  160 substeps. Substeps dominate sweeps at equal cost (160/8/8 at 2560 beats
  80/8/32 at 3200), correcting an earlier note here that said the reverse.
  Reallocating the existing 160 toward substeps gives 2.3× for free but not
  the 30× needed. So the remedy is a decision, now §8.6, and the long-term
  answer is an implicit solve rather than a constant. Recorded at
  [18-validation.md](18-validation.md) §6.8.


- **Fix the discrete bending model's normalisation against element size** —
  done 2026-10-11, and **there was nothing wrong with the normalisation.**
  Driven to 80 substeps and 32 sweeps the solver matches closed-form beam
  theory to 13 % and the asked bending length to 4 %, `BEND_SCALE = 30`
  unchanged — so `k = BEND_SCALE·D·|e|²/A_e` is right and the stencil's `len`
  and `area` are the right quantities. The deficit is **under-convergence**:
  `c_eff` goes 0.90 → 1.26 → 1.96 → 3.17 as substeps and sweeps rise, against
  an asked 3.3. The apparent mesh-dependence follows, since convergence
  quality falls as the element count rises. `cloth.js`'s own comment on
  `BEND_SCALE` had named the mechanism; what it could not know was that the
  instrument it was fitted against returned `edge/2`. Recorded at
  [18-validation.md](18-validation.md) §6.8; the remaining cost decision is
  item 1.


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
