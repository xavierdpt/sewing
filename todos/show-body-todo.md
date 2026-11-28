# The body is always shown — TODO

The working queue for its spec,
[show-body-spec.md](show-body-spec.md). The two are a pair in `todos/`
(rule 11): the spec holds the requirements and the resolved questions, this
document holds the work they imply.

**How this document is maintained.** The cycle is: read the spec, pick the next
item from it, add it **on top** here with an identifier, do it, mark it done
here, and reference it from the spec. Then read the spec again. An identifier
is never reused or renumbered once given, because code comments and the spec
cite it (`todos/show-body-todo.md item 1`). Work that is not this spec's gets
its own new spec + todo pair, not an item here.

---

## Open

**Opened 2026-11-27**, from the user: assume `showBody` is always true and
remove the checkbox. The spec's §1 has the three sites and the evidence that
nothing else depends on the flag.

- [x] **1. Remove the flag and its checkbox. DONE 2026-11-27.**
      `app/js/main.js` only, the three sites of the spec's §1 table: the
      default (148), the assignment in `buildBodyMesh()` (379, dropped rather
      than frozen to `true` — spec §2 question 1), and the control with its
      handler (2486). The sibling `show*` flags are not touched (spec §2
      question 3).
      *Acceptance:* the spec's §3 criteria 1-3.
      **Done.** All three lines deleted whole, each asserted unique before the
      edit; `node --check app/js/main.js` passes and `grep -rn showBody` over
      the repository returns only this pair (criterion 1).
      *Measured on the page, `tools/viewshot.py`, exit 0 so no page error:*
      `"showBody" in window.params` is **false** (`window.params` is an
      object, so that is a real absence, not a missing global), and the scene
      holds its **four** position-carrying meshes — 66 / 630 / 812 / 8991
      vertices — **all four `visible: true`** with no control having been
      touched (criterion 2). No `.lil-gui .name` in the whole panel matches
      `showBody`; the `body` folder's rows are now `standard size`, `units`,
      `shape`, `asymmetry`, `arms, legs and poses`, two function rows and
      `measurements (cm)` — its first row gone and the rest intact
      (criterion 3).
      **Noted, not changed (rule 10):** `window.gui` is not exposed on the
      page, so a control inventory can only be taken off the lil-gui DOM, not
      off `gui.controllersRecursive()`. That is a gap in what rule 9's
      instrument can ask, not a fault of this change.

- [x] **2. Run the gate. DONE 2026-11-27.** `node test/run.mjs`, expecting
      **306 pass / 0 fail**. Rule 6: before committing, not after.
      *Acceptance:* the spec's §3 criterion 4.
      **Done: 306 PASS, 0 FAIL, exit 0**, the count the body-source pair left.
      The suite prints `ALL CHECKS PASSED` and no total, so the figure is off
      the run's PASS lines — and counting them with `grep -c PASS` gives
      **307**, because that banner contains the word too. The right pattern is
      `grep -c '^  PASS'`. The one-off was chased down rather than accepted as
      a real disagreement with the body-source pair's recorded 306: nothing in
      `test/` imports `app/js/main.js` (the suite's 24 imports are listed at
      its lines 3-24 and `main.js` is not among them) and `test/run.mjs` has
      not changed since 8b21748, so this item could not have moved the count
      in either direction.

- [x] **3. Verify the SERVED page, and rebuild the container. DONE 2026-11-27.**
      Not taken from the spec's §3 as written — **opened by the user**, who
      loaded `localhost:8777` and saw the checkbox still there after items 1
      and 2 were reported done. The spec's §3 criterion 2 named
      `tools/viewshot.py` without naming the artifact, so it was met by
      measuring the repository, which was never the thing in doubt. §3 is
      amended; this item is what it should have required.
      **The cause, measured not inferred:** `docker/app/Dockerfile.run` bakes
      the page in with `COPY . .`, so `:8777` served the `app/js/main.js` of
      whenever the image was built -- a container **up 29 minutes**, i.e.
      older than the edit. `curl http://127.0.0.1:8777/js/main.js | grep -c
      showBody` returned **3** while the same grep over `app/js/main.js`
      returned **0**. Two different files, exactly
      [served-page-spec.md](served-page-spec.md) §0 a second time.
      **Done.** `appdocker.sh build` then `stop`/`start`. The served file now
      has **0** `showBody` hits and `diff` against `app/js/main.js` is
      **identical**. Driven with `tools/viewshot.py --url
      http://127.0.0.1:8777`, exit 0: `"showBody" in window.params` **false**,
      **0** GUI rows named `showBody`, the `body` folder reading `standard
      size`, `units`, `shape`, `asymmetry`, `arms, legs and poses`, two
      function rows, `measurements (cm)`, and the four position-carrying
      meshes -- 66 / 630 / 812 / 8991 -- **all visible**.
      **The gap it exposed, and how the user closed it.**
      [served-page-spec.md](served-page-spec.md) §3's staleness warning fires
      in `appdocker.sh start`. A container that is **already running** when
      `app/` changes is never re-checked, so the warning cannot speak in this
      case -- which is the case that just happened. It was proposed here that
      the same comparison go into `appdocker.sh status`; the user chose a
      different answer and stated it as a standing instruction: *"what matters
      to me is that you rebuild and restart the docker containers yourself."*
      That is now **CLAUDE.md rule 12**, with this incident as its cost. No
      instrument changed -- the obligation did.

## Done

All three items, 2026-11-27, marked in place above. The gate is **306 pass / 0
fail** and the **served** page on `:8777` is byte-identical to the working
tree. Nothing outside `app/js/main.js` changed: no document, no knowledge-tree
node and no file format named the flag (spec §1), so rules 10 and 0 had nothing
to correct alongside it. Item 3 was opened by the user after items 1 and 2 were
reported done on the strength of a measurement of the wrong artifact.
