# The console-only readouts leave the page — SPEC

Paired with [console-readouts-todo.md](console-readouts-todo.md) (rule 11).
A new pair rather than another item on
[measure-button-spec.md](measure-button-spec.md): that one is the body's
three controls, decided one at a time; this is the rest of the page, decided
as a class.

## 0. The premise

**From the user, 2026-11-27**, after the body's three went: *"I don't
understand why there's so much console only readouts"*, and then *"Remove
those sixteen other console-only readouts too."*

## 1. Why there are so many

The answer, since it is the thing that will put them back if it is not
written down:

1. **Rule 1 builds an instrument per diagnosis.** Each one needs a way to be
   invoked from the page, and `console.table(x)` is one line.
2. **The page has one surface for numbers**, the HUD (`#stats`,
   `main.js:2276`), and it is already mode-switched five ways
   (`el.innerHTML` five times). A visible readout has to fight for that
   space; the console does not.
3. **The viewer is also the developer's console panel.** `docs/04-software.md`
   records `asm`, `torso`, `relax`, `quantize`, `settle` and `LIBRARY` on
   `globalThis` "for console work", so the console was already where the
   person building this was looking.
4. **They arrive one at a time.** `log worst seams`, `measure the pattern`
   and `count the folds` came with the sewing prototype (7248672), `how much
   of the body is through the cloth?` with the drape instrumentation
   (f6cd4f6), `seam report: tension and gaps` with the arranging work
   (b965cb1). Each was reasonable alone and nobody read the list as a list —
   rule 9 at scale.

## 2. What is actually there: ten rows, not sixteen

The figure sixteen was mine and was **wrong**: it counted `console.table`
occurrences in `main.js`, most of which are inside handlers that do real work
and log as a side effect. Classified by reading each handler, 2026-11-27:

**Console-only — they go (10):**

| line | row | section | the call behind it |
|---|---|---|---|
| 2755 | `report` | cloth | `sim.report()` |
| 2800 | `measure the heap` | accordion | `stackReport()` |
| 2849 | `count the folds` | flare and gathers | `hemProfile(asm)` |
| 2851 | `how it assembles` | flare and gathers | `assemblyReport(loadedPattern)` |
| 2936 | `seam report: tension and gaps` | sewing by hand | `sim.stitchReport(...)` |
| 2959 | `how much of the body is through the cloth?` | the drape | `sim.penetration()` |
| 3020 | `measure the pattern` | cutting table | `table.report()` |
| 3036 | `measure the darts folded shut` | cutting table | `table.command('dart-profile')` → `closedDartProfile`, a pure query (`table.js:417`) |
| 3044 | `list the edits` | cutting table | `table.command('edits')` → `editList` (`table.js:418`) |
| 3098 | `log worst seams` | view | `worstEdges(asm, 15)` |

**They stay — the log is a side effect of real work (3):** `true the darts`
(23026, mutates through `command('true-darts')`), `replay these edits onto
this body` (3051, drafts, replays and shows), and every `console.*` inside a
non-GUI function (the weld report, the dart cut, telemetry).

## 3. The resolved questions

1. **Do the measurements themselves go?** *No.* `sim.report`,
   `stackReport`, `hemProfile`, `assemblyReport`, `stitchReport`,
   `penetration`, `table.report`, `closedDartProfile`, `editList` and
   `worstEdges` all stay where they are. Only the GUI rows and their inline
   bodies go. Several have headless callers (`tools/`, `test/run.mjs`), and
   a measurement with no caller is a separate question nobody asked.
2. **What is lost?** The in-page way to ask a **live** question: the running
   sim's penetration and seam tensions, and the current table's report, have
   no headless equivalent because they are about the state on screen. This
   is stated, not hidden; the answer, if one is wanted later, is the HUD,
   which is where a person is already looking.
3. **Does anything get a replacement?** *No.* Nothing was asked for, and
   inventing a HUD layout is a change to the project (rule 3's shape).

## 4. Acceptance

1. No GUI row in `app/js/main.js` has a handler whose only effect is
   `console.*`: the ten rows above are gone, the three that do work remain.
2. Every call listed in §3 question 1 still exists and still has its
   non-GUI callers; `node --check` passes.
3. Driven in the page (rule 9), on **both** the repository copy and the
   served container after a rebuild (rule 12): the affected sections carry
   the right number of rows and the page logs no error.
4. `node test/run.mjs` is **306 pass / 0 fail**.
5. Any document that tells a reader to press one of them is corrected in the
   same turn (rule 10), and the knowledge tree is checked for the same.

**All five met, 2026-11-27**, by [console-readouts-todo.md](console-readouts-todo.md)
items 1-4: criteria 1-3 by items 1 and 2 (the ten gone, the three receipts
kept, every measurement still called from somewhere, 0 of the ten names in
the page on either artifact), criterion 4 by item 3 at **306 pass / 0 fail**,
criterion 5 by item 4 — `docs/14-editing.md` was the only document that told
a reader to press one of them, and the tree gained node 15 rather than
needing a correction.
