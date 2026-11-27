# The served page — TODO

The working queue for its spec, [served-page-spec.md](served-page-spec.md).
The two are a pair in `todos/`: the spec holds the requirements and the
resolved questions, this document holds the work they imply.

**How this document is maintained.** The cycle is: read the spec, pick the next
item from it, add it **on top** here with an identifier, do it, mark it done
here, and reference it from the spec. Then read the spec again.

- **New items are added on top**, and each one is **identified** — the
  identifier is what code comments and the spec cite
  (`todos/served-page-todo.md item 1`), so it is not reused or renumbered once
  it has been given.
- **An item comes from the spec.** The spec is the source of work; this
  document never invents an item that the spec does not imply.
- **When an item is done it is marked done here**, in place, and **referenced
  from its place in [served-page-spec.md](served-page-spec.md)**.
- **The next iteration starts from the spec again.** What is left is what is
  not marked.

The cycle runs until every item is done. Work that is not this spec's gets its
own **new spec + todo pair** in `todos/`, not an item here.

**The order:** the instrument first (1), because until the served page can be
driven at all, nothing else here can be checked; then the warning that makes
driving it unnecessary in the common case (2); then the two records — the
acceptance criterion that could not catch this (3) and the tree node that
predicted it (4).

---

## Open

**Opened 2026-11-27**, from the user finding a removed dropdown still on
`localhost:8777`. The spec's §0 is the cost.

- [x] **1. `tools/viewshot.py --url`. DONE 2026-11-27.** Spec §2. Navigate to a given URL and
      skip starting the local `http.server`; append `/` to a pathless URL;
      start the server only when `--url` is absent, so the two cannot both
      happen; leave `booted()`, `--eval`, `__pump`, `--frames`, the screenshot
      and the error exit untouched; say in the docstring that the default
      measures the repository.
      *Acceptance:* pointed at the running container it reproduces §0 — a
      `source` control present on a stale image, absent after a rebuild — and
      with no `--url` it behaves exactly as before.
      **Done.** The server is started only in the `else` branch, so the two
      paths cannot both happen; a pathless URL gets `/` appended via
      `urllib.parse`; the run prints `driving <target>` so the output says
      which artifact was measured. `booted()`, `--eval`, `__pump`, `--frames`,
      the screenshot and the error exit are untouched, and the docstring now
      opens by saying the default measures the **repository**.
      *Acceptance, with a control case — a null result here would otherwise
      mean nothing (the lesson in tree node 13):* a deliberately stale page was
      served on `:8799` from `HEAD~1` (`main.js`, `meshsurface.js` and
      `bodice.obj` restored out of git), and the three runs separate cleanly:

      | target | `sourceControls` | `'source' in params` |
      |---|---|---|
      | stale page, `:8799` | **`["source"]`** | **true** |
      | the container, `:8777` | `[]` | false |
      | the repository, no `--url` | `[]` | false |

      So the flag detects the failure the user hit, and would have caught it.

- [x] **2. The staleness warning in `appdocker.sh start`. DONE 2026-11-27.** Spec §3. Warn, do
      not refuse, when the run image is older than the newest file in `app/`;
      compare with `find app -newer` against a file stamped from the image's
      creation time rather than parsing dates in the shell; name
      `appdocker.sh build` in the message; never fail `start` when docker
      cannot answer.
      *Acceptance:* warns with a stale image and still starts; silent right
      after a `build`.
      **Done, but not the way this item specified it — the `find -newer`
      approach was built, measured and discarded.** It failed both ways: a bare
      `touch` produced a warning with nothing changed, and — the fatal one — a
      rebuild did **not** clear it, because an unchanged build is fully cached
      and docker reuses the image with its original `.Created`. A warning that
      survives its own recommended remedy is worse than none. Spec §3 is
      corrected in place and keeps the discarded version, since its failure is
      the argument for the replacement.
      What shipped instead: a **content fingerprint**. `app_hash()` in
      `appdocker.sh` is a `sha256` over `app/` excluding `wasm/` (which comes
      from the build image, not the repository), `build` passes it as
      `--build-arg APP_HASH`, `Dockerfile.run` stores it as a trailing `LABEL
      app_hash`, and `start` recomputes and compares.
      *Measured, all four cases:* silent on a fresh image; **silent after
      `touch` with no content change**; warns on a real content change
      (`printf >> main.js`); and **silent again after `build`**. A label-less
      image gets a one-line note instead of a warning. `start` still starts in
      every case, including with a nonexistent image, where the diagnostic
      stays quiet and only `docker run` fails.

- [x] **3. Amend `body-source-spec.md` §7 criterion 4. DONE 2026-11-27.** Spec §4, and rule 10.
      It claims verification by a tool that could not reach the page that
      failed. Say what was measured, what was not, and record the `curl`
      evidence that the served page is now correct.
      **Done.** Criterion 4 keeps its original text and its "met" — it was met
      — and now carries a block saying plainly that the tool it names could
      only ever have measured the working tree, what the user saw instead, and
      the evidence that `:8777` is correct now and has been driven through
      `--url`.

- [x] **4. Record it in knowledge-tree node 9. DONE 2026-11-27.** Spec §5. The node's standing
      note predicted this gap; it should now say that it happened, what it
      cost, and that `--url` exists. `kt_snapshot` first, then
      `kt_edit_start`/`kt_edit_dump`/`kt_edit_close` (rule 0), never
      `kt_update_node` with retyped prose. Report the node by full path and id.
      **Done.** `Triangulated Garment System > Software, instruments and
      validation > The garment viewer in docker`, **id 9**. Snapshot
      `before-served-page-note` (12 nodes) taken first, then an editing
      session; `kt_update_node` was not used, since nothing but content
      changed. The paragraph that predicted the gap is replaced by what
      actually happened — the 26-hour container, `grep -c makehuman` returning
      7 on the port against 0 in the working tree — plus the two instruments
      and, kept deliberately, **why the fingerprint is content and not a
      timestamp**, so nobody rebuilds the cheaper check.

## Done

All four items, 2026-11-27, marked in place above. One of them, item 2, was
built the way its item specified, measured, and thrown away for a different
mechanism — the record of the discarded version is in spec §3, because a
warning that survived its own remedy is the argument for the one that
replaced it.
