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

- [ ] **Calibrate the bending model: asked vs achieved, and its mesh
      dependence.** [18-validation.md](18-validation.md) §6.8. With the
      cantilever no longer quantising, two defects are visible. Measured over
      asked across the presets is 0.46, 0.75, 0.58, 0.45, 0.45, 1.12, 1.92 —
      limp cloths come out at ~0.45× the bending length they were given and
      stiff ones at up to 1.9×, crossing near 3 cm, leaving six of seven
      presets outside their published range. And the achieved length depends
      on the mesh: silk habotai reads 0.403 / 0.496 / 0.533 / 0.786 cm at
      edges 1.0 / 1.5 / 2.2 / 3.0, so refining makes the cloth limper by ~2×
      over a 3× refinement.

      *Do:* the hinge compliance is
      `g.area / (BEND_SCALE · rigidity · g.len²)` — check that normalisation
      against element size first, since a mesh-dependent stiffness will also
      show up as an asked-vs-achieved error at whichever edge the calibration
      was done at. Then re-fit `BEND_SCALE` against the published ranges with
      `node tools/fabric.mjs --scan`, and confirm with an edge sweep.

      *Acceptance:* achieved bending length within 5 % over a 3× refinement,
      and asked-vs-achieved within 10 % across the full 0.8–5.0 cm range.
      Re-run all seven presets and record the verdicts in
      [18-validation.md](18-validation.md) Step 3. Then re-run the gate: this
      changes a tuned constant, so it needs a baseline (currently 276 pass /
      2 fail) and a regression run.

      *Why it is first:* bending is the only axis of the model nominally
      calibrated against published values, and it is out by up to 1.9× and
      mesh-dependent. Fitting shear (Step 4) or plasticity (Step 6) on top
      would fit the error. It also explains the interfaced twill reading as
      sheet metal: the preset asks for 5.0 cm, the solver delivers 9.59.

---

## Done

Removed from the queue and recorded in [18-validation.md](18-validation.md):

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
