# The body source: one body, not two

Written 2026-11-27, from the user's instruction: **remove MakeHuman from the
application and keep only the parametric body.**

This document is the **spec** of a pair in `todos/`; its working queue is
[body-source-todo.md](body-source-todo.md). Items are taken from here, added on
top of the queue with an identifier, and once done are marked done there and
referenced back here against whatever step or decision they settled. An entry
here carrying no "done" reference is work still to be queued, and that is how
the next item is chosen (CLAUDE.md rule 11).

**Every section carries a `**State:**` line directly under its heading**, so
finding the next candidate is `grep -A1 '^##' todos/body-source-spec.md` and
not a careful read — the same convention as
[18-validation.md](18-validation.md), for the same reason.

---

## 0. Why this document exists

**State:** written, the premise below is the user's and is not re-litigated.

The viewer has offered two body sources since the mesh adapter was added: the
parametric `Body` built from tape measurements (`app/js/body.js`,
[../docs/10-body.md](../docs/10-body.md)) and an arbitrary OBJ adapted by
`MeshSurface` (`app/js/meshsurface.js`), whose one shipped file is a torso band
cropped from the CC0 MakeHuman base mesh.

The mesh adapter was never a second opinion about the body. The knowledge-tree
node "The body source: parametric or mesh" (id 11) recorded what it was for:
**the slot a real body goes into** — a photogrammetry scan or a measured dress
form — with MakeHuman filling the slot only because
[../docs/08-local-toolchain.md](../docs/08-local-toolchain.md) §2 could find no
other usable human torso mesh in the distribution, and because MakeHuman's is
unambiguously CC0.

**That justification is withdrawn by the user, 2026-11-27: "Nobody is doing
photogrammetered scans."** The slot is being kept open for an input that is not
coming. So the slot closes with the body that was standing in it, and the
project has one body source.

This is not a decision measurement can arbitrate and none is offered for it. It
is a scope decision about what the project is for, and it is the user's.

## 1. What the mesh source actually did, measured

**State:** settled; measured 2026-11-27 with `tools/viewshot.py` and recorded
in the knowledge tree before this document existed. Nothing here needed
re-measuring to act. **The tree nodes that held these measurements have since
been erased by item 6, so this section is now their only record** — which is
the intended arrangement, not an accident: the history of the removal belongs
here and in git, not in the tree that rule 0 consults first.

The case for removal does not rest on the premise alone. Measured on the real
page (`tools/viewshot.py`, rule 9), the mesh source was already a path nobody
could finish work on:

- **It cannot draft a garment.** Pressing **K** with the mesh body selected
  throws `TypeError: surface.landmarkV is not a function` at
  `app/js/main.js:868`, the first line of `startSkirt()`. `Body` has grown
  `landmarkV()`, `band()`, `measure()`, `bandArea()` and `legSpanAt()`;
  `MeshSurface` implements none of them, and `main.js` calls them through
  `surface`.
- **Every body control is inert while it is selected**, and silently so:
  `refreshBody()` returns before it redraws anything, so measurements, shape,
  posture and all eleven poses store their value and change nothing on screen.
  The vertex-count tables that established this were in tree node 12, deleted
  by item 6; the measurement was that a waist of 72 -> 95 left the shown body
  byte-identical at 1,566 vertices and coordinate sum 22542.949, while
  `torso.m.waist` took the new value.
- **The limbs are not drawn at all** with it selected — two
  position-carrying meshes in the scene instead of four.
- **It throws away a draped garment to do nothing**: `clearDrop()` runs before
  that early return.
- **Its one live function was a fixture.** Outside the viewer's dropdown, the
  only consumer of `meshsurface.js` in the repository is `test/run.mjs`, which
  asserts the OBJ parses, that an axis point reads inside and a point 60 cm out
  reads outside. It drafts, measures and fits nothing.

**Amended while doing item 2:** the gate held a **second** mesh block that tree
the tree did not record -- `grid shell on the CC0 bodice mesh` at 505-513, which
built a grid shell on the mesh body, relaxed it and checked `fits the
scanned-style mesh too`. It is still a fixture and the conclusion is unchanged,
but the tree's "the only consumer is `test/run.mjs:371`" was one line too
specific. Recorded here because the node that said it is gone.

So removal deletes a body you could look at but not work on, plus the test that
kept its importer compiling.

## 2. What is removed

**State:** **done** 2026-11-27 -- items 1 (viewer), 2 (gate) and 3 (the files)
in [body-source-todo.md](body-source-todo.md), with the page measured and the
four deletions staged. One correction from doing it: the gate had **two** mesh
blocks, not one -- see item 2 and the amendment at the end of §1.

The inventory, from a repository-wide grep on 2026-11-27 excluding `src/` and
`kt/`:

**The viewer** (`app/js/main.js`) — the whole switch, not merely its MakeHuman
option, since with the mesh gone there is nothing to switch to:

| Line | What |
|---|---|
| 11 | `import { MeshSurface } from './meshsurface.js'` |
| 138 | `source: 'parametric'` in `params` |
| 317 | `let makehuman = null` cache |
| 348-356 | `loadMakeHuman()`, fetching `models/bodice.obj` |
| 378 | `surface.mesh(...)` grid chosen by source |
| 389 | `flatShading: params.source === 'makehuman'` |
| 406 | `buildArms()` early return |
| 1769 | `refreshBody()` early return |
| 1913 | `body: params.source` in the saved/trace record |
| 2039 | `loadForm()` forcing the source back to parametric |
| 2083 | `params.source` in the exported OBJ's comment |
| 2352, 2435, 2451 | `source` printed in the HUD and the two tables |
| 2508-2520 | the `body > source` dropdown and its handler |

With `source` gone, `surface` and `torso` are the same object. §4 says what
happens to that.

**The gate** — `test/run.mjs`: the import at line 7 and the four-assertion
`CC0 MakeHuman bodice mesh` block at 371-379.

**The files** — `app/js/meshsurface.js` (204 lines), `app/models/bodice.obj`
(84 KB), `app/models/makehuman-base.obj` (1.7 MB), `tools/prep_bodice.py`
(125 lines). `app/models/` is left empty and so stops existing in a checkout.

**Stale references in comments** — `app/js/cloth.js:525` and `:779` and
`app/js/droptest.js:72` describe their surface parameter as "Torso or
MeshSurface"; `docker/app/Dockerfile.run:22` lists `models/` in the build
context. Nothing functional, all of it wrong the moment the files go.

## 3. The documents that have to be corrected with it

**State:** **done** 2026-11-27 -- item 4, in two passes, the second a reversal
by the user. See §5.

Rule 10: a document that is out of date is corrected on the spot, in the same
turn, because a document describing the project as it was gets read as the
project as it is. Every one of these states the two-source design as current:

- **`README.md:132`** — "The bodice model is the MakeHuman base mesh (CC0,
  September 2020), cropped to a torso band by `tools/prep_bodice.py`". The
  whole clause goes; the parametric sentence that follows it stays.
- **`docs/04-software.md`** — the file inventory at 53-59, `prep_bodice.py` at
  139, the entire **"Scanned (`meshsurface.js` + `models/bodice.obj`)"**
  section at 226-250 including its 2026-11-27 correction note, and the future
  item at 430 ("Load a real scan… symmetric-difference it against the
  parametric body").
- **`docs/05-physical-kit.md:139`** — route 2 of three for getting a body into
  the software, "Photogrammetry of the duct-tape form → OBJ → `MeshSurface`",
  called "the accurate route". It is the route the user says nobody takes, and
  it now points at a class that does not exist.
- **`docs/07-sources.md:56`** — the MakeHuman base-mesh credit. **Deleted**, see
  §5 and the reversal recorded there.
- **`docs/08-local-toolchain.md`** — the COLMAP recipe's steps 5 and 6 at
  60-61, and §2's conclusion at 76-85 that "the project uses two sources
  instead, both already set up".
- **`docs/06-open-questions.md:136`** — `MeshSurface.point(u,v)` being O(n) per
  call is no longer an open question about this project.

## 4. The question this removal is the occasion to settle

**State:** **done** 2026-11-27 -- item 5. `surface` is gone; `torso` is the
one name. Two guards it left behind are reported in §4 and in tree node 11.

The knowledge tree identified the `surface`/`torso` split as code that no longer
fits (rule 10): `torso` is always the parametric `Body`, `surface` is whichever
source is selected, and `main.js` reaches for one or the other for the same
kind of thing — `surface` at 868, 1264, 1912, 2681, 3216, 3223, 3245, 3575 and
`torso` at 1785, 1919, 2644. The node left it as a choice between growing the
adapter's landmark half and making the dropdown honest.

**Removing the second source decides it by making the two names one object**,
and leaving both in place would leave the repository's most load-bearing
variable with a distinction behind it that no longer exists. So `surface` is
collapsed into `torso` as part of this work rather than noted for later.

Scope limit, so this does not turn into a refactor: the collapse is renaming
and deleting the indirection, and it changes no behaviour. Anything the
collapse *reveals* is reported, not fixed here.

## 5. What is deliberately kept

**State:** settled, 2026-11-27, **after one reversal by the user** — recorded
below rather than quietly rewritten, because the first answer here was wrong.

**Reversed: the past-tense tombstones.** This section first said that each
removed thing would be *marked* rather than erased — a past-tense MakeHuman
credit in `docs/07-sources.md`, a struck-through route in
`docs/05-physical-kit.md`, a "REMOVED 2026-11-27" section in
`docs/04-software.md` — on the house-style precedent of rule 10, which marks
retired ideas instead of deleting them. The user asked why past-tense content
was being kept, and the answer did not survive the question:

- The licence argument was simply **wrong**. CC0 is a public-domain dedication
  and **requires no attribution**, so nothing obliged the credit to stay.
- The rule 10 precedent does not reach this case. What it marks is a premise
  **the code still serves** — a retired idea that would otherwise keep being
  built on. Here the code is deleted outright, so there is nothing left to
  mislead a reader.
- The record already exists, permanently and in one place: this pair in
  `todos/` and the git history. Tombstones in five documents are five copies of
  it to keep correct, and clutter a reader has to read past.

So the documents are **present tense, describing the project as it is**, and
the history lives here. What survives in `docs/` is not history but two
forward-looking lines, kept because each prevents wasted work rather than
commemorating any:

- **`docs/04-software.md` §7 item 8**, a *planned* future feature ("load a real
  scan and fit the measurements to it"), struck through and marked withdrawn.
  A plan nobody withdrew in writing gets re-proposed.
- **`docs/08-local-toolchain.md` §1 step 6**, which now says outright that this
  project has nothing that reads the OBJ the scanning recipe produces. The
  recipe and its apt packages are still correct and still installed; without
  that line it dead-ends silently, which is worse than saying so.

**Kept, and not reversed:**

- **The parametric body entire.** Nothing in `app/js/body.js`,
  `docs/10-body.md`, the measurement GUI, the dress-form JSON or the size chart
  is in scope.
- **`loadForm()`'s position** that a scanned mesh is not ours to reshape. The
  line enforcing it goes because there is no other source to switch away from,
  but the reasoning was right and is not being reversed.

## 6. The knowledge tree

**State:** **done** 2026-11-27, and **reversed by the user in the same way §5
was**: the nodes are erased, not rewritten as history.

Tree nodes 11 ("The body source: parametric or mesh") and 12 ("The mesh body
ignores every body control") describe, in detail and correctly, a design that
this work removes. Rule 0: a node written from a source that no longer says
that is **worse than a missing node, because it will be trusted**.

**Reversed, 2026-11-27.** This first said the nodes should not simply be
deleted — that a node recording the project as having *had* two sources was
what a future reader needs. The user settled it: **"the knowledge tree must no
longer contain makehuman anywhere."** Same reasoning as §5, and the tree is the
place it bites hardest, because rule 0 makes the tree the *first* thing
consulted on every question: a node there describing a removed feature is not
inert history, it is the answer someone gets before they reach a document. The
project's history of the removal lives in this pair and in git, which are read
deliberately rather than consulted first.

So what was done:

- **Node 12, "The mesh body ignores every body control": deleted.** Its entire
  subject was the behaviour of the removed source. One thing in it was worth
  keeping and was *not* about the mesh body — the measurement lesson that **a
  UI harness's null result means nothing until its control case changes**
  (lil-gui fires `onFinishChange` from blur, and `element.blur()` on an input
  headless Chrome never focused fires nothing). That was merged by hand into
  node 13, which measured the same controls with the same harness.
- **Node 11: rewritten entirely**, retitled from "The body source: parametric
  or mesh" to **"The body is generated from measurements"**, and retagged
  (`makehuman` and `mesh` dropped, `landmarks` added). It keeps what was true
  and useful — the generator, the asymmetry fields, why the archive forces
  generating rather than importing — and keeps the one real insight the old
  node had, reframed without the comparison: **what the drafting path needs
  from a body is a surface function *and* landmarks**, so the useful question
  about a body is whether it is annotated. It also records the §4 collapse and
  the two guards it left behind.
- **Node 13**: its "The same controls on the mesh body" section removed, the
  salvaged harness lesson added, and its link to node 12 removed.
- **Node 9, "The garment viewer in docker"**: its measurement record listed
  `models/makehuman-base.obj` among the URLs that answered 200 through the
  published port. True on 2026-11-26, a 404 now, so the file is struck from
  the list. The link from node 11 to node 9, whose note was about that OBJ, is
  removed.
- **Node 3, "Body, cloth and solvers"**: cited node 11 by its old title and
  said "the body model has two sources". Corrected.

Route: `kt_snapshot` (`before-body-source-removal`, 13 nodes) first, then
`kt_edit_start`/`kt_edit_dump`/`kt_edit_close` for every content change, never
`kt_update_node` with retyped prose — `kt_update_node` was used only for node
11's title and tags, which are metadata, not content. `kt_remove_link` and
`kt_delete_node` were driven from `node kt/bin/kt.js`, because the MCP
`kt_remove_link` rejected integer `to_id` with `Expected number, received
string` — worth knowing, and the CLI is the documented equivalent.

**Verified** by direct SQL over `docs/knowledge.db`, not only by the tree's own
full-text search (which ORs its terms and so cannot prove a phrase absent):
`makehuman`, `meshsurface`, `prep_bodice`, `params.source`, `two sources`,
`parametric or mesh`, `body source` and `photogrammet` all return **no node**,
and no tag matches `mesh` or `makehuman`. `kt_check` reports no problems. The
only `bodice` hits left are nodes 2 and 6, where it means the garment. The
pre-removal snapshot still holds the old content, and `kt/data/` is gitignored,
so it is not part of the committed tree.

## 7. Acceptance

**State:** **done** 2026-11-27. The gate is **306 pass / 0 fail**, exit 0.
Criteria 1-5 all met; 1 and 2 as amended below.

1. `grep -rni 'makehuman|meshsurface|bodice\.obj|prep_bodice'` over the
   repository, excluding `src/`, `kt/` and `.git/`, returns **only this pair in
   `todos/`** plus the one forward-looking licence note in
   `docs/08-local-toolchain.md` §2. **Amended 2026-11-27**: this first allowed
   a past-tense entry in `docs/07-sources.md`, and §5's reversal removed it.
   The criterion as first written was also too strict to pass at all — it would
   have forbidden the very "marked, not erased" notes the same spec then
   required, which is how the contradiction got noticed.
2. The same grep over `app/`, `tools/`, `test/`, `sim/` and `docker/` returns
   nothing at all. **Met.**
3. `node test/run.mjs` is **310 pass / 0 fail minus the four assertions
   removed with the mesh fixture = 306 pass / 0 fail**, with no new failure.
   Rule 6: this is run before committing, and it takes several minutes.
   **Met exactly: 306 PASS, 0 FAIL, exit 0** — counted off the run's PASS
   lines, because the suite prints `ALL CHECKS PASSED` and no total.
4. The viewer loads, shows the parametric body, and **K** drafts — driven
   headlessly with `python3 tools/viewshot.py`, not read off the source
   (rule 9). The `body` folder has no `source` dropdown. **Met**, twice: after
   item 1 and again after item 5's rename. Four meshes (66 / 630 / 812 /
   8991), no control matching /source/, `'source' in params` false, and **K**
   drafting `4 panels, waist ring 78.3 cm, hem 160 cm (flare 2.044x, gather
   1x)` with a 988-vertex skirt added to the scene — the same numbers before
   and after the collapse.
5. No document in `docs/` or `README.md` describes a mesh or scanned body
   source as available. **Met**, and after §5's reversal they do not describe
   it as having existed either.
