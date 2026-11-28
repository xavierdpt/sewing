# The console-only readouts leave the page — TODO

The working queue for its spec,
[console-readouts-spec.md](console-readouts-spec.md). The two are a pair in
`todos/` (rule 11): the spec holds the requirements and the resolved
questions, this document holds the work they imply. The cycle is read the
spec, pick the next item, add it on top here with an identifier, do it, mark
it done here, and reference it from the spec. An identifier is never reused
or renumbered.

---

## Open

**Opened 2026-11-27**, from the user: *"Remove those sixteen other
console-only readouts too."* The spec's §1 answers the question that came
with it — why there are so many — and §2 corrects the count to **ten**.

- [x] **1. Classify every GUI row that logs. DONE 2026-11-27.**
      Before deleting anything: a `grep` for `console.table` cannot tell a
      readout from a handler that does real work and logs what it did, and
      the number I had given the user (sixteen) came from exactly that grep.
      **Done**, by reading each handler: **ten** console-only rows, **three**
      that work and log. The table is the spec's §2. Two of the ten were not
      in my own earlier list — `measure the darts folded shut` and `list the
      edits` — because they looked like commands; `table.js:417-418` shows
      both are pure queries (`closedDartProfile`, `editList`).

- [x] **2. Remove the ten. DONE 2026-11-27.** `app/js/main.js` only.
      *Acceptance:* the spec's §4 criteria 1-3.
      **Done.** Ten rows deleted, each asserted unique before the edit, and
      with them the import the last one left unused — `worstEdges` from
      `./relax.js`, now 0 occurrences in `main.js` (it is still imported by
      `test/run.mjs`, which is its real caller). `node --check` passes.
      The three that work and log are untouched; re-running the classifier
      over the edited file returns exactly `true the darts` and `replay these
      edits onto this body` (criterion 1).
      **Every measurement survives** (criterion 2): `stackReport` (telemetry,
      `main.js:2129`), `assemblyReport` (`main.js:887`, `tools/skirt.mjs`),
      `hemProfile` (telemetry; `tools/trace.mjs`, `assemble.mjs`,
      `drape_blender.mjs`), `stitchReport` (three sites in `main.js`),
      `sim.penetration` (`main.js:1489`, `tools/drape_blender.mjs`),
      `table.report` (the HUD, `main.js:2285`), `closedDartProfile` and
      `editList` (`tools/edits.mjs`), `worstEdges` (`test/run.mjs`).
      *Driven, `tools/viewshot.py`, exit 0 on both artifacts, served
      `js/main.js` diffing **identical** after `appdocker.sh
      build`/`stop`/`start`* (criterion 3): **0** of the ten names appear in
      any `.lil-gui .name` in the page; both survivors do; 198 rows over the
      panel's ten sections — shell 8, fit 11, explicit joining 3, pattern 7,
      try a pattern on 4, flare and gathers 17, sewing by hand 1 + its
      subfolders, the drape 3, the cutting table 14, view 4 — and the bar
      still reads `body · files · cloth · tests`.

- [x] **3. The gate. DONE 2026-11-27.** The spec's §4 criterion 4, **306 pass / 0 fail**.
      Run fresh for this change rather than reasoned about: ten deletions and
      an import removal is more than the last one.
      **Done: 306 PASS, 0 FAIL, exit 0, `ALL CHECKS PASSED`** — unchanged
      from before the removals, which is what the import check predicted:
      `worstEdges` left `main.js` but `test/run.mjs` imports it from
      `app/js/relax.js` directly, so the gate still exercises it.

- [x] **4. Correct the documents. DONE 2026-11-27.** The spec's §4 criterion
      5.
      **Done.** [14-editing.md](../docs/14-editing.md) was the one document
      that told a reader to press any of them: it listed *"the four that are
      not a gesture, as buttons"*, two of which are gone. It now names the
      two that remain, says where the other two went and why they could go
      while the commands stayed, and points at `node tools/edits.mjs` and
      `--darts`, which answer both questions in the repository's own
      instrument (rule 3).
      `docs/04-software.md` gains the state as a rule: no control in the page
      answers into the console any more, thirteen did, and a handler that
      works and logs is not one of them.
      No other document and no knowledge-tree node named any of the ten.

## Done

All four items, 2026-11-27. Ten controls gone, every measurement behind them
kept, the gate at **306 pass / 0 fail**, and the served page on `:8777`
byte-identical to the working tree. Two documents corrected
([14-editing.md](../docs/14-editing.md), `docs/04-software.md`) and one tree
node written: *Triangulated Garment System > Software, instruments and
validation > The menubar and its floating dialogs > No control answers into
the console*, **id 15**.
