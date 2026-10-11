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

- [ ] **Find which pre-session `cloth.js` change regressed the dart seam
      closure.** Committed code closes the dart to **0.029 cm**; the working
      tree closes it to **0.252 cm**, against a `< 0.2` threshold — an 8.7×
      regression, stable across every working-tree gate run of 2026-10-11 and
      therefore present before any of that day's `cloth.js` edits. The test
      code is identical in both versions and `drapejob.js` is ruled out, so it
      is in the uncommitted `cloth.js` diff from an earlier session.

      *Do:* read `git diff app/js/cloth.js` for anything touching seam closure
      — `sewSpeedCmPerSec`, `stitchSoftness`, `maxTensionGf`, `stitchCompliance`,
      the `_feedStitches` and `_solveStitches` logic — and confirm by reverting
      the suspect hunk in the pristine worktree's copy and re-running just that
      region of the gate. Note the clean-tree result is the *good* one, so the
      fix is to correct or revert the change, not to move the threshold.

      *Acceptance:* the specific change named, with the dart figure measured
      with and without it, and a decision recorded: keep and fix, or revert.
      Then re-run the full gate and update
      [18-validation.md](18-validation.md) §6.3.

      *Why it is first:* it is the one remaining gate failure that is a real
      regression rather than a test whose premise changed, and nothing else on
      the list can be gated cleanly while a known regression sits in the tree.

---

## Done

Removed from the queue and recorded in [18-validation.md](18-validation.md):

- **Attribute the dart-closing gate failure against a pristine checkout** —
  done 2026-10-11. Clean worktree at `d9d6f01`: **268 pass, 0 fail**, dart
  check **0.029 cm**. Working tree: 0.252 cm. Therefore a regression from
  uncommitted work, not committed code. Recorded at
  [18-validation.md](18-validation.md) §6.3.
