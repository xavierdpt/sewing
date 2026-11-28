# The served page is not the page the instruments drive

Written 2026-11-27, immediately after it cost something. The user loaded the
viewer on `localhost:8777` and saw a `source: parametric/makehuman` dropdown
that had been removed from the repository, verified gone, committed and
reported as gone.

This document is the **spec** of a pair in `todos/`; its working queue is
[served-page-todo.md](served-page-todo.md). Items are taken from here, added on
top of the queue with an identifier, and once done are marked done there and
referenced back here (CLAUDE.md rule 11).

**Every section carries a `**State:**` line directly under its heading**, so
finding the next candidate is `grep -A1 '^##' todos/served-page-spec.md` and
not a careful read.

---

## 0. The cost, recorded first

**State:** written. This is the finding; everything below is what it implies.

Four `tools/viewshot.py` runs were taken while removing the second body source
([body-source-spec.md](body-source-spec.md)), and all four were reported as
evidence that "the viewer loads, shows the parametric body and drafts on **K**,
with no `source` dropdown". Every one of them was true, and not one of them
touched the thing the user presses.

`tools/viewshot.py` **starts its own `http.server` over `app/`** from the
repository (line 119) and navigates to it. It takes no URL. So it measures the
working tree, always, and cannot be pointed anywhere else. Meanwhile
`docker/app/Dockerfile.run` **bakes the page into the image** with `COPY . .`
rather than mounting it, so a running container serves whatever `app/` looked
like when the image was built. The container in question had been up **26
hours**, and `curl http://127.0.0.1:8777/js/main.js | grep -c makehuman`
returned **7** at a moment when the same grep over `app/js/main.js` returned 0.

Nothing was wrong with the code. The instrument and the deployment were
measuring two different files, and the report did not distinguish them.

> **Cost:** the user had to find it by looking at the screen — which is rule 1's
> loop exactly, and rule 9's error one level up. Rule 9 says to follow the path
> the person presses rather than read the capability; this went further and
> *measured* a path, carefully and repeatedly, that was not the one being
> pressed. A measurement of the wrong artifact is more dangerous than no
> measurement, because it is reported with numbers.

**This gap was already written down and was not acted on.** Knowledge-tree node
9, "The garment viewer in docker", says: *"The containerised page has not been
driven headlessly. `tools/viewshot.py` serves `app/` itself from the repository
and takes no URL argument, so it cannot be pointed at the container; giving it
one is a change to a tool and therefore proposed, not performed (rule 3). Until
then 'the keys work in the container' rests on the files being byte-identical,
not on a run — which is exactly the gap rule 9 is about."* That note named this
failure before it happened. Proposing a change and then not making it is the
right process; reading the proposal, leaving it, and then reporting the
unverified claim anyway is not.

## 1. What the fix is, and what it is not

**State:** settled.

It is **not** "remember to rebuild the container". A procedure nobody is
reminded of at the moment it matters is the same class of thing as an unstated
default (rule 1's second half), and this project's answer to that is an
instrument, not a resolution.

Two changes, each small, each closing one half:

- **`tools/viewshot.py --url`** — so the served page *can* be driven at all.
  Without this, the claim "it works in the container" can only ever rest on
  files being byte-identical, which is what node 9 already objected to.
- **A staleness warning in `appdocker.sh start`** — so the common case, a
  container older than the page, announces itself instead of being discovered
  on screen. `--url` makes the gap measurable; the warning makes it unnecessary
  to remember to measure.

Neither changes what the page does. Both are rule 3: a question worth asking
twice is a missing tool.

## 2. `tools/viewshot.py --url`

**State:** **done** 2026-11-27 — item 1, with a control case: the flag detects
the dropdown on a deliberately stale page and reports it absent on the
container and on the repository.

Requirements:

- `--url URL` navigates to `URL` and **does not start the local server**. The
  local server stays the default, so every existing invocation is unaffected.
- A URL with no path gets `/` appended rather than being sent bare, since the
  page is `index.html` and both `python3 -m http.server` and the container
  serve it from `/`.
- `--url` and the implicit local server are mutually exclusive by
  construction, not by a flag check: the server is only started when `--url` is
  absent.
- Everything downstream is untouched — `booted()`, `--eval`, `__pump`,
  `--frames`, the screenshot, the console/exception capture and the non-zero
  exit on a page error all work the same, because they act on the CDP session
  and not on how the page was reached.
- The docstring says what the flag is for, in one line, and says that the
  default measures the repository.

**Acceptance:** pointed at the running container it reproduces the finding of
§0 — on the stale image, a `source` control present; after a rebuild, absent —
and pointed at nothing it behaves exactly as before.

## 3. The staleness warning in `appdocker.sh start`

**State:** **done** 2026-11-27 — item 2, **after the approach this section
first specified was built, measured and thrown away.** Corrected in place
below (rule 10); the discarded version is recorded because its failure is the
reason for the current one.

`start` warns when the page baked into the run image is not the page in `app/`,
because that is precisely the condition under which the served page is not the
repository's.

- It is a **warning, not a refusal**. Serving a deliberately older build is a
  legitimate thing to do, and a tool that refuses it would be wrong.
- It must not fail `start` if docker cannot answer (no such image yet, or
  `docker` returning an error): a diagnostic that breaks the command it
  diagnoses is worse than none.
- It says what to do about it, naming `appdocker.sh build`, and names
  `viewshot.py --url` as the way to see what is actually served.

**The signal is content, not time.** This section first said to compare the
image's creation time against `app/`'s newest file with `find -newer`. That was
built and it failed its own acceptance test in both directions:

- **It cried wolf.** `touch app/js/main.js`, changing nothing, produced the
  warning.
- **Worse, following its advice did not clear it.** `appdocker.sh build` on
  unchanged content is fully cached, so docker reuses the existing image and
  keeps its original `.Created`. Measured: after a rebuild the warning was still
  there, naming the same file. A warning that survives the remedy it
  recommends teaches people to ignore warnings, which is worse than having
  none.

So the image carries a **fingerprint of the page it was built from**:
`app_hash()` in `appdocker.sh` is a `sha256` over every file in `app/` except
`wasm/`, `build` passes it as `--build-arg APP_HASH`, and `Dockerfile.run`
stores it as a trailing `LABEL app_hash`. `start` recomputes it and compares.
`wasm/` is excluded because the run image takes its wasm from the build image
with `COPY --from`, not from the repository, so a difference there is not
staleness. The `LABEL` is last in the file so changing it invalidates no layer
above it. An image with no such label — one built before this existed — gets a
one-line note rather than a warning, since it cannot be checked either way.

**Acceptance, measured:** silent on a fresh image; silent after `touch` with no
content change; warns on a real content change; and **silent again after
`build`**, which is the case the first version could not pass.

**Amended 2026-11-27 (rule 10), after this section's warning failed to prevent
a second occurrence of §0.** The warning fires inside `start`, and **a
container that is already running while `app/` changes underneath it is never
re-checked** -- so in the case that actually recurred it had no place to speak.
The user saw a removed control on `:8777` from a container 29 minutes old and
had to ask three times before it was rebuilt. Adding the comparison to
`appdocker.sh status` was proposed and **not** adopted; the user's answer was
an obligation rather than an instrument, now **CLAUDE.md rule 12**: a change
under `app/` is not done until the container is rebuilt, restarted and the
served page driven with `--url`. This section's acceptance is unchanged and
still holds -- the warning is simply not the thing that covers an already
running container, and this spec no longer implies that it is.
See [show-body-todo.md](show-body-todo.md) item 3.

## 4. The acceptance criterion that could not catch this

**State:** **done** 2026-11-27 — item 3.

[body-source-spec.md](body-source-spec.md) §7 criterion 4 reads "The viewer
loads, shows the parametric body, and **K** drafts — driven headlessly with
`python3 tools/viewshot.py`". It is marked met, and it *was* met. It is also
incapable of detecting the failure the user hit, because the tool it names
cannot reach the page that failed.

Rule 10: a document that is out of date is corrected on the spot. That spec
says its work is verified, and a reader has no way to see which artifact was
verified. It is amended to say what was measured (the repository), what was
not (the served page), and that the removal was confirmed on `:8777` only
after a rebuild — which it now has been, by `curl`:
`grep -c 'makehuman\|params.source'` over the served `js/main.js` returns 0,
`models/bodice.obj` returns 404, and the served file is byte-identical to
`app/js/main.js`.

## 5. The knowledge tree

**State:** **done** 2026-11-27 — item 4. Node 9's standing note is replaced by
what happened, what it cost and the two instruments that close it.

Node 9's standing note (quoted in §0) predicted this and should now record
that it happened, what it cost and that the instrument exists. Rule 0: the
tree is consulted first, so the node that warned about the gap is the right
place for the fact that the gap has been closed — otherwise the next reader
gets the warning without the remedy.

## 6. Out of scope, deliberately

**State:** settled.

- **Mounting `app/` into the run image** instead of baking it. It would make
  staleness impossible, and it is a real option — `appdocker.sh` even names it
  in a comment (`-v "$root/app:/opt/app"`). It is rejected here because the
  baked page is the point of the run image: node 9 records that the image
  exists so a machine needs docker and nothing else, and that the wasm is
  rebuilt rather than copied so the solver is reproducible from a checkout. A
  mounted page would quietly undo that. Raising it is fair; deciding it is not
  this pair's business.
- **Making the gate drive the container.** `node test/run.mjs` is browser-free
  by design (`docs/04-software.md`: every geometry module imports no three.js so
  the whole pipeline runs under node). Adding a docker dependency to the gate
  is a change to its character and belongs in its own pair if it is wanted.
- **Any change to what the page does.** This pair touches two tools and two
  documents.
