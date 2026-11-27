# The body source — TODO

The working queue for its spec,
[body-source-spec.md](body-source-spec.md). The two are a pair in `todos/`:
the spec holds the requirements and the resolved questions, this document holds
the work they imply.

**How this document is maintained.** The cycle is: read the spec, pick the next
item from it, add it **on top** here with an identifier, do it, mark it done
here, and reference it from the spec. Then read the spec again.

- **New items are added on top**, so the newest candidate is always the first
  thing read, and each one is **identified** — the identifier is what code
  comments and the spec cite (`todos/body-source-todo.md item 1`), so it is not
  reused or renumbered once it has been given.
- **An item comes from the spec.** The spec is the source of work; this
  document never invents an item that the spec does not imply.
- **When an item is done it is marked done here**, in place, and **referenced
  from its place in [body-source-spec.md](body-source-spec.md)** — against the
  step or decision it settled, with the numbers it produced.
- **The next iteration starts from the spec again.** Because every settled
  point there carries its "done" reference, what is left is what is not marked.

The cycle runs until every item is done. Work that is not this spec's gets its
own **new spec + todo pair** in `todos/`, not an item here.

**The order is not arbitrary.** The viewer stops reaching for the mesh (1), the
gate stops reaching for it (2), and only then are the files deleted (3) — so
that at no point does the repository reference a file that is not there, and so
that if the gate fails it fails on a tree that still has every input. The
documents (4) and the tree (6) are corrected in the same session, as rules 10
and 0 require, and the gate (7) is run last because it is the acceptance
criterion for all of it.

---

## Open

**Opened 2026-11-27**, from the user: remove MakeHuman from the application and
keep only the parametric body. The spec's §0 has the premise and §1 the
measurements that make the removal safe.

- [x] **1. Take the second body source out of the viewer. DONE 2026-11-27.**
      `app/js/main.js` only. From the spec's §2 table: the `meshsurface.js`
      import (11), `params.source` (138), the `makehuman` cache (317),
      `loadMakeHuman()` (348-356), the two guards in `buildBodyMesh()` —
      the mesh grid (378) and `flatShading` (389) — the early returns in
      `buildArms()` (406) and `refreshBody()` (1769), the source in the saved
      record (1913), the `loadForm()` switch-back (2039), the exported OBJ's
      comment (2083), the HUD and the two tables (2352, 2435, 2451), and the
      `body > source` dropdown with its handler (2508-2520).
      **Not** the `surface`/`torso` collapse — that is item 5, kept separate so
      that this item changes no behaviour beyond removing the switch.
      *Acceptance:* the page loads, shows the parametric body and drafts on
      **K**, driven with `python3 tools/viewshot.py` (rule 9); the `body`
      folder has no `source` dropdown.
      **Done.** Every site in the table is gone and `grep params.source` over
      `main.js` is empty. Two of them were kept as the constant they now
      always evaluate to, rather than deleted, because they are written into
      files whose format should not change: the pattern JSON's provenance
      field is now `body: 'parametric'` (nothing in the repository reads it --
      checked) and the exported OBJ's comment is now `parametric u=...cm`,
      byte-for-byte what it produced before. `flatShading` was dropped rather
      than set to `false`; it existed only for the imported mesh's facets.
      *Measured on the page, `tools/viewshot.py`, exit 0 so no page error:*
      `'source' in params` is **false**, no GUI control matches /source/, and
      the scene holds **four** position-carrying meshes at 66 / 630 / 812 /
      8991 vertices -- the parametric set that tree node 12 recorded, limbs
      included. **K** drafts: `4 panels, waist ring 78.3 cm, hem 160 cm
      (flare 2.044x)`, where the mesh source used to throw
      `surface.landmarkV is not a function`.

- [x] **2. Take the mesh fixture out of the gate. DONE 2026-11-27.** `test/run.mjs`: the
      `MeshSurface` import (7) and the four-assertion `CC0 MakeHuman bodice
      mesh` block (371-379). *Acceptance:* `node test/run.mjs` reaches the same
      end with four fewer assertions and no new failure — the full run is
      item 7, this item only needs the suite to load and the block to be gone.
      **Done, and the spec's count of it was wrong in a way worth recording.**
      The block at 371-379 holds **three** `check()` calls, not four -- the
      fourth thing tree node 11 lists is a `console.log` of the girth at waist
      and bust, which is a print, not an assertion. But the grep for reuse of
      its `body` binding turned up a **second** mesh block the node never
      recorded: `line('grid shell on the CC0 bodice mesh')` at 505-513, which
      builds a grid shell on the mesh body, relaxes it and checks `fits the
      scanned-style mesh too`. So four checks go after all, and the gate's
      expected total of 306 in item 7 stands -- by accident, not because the
      first count was right. `readFileSync` was imported at line 3 for that
      OBJ and nothing else, so it went too. `node --check` passes.

- [x] **3. Delete the files. DONE 2026-11-27.** `app/js/meshsurface.js`,
      `app/models/bodice.obj`, `app/models/makehuman-base.obj`,
      `tools/prep_bodice.py`, and `app/models/` with them once it is empty.
      Done with `git rm` so the deletion is staged as a deletion.
      *Acceptance:* `grep -rn MeshSurface app/ tools/ test/ docs/` is empty.
      **Done.** `git rm` staged four deletions: `app/js/meshsurface.js`,
      `app/models/bodice.obj`, `app/models/makehuman-base.obj`,
      `tools/prep_bodice.py`. `app/models/` held nothing else and no longer
      exists; nothing in `app/index.html` or either Dockerfile names it (both
      use a generic `COPY . .`), so no build or page load reaches for it. The
      grep over `app/ tools/ test/` was empty before the deletion -- the only
      remaining hits are in `docs/`, which is item 4.

- [x] **4. Correct every document that describes the two-source design. DONE 2026-11-27.** The
      spec's §3 lists them with line numbers: `README.md`,
      `docs/04-software.md` (four places, including the whole "Scanned"
      section), `docs/05-physical-kit.md`, `docs/07-sources.md` (past tense,
      kept — spec §5), `docs/08-local-toolchain.md` (two places),
      `docs/06-open-questions.md`. Plus the stale comments of §2:
      `app/js/cloth.js:525` and `:779`, `app/js/droptest.js:72`,
      `docker/app/Dockerfile.run:22`. *Acceptance:* the spec's §7 criteria 1,
      2 and 5.
      **Done, in two passes, the second one a reversal.** The first pass marked
      every removal in past tense — a struck-through route, a "REMOVED
      2026-11-27" section, a past-tense CC0 credit. The user asked why
      past-tense content was being kept and the justification did not hold
      (CC0 requires no attribution; rule 10's precedent is for a premise the
      *code still serves*; the record already lives in this pair and in git).
      So the tombstones were stripped and the documents now read in the present
      tense. Spec §5 records the reversal and the two forward-looking lines
      that survive on purpose. Edited: `README.md`, `docs/04-software.md` (the
      `models/` inventory, `meshsurface.js`, `prep_bodice.py`, §3's intro and
      heading, the whole "Scanned" section **deleted**, and §7 item 8 struck
      as withdrawn), `docs/05-physical-kit.md` (three routes to two),
      `docs/06-open-questions.md` (the O(n) ray-cast question),
      `docs/07-sources.md` (entry deleted), `docs/08-local-toolchain.md` (§1
      steps 5-6, §2's conclusion), plus the comments in `app/js/cloth.js`
      (x2), `app/js/droptest.js` and `docker/app/Dockerfile.run`.
      *Acceptance:* the grep over `app/ test/ tools/ sim/ docker/` is **empty**;
      repository-wide it returns only this pair and one forward-looking licence
      note in `docs/08-local-toolchain.md` §2 (spec §7 criterion 1, as
      amended there).

- [x] **5. Collapse `surface` into `torso`. DONE 2026-11-27.** Spec §4. With one source the two
      names are one object; `main.js` reaches for `surface` at 868, 1264, 1912,
      2681, 3216, 3223, 3245, 3575 and `torso` at 1785, 1919, 2644 for the same
      kind of thing. Renaming and deleting the indirection only — no behaviour
      change, and anything the collapse reveals is reported, not fixed here.
      **Done.** No function in `main.js` shadowed the name, so all 58 identifier
      uses were the module global; `let surface = null` and `surface = torso`
      are gone. **A blanket word-boundary rename introduced three bugs, all
      caught by reading the result rather than trusting the edit:** the HUD
      label `surface area` became `torso area` (prose, not an identifier), and
      two **object-shorthand property names** were renamed where the consumer
      expects `surface` — `makePattern(shell, { ..., surface })` in
      `app/js/panels.js` and `new WasmSewing(mod, { ..., surface })` in
      `app/js/sewwasm.js`. All three fixed; both options now read
      `surface: torso`. Comment prose ("mid-surface", "the real surface") was
      skipped by line, not by regex.
      *Measured on the page:* **K** drafts `4 panels, waist ring 78.3 cm, hem
      160 cm (flare 2.044x, gather 1x)` and adds a 988-vertex mesh — identical
      to the pre-collapse run, exit 0.
      **Reported, not fixed (the item's own scope limit, and rule 10):**
      `frameScene()` guards `torso.heights` and `torso.yMin` with
      `!== undefined`, and `openTable()` has `torso.yMax !== undefined ? 55 :
      55`, whose branches are identical. Both were defensive against a body
      that might lack those fields; no such body exists now, so each can only
      take one branch. Recorded in tree node 11.

- [x] **6. Bring tree nodes 11 and 12 into line. DONE 2026-11-27.** Spec §6. Not deleted:
      rewritten so that they record a project that *had* two sources and now
      has one, keeping why there were two and the measurements that made the
      removal safe. `kt_snapshot` first, then
      `kt_edit_start`/`kt_edit_dump`/`kt_edit_close` for the content (rule 0),
      never `kt_update_node` with retyped prose. Report both by full path and
      id.
      **Done, and the user reversed the approach mid-item**, as in item 4: not
      "rewritten as history" but **"the knowledge tree must no longer contain
      makehuman anywhere"**. Spec §6 records the reasoning and the full
      account. Five nodes touched, not two:
      **node 12 deleted** (its harness lesson merged by hand into node 13
      first), **node 11 rewritten, retitled and retagged**, **node 13**'s
      mesh-body section removed, **node 9**'s 200-response list corrected, and
      **node 3**'s stale citation of node 11's old title fixed. Two links
      removed (11->9, 13->12). Snapshot `before-body-source-removal` taken
      first. Verified by direct SQL, not only the tree's term-ORing search.
      Paths and ids are in the turn's report.

- [x] **7. Run the gate. DONE 2026-11-27.** `node test/run.mjs`, expecting **306 pass / 0 fail**
      — 310 less the four assertions item 2 removes. Rule 6: before committing,
      not after, and it takes several minutes. Then the spec's §7 criteria 1-5
      as a checklist.
      **Done: 306 PASS, 0 FAIL, exit 0**, the predicted 310 - 4 exactly. The
      count is off the run's PASS lines, since the suite prints `ALL CHECKS
      PASSED` and no total. Spec §7's five criteria are all met, with 1 and 2
      amended there (the originals were too strict to pass, and one of them
      contradicted the same spec's own §5).

## Done

All seven items, 2026-11-27, marked in place above. The gate is **306 pass / 0
fail**. Two of the seven were reversed by the user while in progress and the
reversals are recorded rather than smoothed over: item 4 (documents marked in
past tense -> erased) and item 6 (tree nodes rewritten as history -> erased),
both settled by the same principle, that this project's record of a removal
belongs in this pair and in git, not scattered through the documents and the
tree. Spec §5 and §6 carry the argument.
