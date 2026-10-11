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

- [ ] **Fix the cantilever readout so it stops quantising to `edge/2`.**
      [18-validation.md](18-validation.md) Step 3. The Peirce overhang is
      found by walking triangle rows, so the measured bending length can only
      land on `n × edge/2`: at edge 1.5, asked-for lengths of 0.8, 1.1 and
      1.4 cm all read back 0.75, and silk habotai reads 0.50 / 0.75 / 1.13 /
      1.50 at edges 1.0 / 1.5 / 2.2 / 3.0 — `edge/2` every time. Every bending
      verdict in the preset table is therefore an artifact, including a
      spurious "in range".

      *Do:* interpolate the 41.5° chord crossing within a triangle row instead
      of snapping to the row boundary, then re-run all seven presets and
      rewrite the verdicts. Withdraw the claims listed in Step 3.

      *Acceptance:* the `--scan` measured column tracks the asked column
      continuously with no repeated values, and silk habotai's bending length
      is mesh-independent to within 5 % over a 3× refinement.

      *Why it is first:* it needs no decision and no physical measurement, it
      is confined to one tool, and bending is the only axis of the model that
      is nominally calibrated — so every other calibration claim rests on a
      readout that currently cannot resolve the fabrics it is judging.

---

## Done

Removed from the queue and recorded in [18-validation.md](18-validation.md):

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
