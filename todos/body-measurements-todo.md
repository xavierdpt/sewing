# The body answers its measurements — TODO

The working queue for its spec,
[body-measurements-spec.md](body-measurements-spec.md). The two are a pair in
`todos/` (rule 11): the spec holds the requirements and the resolved
questions, this document holds the work they imply.

**How this document is maintained.** The cycle is: read the spec, pick the next
item from it, add it **on top** here with an identifier, do it, mark it done
here, and reference it from the spec. Then read the spec again. An identifier
is never reused or renumbered once given, because code comments and the spec
cite it (`todos/body-measurements-todo.md item 2`). Work that is not this
spec's gets its own new spec + todo pair, not an item here.

---

## Open

**Opened 2026-11-28**, from the user: the measurements in centimetres look
strange, sample each one at a quarter and three quarters of its range, and
work out a methodology for improving the generator. The spec's §2 holds what
the first sweep found and §4 the four questions only the user can settle.

- [x] **11. Couple the measurements the chart relates, and warn when a
      relation is broken. DONE 2026-11-28.** `coupledEdit()` and
      `relationNotes()` in `app/js/body.js`; the bust control in
      `app/js/main.js` applies the first, `torso.advisory` carries the second
      and the HUD shows it in its own colour, apart from `warning` — a body
      that differs from a chart is unusual, not broken, and this project's
      premise is that standard sizes do not fit.
      The delta is taken against a `lastBust` kept by `refreshBody()`, because
      lil-gui writes the new value into `torso.m` BEFORE the edit-finished
      handler runs: the first version read it there, got a delta of zero and
      silently did nothing. Caught by driving it (rule 9), not by reading it.
      **Measured on the page:** bust 92 → 120 carries under bust to 104, waist
      to 100, low hip to 126; the body then measures exactly those, apex
      21.5 cm, no warning and no advisory. Before the coupling the same edit
      gave bust over underbust of 44 cm and a clamped underbust ring.

- [x] **10. Put the new checks in the gate. DONE 2026-11-28.** Spec §4
      question 6. Three sections added to `test/run.mjs`, needing no new tool
      after all, since `Body` imports headlessly: *the body answers its
      measurements, whatever was built before* (same numbers after an extreme
      one, and B-after-A equals B-after-C), *every standard size is a body the
      generator can actually build* (no `unmet` over the eleven chart rows,
      and each re-measures as what it was asked for), and *the rings of a body
      stay a loft* (every ring above the one below, every axis positive and
      finite). The loft check is the one that would have caught the detached
      slab mechanically.

- [x] **9. Make one half of a breadth/depth pair enough. DONE 2026-11-28.** Spec §4 question 5:
      `ratioOf` (`app/js/body.js:359`) uses a pair only when both halves are
      non-zero, so a width set alone is inert — 3 changed pixels in three
      sweeps. A value set alone applies against the default proportion for its
      partner. `ratioOf` now bisects for the ratio whose ring is that wide
      (or that deep) at the ring's girth.
      **Measured:** `hipWidth` at a quarter and three quarters of its range
      moves 12091 and 21467 pixels, `waistThickness` 5570 and 16602, where all
      four sat at 3 pixels before. `docs/10-body.md` §5 corrected in the same
      turn (rule 10).

- [x] **8. Surface what the generator already knows. DONE 2026-11-28.** Spec
      §4 question 3. The body HUD in `app/js/main.js` now calls
      `torso.measure()` and shows `asked → achieved` in the warning colour
      wherever the two differ by more than the solver's own 0.15 cm tolerance,
      and prints `torso.warning` underneath.
      **Measured on the page:** at bust 139 the HUD reads
      `139.0 → 129.8 cm / 76.0 → 111.5 cm` and *"ring heights clamped
      (underBust); apex to waist (front) off by 10.9 cm; bust off by
      -9.3 cm"*. The baseline body shows neither.
      *Acceptance:* the spec's §5 criterion 3.

- [x] **7. Make `build()` a function of its measurements. DONE 2026-11-28.**
      Spec §4 question 1 as resolved. `this.girthScale` was created once and
      carried between builds; it is now reset at the start of every build, and
      the calibration loop runs to `CALIBRATION_TOL` (0.05 cm) with a cap of
      `CALIBRATION_ROUNDS` (12) instead of a fixed three rounds. `unmet` is
      cleared per round so it describes the body that comes out rather than
      the rounds on the way to it, and the converged round breaks before
      touching anything so the body kept is the one that was measured.
      **Measured** with `tools/body_sweep.py --only bust --chain`, the run
      that found the fault: bust 92 → 76 → 139 → 92 now ends at **0 changed
      pixels**, bust apex 22.1 cm, 0.635 m², identical to boot. Before the
      change the same run ended at 4.9 cm and 0.610 m².
      *Acceptance:* the spec's §5 criterion 1.

- [x] **6. Re-derive the form's ranges from `SIZE_CHART`. DONE 2026-11-28.**
      `measurementRanges()` in `app/js/body.js` derives every bound — the
      chart's span widened by a quarter for girths and breadths, the chart's
      extremes carried across the stature range for lengths, the default body
      across the same range where the chart is silent, half to twice the
      default for the two leg girths (the weakest rule, and marked as such),
      and G/2 for a breadth, which is geometry rather than a survey.
      `MEASUREMENTS` and `SHAPE_PAIRS` are now key and hint only.
      Bust went from 45–170 to 68–140, low hip from 30–200 to 74–146, back
      length from 25–65 to 28–57.8.
      **The page now answers what its own form offers**, through `__ranges()`,
      and `tools/body_sweep.py` asks it instead of parsing `main.js` for
      literals that are no longer there (rule 9).
      `docs/10-body.md` §1 gained *The bounds, and the relations between them*
      in the same turn (rule 10).
      *Noted, not changed (rule 10):* the `hint` column of `MEASUREMENTS` is
      written for every field and displayed nowhere.

- [ ] **5. Answer the spec's §4 questions.** Blocked on the user; nothing
      below item 4 is decided without them. Items 1-4 are measurement and
      documentation, which §4 does not gate.

- [ ] **4. A numeric sweep, with no browser in it.** `tools/body_residual.mjs`,
      importing `app/js/body.js` directly: for every row, 20 points across its
      range, recording `asked`, the matching field of `measure()`, `unmet`,
      `warning` and the landmark heights. A body is milliseconds this way, so
      this is the instrument that can afford a fine grid and a cross-talk
      matrix — which output moves when which input is driven — where the
      screenshot sweep affords 2 points and a picture. **Proposed, not
      written** (rule 3): it is a new tool, so it waits for the user.
      *Acceptance:* the spec's §5 criterion 1 becomes measurable.

- [ ] **3. Name the mechanism behind the history dependence.** The spec's §2
      has a candidate — bisection bounds read from the `this.heights.*` of the
      previous build — and rule 1 says it stays a candidate until an
      instrument says otherwise. The cheapest test: build the same
      measurements from two different predecessors and compare `measure()`,
      which is item 4's tool, so this follows it.
      *Acceptance:* the spec's §5 criterion 1.

- [x] **2. Sweep every row against a freshly booted page. DONE 2026-11-28.**
      The chained first run measured the wreckage of the previous setting
      rather than the measurement its caption named (spec §2), so
      `tools/body_sweep.py` now reloads the page before every setting and
      re-takes the baseline as its last shot; `--chain` reproduces the old
      behaviour on purpose, which is how the contamination was demonstrated.
      *Acceptance:* the spec's §5 criterion 2.

- [x] **1. Build the sweep and the plates. DONE 2026-11-28.**
      `tools/body_sweep.py` and `tools/plate.py`, both new, both in `tools/`
      rather than in `/tmp` (rule 3), both driving the real page rather than
      reasoning from the source (rule 9). The sweep takes its ranges from the
      `MEASUREMENTS` and `SHAPE_PAIRS` tables of `app/js/main.js` so the two
      cannot drift apart, and sets each row through the real control — set the
      input, fire `input`, fire `blur` — which is what the knowledge tree's
      *Body controls update on release* records as the only thing lil-gui's
      `onFinishChange` answers to.
      **Done:** 43 shots over 21 rows at 1/4 and 3/4 of each range, plus the
      baseline; three plates of 15 cells.
