# The `measure the model` button is removed — TODO

The working queue for its spec,
[measure-button-spec.md](measure-button-spec.md). The two are a pair in
`todos/` (rule 11): the spec holds the requirements and the resolved
questions, this document holds the work they imply. The cycle is read the
spec, pick the next item, add it on top here with an identifier, do it, mark
it done here, and reference it from the spec. An identifier is never reused
or renumbered.

---

## Open

**Opened 2026-11-27**, from the user: *"Remove that button."* The spec's §1
has the two sites and the evidence that the gate already asks the question
the button asked.

- [x] **1. Delete the control and `measureTable`. DONE 2026-11-27.** `app/js/main.js` only,
      the two sites of the spec's §1 table. `Body.measure()` and its six gate
      call sites are untouched (spec §2 question 1), and so are the two
      console-only readouts in the arms dialog (question 3).
      *Acceptance:* the spec's §3 criteria 1 and 2.
      **Done.** Both sites deleted whole, plus the orphaned doc comment
      `/** What a tape would read off the model ... */` the function left
      behind — a comment with nothing under it is the next reader's wrong
      turn. `node --check` passes and `grep -rn "measure the model\|measureTable"
      app/ tools/ test/` is **empty** (criterion 1).
      *Measured on the repository copy, `tools/viewshot.py`, exit 0:* the
      `size and units` dialog has **3** rows — `standard size`, `units`,
      `reframe the view` — and the other four body dialogs are unchanged at
      **21 / 4 / 4 / 14** (criterion 2).

- [x] **2. Rebuild the container and drive both pages. DONE 2026-11-27.** Rule 12, and the
      spec's §3 criterion 3: `appdocker.sh build && stop && start`, then
      `viewshot.py` on the repository copy and again with `--url
      http://127.0.0.1:8777`, with the served `diff` reported.
      **Done.** `appdocker.sh build` (exit 0), `stop`, `start`; served
      `js/main.js` **identical** to the working tree and **0** hits for
      `measureTable`. Driven on `:8777`, exit 0: bar `body · files · cloth ·
      tests`, `size and units` reading `standard size`, `units`, `reframe the
      view`, the other four dialogs at **21 / 4 / 4 / 14**, and **0** GUI
      rows matching `/measure the model/i` (criterion 3).
      *One thing the run caught:* the first `curl` after `start` returned
      **nothing** and the `diff` reported the served file as 0 lines — the
      container was up but not yet listening. The comparison was re-run
      against `appdocker.sh status` showing `Up 32 seconds`. A `diff` that
      says "empty" is not the same as a page that says anything, and the
      first reading would have been reported as a difference that did not
      exist.

- [x] **3. The gate. DONE 2026-11-27.** The spec's §3 criterion 4, **306 pass / 0 fail**,
      counted with `grep -c '^  PASS'`.
      **Done: 306 PASS, 0 FAIL, exit 0, `ALL CHECKS PASSED`**, which confirms
      the spec's §3 criterion 4 prediction. The run was started before the
      deletions and covers them: `test/run.mjs`'s 24 imports are at its lines
      3-26 and `app/js/main.js` is not among them, so nothing these three
      removals touched is reachable from the suite. That is the same
      reasoning `show-body-todo.md` item 2 wrote down, re-checked here rather
      than quoted.

- [x] **4. Correct the documents and the tree. DONE 2026-11-27.** The spec's §3 criterion 5:
      `docs/10-body.md` §2, [17-interface.md](../docs/17-interface.md)'s bar
      table, and the node *The menubar and its floating dialogs* (id 14),
      which lists the dialog's contents.
      **Done.** `docs/10-body.md` §2 said *"the viewer has a measure the
      model button that prints the table"* — it now names the gate's six
      `Body.measure()` call sites as what runs that check, records the
      removal and its reason, and states what the page does and does not
      show (the HUD prints `torso.M`, the asked measurements, not the
      model's). [17-interface.md](../docs/17-interface.md)'s bar table lists
      `size and units` with three rows and says why the fourth went. The
      tree needed no correction: node 14 *The menubar and its floating
      dialogs* describes the dialog without listing its rows, and node 11
      *The body is generated from measurements* matched a text search only
      on `measure()`'s own description, not on the button.

- [x] **5. Remove the two other console-only readouts. DONE 2026-11-27.**
      Opened by the user after they were reported under rule 10 as
      identified-not-changed: *"Then remove those two other console-only
      readouts."* `hem clearance in this pose` and `measure the armscye`,
      `app/js/main.js`, 27 lines including both inline bodies. The spec's §2
      question 3 is amended from *no* to *yes* and says what is lost.
      `torso.legSpanAt` and `torso.armscye` are untouched: five other callers
      between them, `main.js:419` (the armscye lines), `tools/poses.mjs:46`
      and `test/run.mjs:245, 270, 299`.
      *Measured on the repository copy and on the served container, both
      `tools/viewshot.py` at exit 0, after `appdocker.sh build`/`stop`/`start`
      and with served `js/main.js` diffing **identical**:* the `arms, legs
      and poses` dialog holds **12** rows — pose, six joint angles, five
      show/collide flags — where it held 14; the other four body dialogs are
      **3 / 21 / 4 / 4**; **0** GUI rows match `/measure the model|hem
      clearance|measure the armscye/i`; the bar still reads `body · files ·
      cloth · tests` and the panel still holds its ten sections.
      **Identified, not changed (rule 10):** the same shape survives in
      **sixteen** other GUI rows outside the body — `fCloth` `report`,
      `fSkirt`, `fSew`, `fSide`, `fTable` `measure the pattern`, `fView`
      `log worst seams`, and the drop tests' `measure the heap` — each a
      control whose whole output is a `console.table` nobody at the viewer
      sees. They are not this pair's: the user asked about the body's.

## Done

Items 1-5, 2026-11-27, marked in place above. Three controls removed, all of
them answering into a browser console: `measure the model`, `hem clearance in
this pose`, `measure the armscye`. The gate is **306 pass / 0 fail**, the
served page on `:8777` is byte-identical to the working tree, and
`docs/10-body.md` is the one document that had claimed one of them exists.
