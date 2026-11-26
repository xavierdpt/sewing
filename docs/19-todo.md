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

**Opened 2026-10-17, from a report that the presets do not look like cloth.**

**Diagnosed and repaired over 2026-10-17/18**
([18-validation.md](18-validation.md) §6.11-6.16): `BEND_SCALE` in
`bending.js` was **30** and should have been **1.8** — a constant its own
comment says "in theory is 1", fitted on the one instrument that could not
see the error, because `peirce()` sizes its mesh as `asked / 12` and so
samples the solver at a single `edge / c` by construction.

**The fabric data was never at fault and `FABRICS` is untouched.** That was
the point of measuring before editing, and it held through **four** wrong
mechanisms, each plausible and each killed by the next measurement. §6.12
keeps the whole sequence rather than only the answer.

**REPAIRED 2026-10-18.** `BEND_SCALE` is **1.8**, down from 30, and the
gate is **310 pass, 0 fail** — including, for the first time, a bending
check that measures the material property (1.793 cm against an asked 1.7)
rather than the fixed-overhang quantity §6.9 withdrew.

Validated on three rigs that share no harness: the Peirce cantilever
(mesh-independent, 1.02-1.09 across a 4x range of element size), the Cusick
drape (seven presets spread 32.6-97.3 across their published class bands,
correctly ordered, against 87-98 for everything before), and the gate.

**The repair itself is done and has moved to the Done list.** What is still
open from it is a separate defect it exposed rather than caused: the garment
path over-folds against the oracle, and only half of that is the 3 cm
element. The first two items below are that, and the harness it is measured
with.

So the first item below is the repair that finding calls for, and the
fabric-authoring item stays last for the same reason it always did: there is
no point authoring parameters for a solver that cannot render the ones it
already has.

- [ ] **`tools/drape_blender.mjs` is not a pure comparison, and cannot
      answer the question it exists for.** Found 2026-10-18
      ([18-validation.md](18-validation.md) §6.15). `buildGarment()` sews the
      garment with THIS project's solver and hands the sewn mesh to Blender,
      so any change to our sewing moves the starting state for BOTH columns.
      It is sound as a same-day A/B and unsound across exactly the changes it
      is wanted for. Every cross-session figure in §6.11 is subject to this.

      **PARTLY FIXED 2026-10-18.** `BEND_SCALE` is now passed explicitly as
      `SEW_BEND_SCALE` where the fixture is sewn, the way `fabric` always
      was. Verified by flipping the shipped constant to 9.9 and back: ours
      moves 6.2 -> 6.8, **Blender stays at 2.23 to the digit**. Acceptance
      met for this term.

      *Still to do:* the same hole exists for every other sewing term —
      stretch compliance, feed rate, stitch model — and would move the
      fixture just as silently. Sew once, cache the welded assembly to a
      file, drape THAT in both. `--sew-cache <file>`, with the fabric and
      element size recorded in it so a stale cache cannot be used without
      noticing.

      *Acceptance:* changing ANY solver term changes our column and leaves
      Blender's identical.

      *Also open, same measurement:* our fold depths show **no ordering with
      stiffness** on this rig — denim (3.3 cm) deepest at 6.94, twill (5.0)
      at 2.47, poplin (1.7) at 6.20. The Cusick rig orders the same seven
      fabrics correctly at a 1 cm element, so this is the garment path at a
      3 cm element, not the fabrics. Two of seven also failed to settle.

- [ ] **The garment path over-folds by ~2.3x against the oracle, and the
      mesh only explains half of it.** Measured 2026-10-18
      ([18-validation.md](18-validation.md) §6.16). Denim: ratio 0.19 at a
      3 cm element, **0.44 at 1.5 cm**, both settled. Refining helps — the
      3 cm default is genuinely too coarse for the repaired cloth — and
      leaves us 2.3x deeper than Blender.

      **Both candidates eliminated 2026-10-18, and what replaced them is
      worse.** Seams: not applicable, the garment is WELDED after sewing so
      none exist at drape time — established by reading. Contact:
      exonerated, and backwards — removing the body collider makes our folds
      DEEPER (6.94 -> 8.81), so contact was suppressing them.

      **NEITHER SOLVER IS CONVERGED AT GARMENT MESHES.** Halving the element
      moves ours 1.3x and **Blender 3.0x** (1.32 -> 3.91), and neither has
      flattened. The 0.19 and the 0.44 are comparisons between two
      unconverged results: the ratio is a property of the mesh, not of
      either solver. **The oracle is only an oracle where it has converged,
      and nobody has established where that is.**

      *Do:* halve the element until BOTH columns stabilise — 1.5, 0.75,
      0.4 cm — on one fabric, and report where each flattens. Only then does
      a ratio mean anything. 1.5 cm already costs 313 s per fabric, so this
      is an overnight run; it may also show that a converged garment
      comparison is out of reach at interactive cost, which would itself
      answer several open questions.

      *Consequence for everything already recorded:* every garment-vs-oracle
      figure in §6.11 and §6.16 was taken at 3 cm or 1.5 cm. None of them is
      a converged comparison.

      *Also:* raise the comparison's default element from 3 cm, or report
      the ratio at two elements as standard, so no future figure is quoted
      from the coarse end alone.

- [x] ~~**`test/run.mjs`'s resolution-independence check is too loose to
      fail.**~~ **DONE 2026-10-18.** It settled a strip on a 1.0 cm mesh and
      asserted tip reach between 2.0 and 6.0 cm — a 3x window on a PROXY,
      which is why it passed throughout the period when the bending length
      was moving 0.93 to 3.93 cm across garment element sizes.

      It now measures **the bending length itself at 0.3 and 0.6 cm** and
      asserts they agree within **10 %**. Measured post-repair at **1.4 %
      apart**, so the threshold is seven times the observed margin: loose
      enough not to trip on solver noise, far tighter than the 2.5x the
      defect produced over the same range. Costs ~74 s, nearly all of it the
      0.3 cm bisection, and the comment says so.

      *Only possible after the repair.* Before it there was no baseline to
      tighten towards — the quantity itself was wrong, so a tight check
      would have been a second red light for one defect. That is why it was
      queued this morning rather than fixed on the spot.

      *The superseded item, for the record:*
      Found 2026-10-18 while repairing the cantilever swap. It asserts "the
      same cloth on a coarser mesh is still the same cloth" with a window of
      **2.0 to 6.0 cm of tip reach — a 3x spread** — while §6.12 measures the
      bending length moving 0.93 to 3.93 cm over the element sizes garments
      use. A check whose tolerance is wider than the defect it is named after
      passes through the defect, which is the same shape of fault as §6.13
      one check along.

      *Do:* tighten it to a stated factor on the MEASURED bending length at
      two element sizes, using `peirce()` with explicit `edge`, once the
      bending repair gives something to regress against. Not before — there
      is no baseline to tighten towards while the quantity itself is wrong
      (rule 6), and it would simply be a second red light for one defect.

      *Acceptance:* the check fails on today's solver and passes after the
      repair, with the two element sizes named in its message.

      *Not this:* editing `FABRICS`. The data is exonerated; §6.11 says why.

      *Gap not explained:* the drape at 1.5 cm wants a 29.5x softening; the
      cantilever at 1.5 cm shows a 12x excess. Same order, not the same
      number.

- [ ] **A test menu that answers "is this linen, cardboard, or cotton
      candy?"** Asked for directly: something you can run and look at. The
      project already specifies the instrument and never built it —
      [18-validation.md](18-validation.md) **Step 2, the Cusick drape test**
      (BS 5058 / ISO 9073-9), whose coefficient is literally that scale:
      `DC = (A_draped − A_support) / (A_specimen − A_support)`, **1** for a
      rigid sheet, toward **0** for a limp one. `tools/fabric.mjs` already
      carries `(80 gsm office paper)` in its published table, so the cardboard
      end of the comparison is in the repo too.

      *Do:*
      1. ~~`tools/drape_coefficient.mjs`~~ — **done 2026-10-17**, with
         `app/js/cusick.js` as the three.js-free half so the viewer entry can
         call the same code. DC, fold count, published class bands, a verdict
         per fabric, the mesh's fold ceiling beside the count, and `settled` /
         `starShaped` validity flags per row. First results in
         [18-validation.md](18-validation.md) §6.12: **every preset reads as
         card**, poplin at DC 96.4 against a 40-65 class band.
      2. ~~Rename `drop test ▾` to `tests ▾`, and add `drape (Cusick)`~~ —
         **done 2026-10-17**, driven end to end in the page: menu → dialog →
         `drape a specimen` → `measure it`, reporting DC against the fabric's
         published class band. It drapes beside the body in free air with no
         collider, as the standard apparatus does. One bug found only by
         looking at the screenshot: the specimen dropped off the edge of the
         screen, because `frameScene(true)` frames the BODY. The test ran
         perfectly and was invisible. `frameOn()` fixes it.
      3. ~~Add **cantilever (Peirce)**.~~ **Done 2026-10-18**, driven end to
         end in the page: `tests > cantilever (Peirce) > measure the current
         fabric` reports **1.793 cm against an asked 1.7, published 1.5-2**
         — identical to `test/run.mjs` and `tools/fabric.mjs`, because all
         three now call one `peirce()` in `app/js/cantilever.js`.
         `PUBLISHED_BEND` moved there too, so the page quotes the same band
         the tool does rather than keeping a second copy.

         It defaults to a **0.6 cm element**, with the reason in the code:
         converged at the page's substep count (1.793 at 20, 1.815 at 160)
         and ten seconds rather than two hundred. It reports the row count
         and warns below four rows, because a coarse mesh silently cannot
         measure a limp cloth (§6.12).
      4. **`against Blender` — HELD, deliberately, 2026-10-18.** It would
         put the oracle comparison in front of a person at whatever mesh the
         viewer runs, and §6.16 established that **neither solver is
         converged at garment meshes**: halving the element moves ours 1.3x
         and Blender 3.0x. A button reporting that ratio as a verdict would
         ship exactly the error the rest of this queue is about — a number
         presented as a judgement when it is a property of the mesh.

         *Unblock it with the convergence sweep.* The entry should then
         report the element it measured at, and refuse a verdict where the
         oracle has not flattened.

      *Acceptance:* each entry driven through the page, each reporting a
      number against a published band rather than a picture alone.

      *Note what the first Cusick run cost, because it is the general
      lesson:* the fold counter reported 30 folds against a mesh ceiling of
      23, i.e. more folds than the triangles can represent, and it did so most
      confidently on the specimens that did not drape at all — a nearly
      circular outline is all noise, and every noise peak counted. The
      ceiling column, added so that a mesh-limited result could not be
      mistaken for a material one, caught it within the hour on its author's
      own code. Build the readout that says when the instrument is lying
      before trusting the instrument.

- [ ] **Custom fabrics, carrying Blender's full parameter set.** Asked for:
      create new cloths beside the seven examples, and have the cloth
      parameters include everything Blender exposes.

      The surface, counted from source rather than memory
      (`src/blender-fork/source/blender/makesrna/intern/rna_cloth.cc`, rule 8):

      | | parameters |
      |---|---|
      | Blender `ClothSettings` | **61** |
      | Blender `ClothCollisionSettings` | **13** |
      | — of those, scene wiring, not fabric | 12 (seven `vertex_group_*` names, the collider `collection`, `rest_shape_key`, `effector_weights`) |
      | what the side-car actually sets (`blender_drape.py:118`) | **11** |
      | what `src/sewcloth` honours | ~8 (mass, tension, damping, gravity, thickness, friction, self-collision distance, hinge α, strain limit) |
      | what this project's presets carry (`cloth.js:74`) | **7**, all physical |

      **The unresolved design question, which blocks the build:** this
      project's seven are *measurable* — gsm, a Peirce bending length in cm, a
      strain limit, a trellis angle — and `cloth.js` argues for that at
      length. Blender's are dimensionless solver gains (`tension_stiffness
      15`, `bending_stiffness 0.5`). So "include all of Blender's" can mean
      *alongside* the measured ones, with the Blender layer derived and
      overridable, or *instead of* them. The second spends something this repo
      paid for, and the item above may change which of them is trustworthy
      anyway — **which is why this is third and not first.**

      **THE DESIGN QUESTION IS ANSWERED, on evidence rather than taste, and
      the record exists.** `app/js/fabricio.js`, 2026-10-18: physical fields
      primary, Blender's set derived from them.

      The argument is the one this session produced. The presets looked
      wrong for days and the cause was `BEND_SCALE`, out by 16x. It was
      findable **only because `bendLengthCm` has a published range to be
      wrong against** — poplin read 3.93 cm where the literature says
      1.5-2.0. There is no published band for `tension_stiffness = 15`, so
      the same defect expressed in Blender's parameters would have been
      invisible. *A fabric record whose numbers cannot be wrong is a fabric
      record that cannot find a bug.*

      Every authored field is measurable — a kitchen scale and a 10 cm
      square for gsm, ASTM D1388 for the bending length (and
      `tests > cantilever (Peirce)` runs the same test on the simulated
      cloth, so the two are directly comparable), a protractor for the
      trellis angle. The two that are not — `friction`, `damp` — carry
      `measurable: false` so the UI can say so rather than imply a tape
      measure exists for them.

      **Built:** `fabricFrom`, `checkFabric`, `exportFabricJSON`,
      `importFabricJSON`, `fabricFileName`, `FABRIC_FIELDS` with ranges and
      provenance notes. Round-trips, drops unknown keys and reports them,
      validates with specific complaints.

      **Still to do:**
      - wire it into the `cloth` dialog: pick a fabric including custom
        ones, "new from this one", edit the fields with their notes as
        tooltips, save and load to file and `localStorage`;
      - the Blender override layer — `clothSettings()` in `drapejob.js`
        already derives Blender's parameters from the physical ones; what is
        missing is a per-fabric override where the derivation is known to be
        poor, and a marker on each field saying which backends honour it;
      - the seven examples stay read-only, so `cotton poplin` keeps meaning
        what [18-validation.md](18-validation.md) means by it.

      *Original storage note, still the plan:* follow `formio.js` exactly — a `triangulated-bodice-fabric/1` JSON file plus
      `localStorage`, the same shape the dress form already uses. New fabric
      starts as a copy of the selected one; the seven examples stay read-only,
      so `cotton poplin` keeps meaning what [18-validation.md](18-validation.md)
      means by it when it quotes a result. Every field marked with which
      backends honour it, shown in the UI — 74 equal-looking sliders where ~8
      reach the in-page solver is rule 9's house error at scale.

Three interface items opened 2026-10-17, while answering what the menubar's
leftmost cell did. They are small, and none of them is a solver question;
they are on top because this document puts the newest there, not because they
outrank the pattern-editor six below.

- [ ] **Eleven of the fifteen sections are still in the single panel.**
      `17-interface.md` opens by naming that panel as the problem — the folder
      you want is scrolled off, and two you want to watch at once cannot both
      be open — and four sections have moved to the bar since: `files`,
      `cloth`, and the two drop tests, which now share one `drop test ▾`
      menu. Those four are the testing corner. Measured on the running page,
      what is left in `gui` is
      everything a person uses to *make a garment*: body, shell (step two),
      fit, explicit joining, pattern, try a pattern on, flare and gathers,
      sewing by hand, the drape, the cutting table, view.

      *Do:* move them, newest-pressed first — *the cutting table* and *sewing
      by hand* are the two that want to be open beside the garment at once,
      which is the case the dialogs were built for. One per commit, and
      **group as you go**: `MenuBar.menu` exists now (17-interface.md), so
      *pattern*, *try a pattern on*, *flare and gathers* and *the cutting
      table* want one entry between them rather than four, the same way the
      drop tests do. Grouping afterwards is a second pass over the same
      files.

      *Acceptance:* each move driven through the page, not just the source
      (rule 9), and `refreshGUI()` — not `gui.controllersRecursive()` — kept
      as the refresh path, or the moved dialog shows stale numbers after a
      programmatic `params` change.

- [ ] **The help strip is wrong about a key someone presses.**
      `app/index.html:109` advertises `T try on`; `main.js:3345` binds `t` to
      `openTable()`. Try-on is reachable only from the panel's *try a pattern
      on* folder. This is rule 9's failure on the one line of the page whose
      entire job is to say what the keys do.

      *Do:* check the whole strip against the handler at `main.js:3323`, not
      just this entry — a line that was wrong about one key has no claim to be
      trusted about the rest.

      *Acceptance:* every key the strip names dispatched as a real `keydown`
      and the resulting call named, so the strip is a measurement rather than
      a caption.

- [ ] **The lil-gui panel is still titled `'bodice'`** (`main.js:2331`) — the
      same constant the menubar stopped claiming on 2026-10-17, one panel
      over, wrong the moment `params.garment` is `skirt`, `dress`, `torso` or
      `full`. Small, but it is the last copy of the lie.

      *Do:* title it from `params.garment`, refreshed where the garment
      changes. *Acceptance:* draft a skirt through the page and read the
      panel title back.

The pattern editor's five items are done (below). Building them opened these
six, which are the pattern-editor queue now. None of them displaces the
sewing-frame item further down; they are here because this document puts the
newest on top.

- [ ] **`check()` cannot see a seam lose a stitch.** It compares the two sides
      of a seam by LENGTH, and a seam's sides can have the same length and
      different vertices. Measured: cutting a piece across its two side seams
      with `propagateSplit` disabled gives **63 stitches instead of 65** --
      two points of a seam with no partner to be sewn to -- while `check()`
      reports `ok`, no problems, and a worst seam mismatch of **0 cm**. A
      split along a straight edge costs no length, which is exactly why a
      length test cannot find it.

      *Do:* have `check()` compare the two sides of every seam by the vertex
      ids they carry, and report the ids that are on one side only, with the
      seam and the piece they are on -- a list, not a count (rule 2).
      `layOut(...).stitches.length` is the number that moved; `check()` should
      not need the assembler to notice.

      *Acceptance:* the disabled-propagation case fails `check()` with the two
      lone ids named, and the gate keeps it failing.

      *Why it is first of these:* every other item here is a feature. This one
      is the instrument being wrong, and the editor's whole safety net is
      `check()` running after every edit.

- [ ] **A cut and a join are recorded as coordinates, so they do not replay
      onto another body.** Darts and spreads record a construction -- a
      fraction along a named edge and an offset in from it -- and replay onto
      a skirt 6 cm wider in the waist with nothing skipped. `splitPiece`
      records `from` and `to` as raw points on the table, and `joinPieces`
      records two piece names. So a pattern whose seam lines were moved
      replays those moves onto whatever happens to be at those coordinates.

      *Do:* record a cut as the two edges it runs between and the fraction
      along each (`describeApex` already does the measuring half), and resolve
      it the same way on replay. A join needs nothing new -- it names pieces
      -- but it should refuse rather than guess when the named pieces no
      longer share a seam.

      *Acceptance:* a cut replayed onto a body 8 cm bigger lands on the same
      place of the piece, measured as the fraction along the edges it ends on,
      and the gate covers it beside the dart case.

- [ ] **The allowance and the grain are set for the whole pattern, or for
      piece 1.** The data model is per RUN (`r.allowanceCm`) and per piece
      (`panel.grainDeg`, `panel.allowanceCm`), and the SVG honours all of it.
      What the viewer offers is three numbers for the pattern and a grain
      slider wired to `panelIndex: 0` -- which is the house error in miniature:
      the capability is there and the thing a person presses cannot reach it
      (rule 9).

      *Do:* a piece has to be selectable on the table first -- click to select,
      the HUD says which -- and then the allowance and grain fields apply to
      the selection. Per-edge allowance wants the edge selectable too, which is
      the same mechanism one level down.

      *Acceptance:* a hem allowance set on one piece and not its neighbour
      prints that way, driven through the page rather than through the
      functions.

- [ ] **Seamly2D's corner modes and notch shapes, which were left out on
      purpose and are now the cheapest thing left.** `offsetPoly` turns every
      corner with a fixed `miter = 3.0`, where their `PieceNodeAngle`
      (`src/seamly2d/src/libs/vmisc/def.h:172`) offers six answers to what the
      allowance does at a corner, and their `NotchType` (`def.h:237`) seven
      notch shapes by three subtypes where this draws one slit.

      *Do:* the corner modes first, because a mitred corner that is wrong is
      cloth cut away that cannot be put back; the notch shapes are cosmetic
      and can follow. Both are print-time only -- nothing about the mesh or
      the ids changes.

      *Acceptance:* the corner of a 1 cm allowance meeting a 2.5 cm hem comes
      out where the chosen mode says it should, measured on the SVG.

- [ ] **A refused join has a right answer that nothing offers.** Two pieces
      flattened separately do not share an edge shape, so joining them past
      the tolerance would stretch the cloth; `joinPieces` refuses and names
      the worst vertex. The honest way on is to **re-unfold the shell with
      those two panels as one**, which `makePattern` can do and nothing wires
      to the refusal.

      *Do:* when a join is refused, offer the re-unfold: coarsen with the two
      panels merged, flatten, and lay the result back on the table. The edits
      recorded against the old pieces then have to be replayed onto the new
      one, which is what the edit list is for.

      *Acceptance:* a join refused at 0.8 cm, re-unfolded, comes back as one
      piece with the darts still in it.

- [ ] **Undo keeps fifty copies of the pattern beside a list that says what
      changed.** Now that `pattern.edits` exists, undo could be "replay the
      first n-1 edits onto the draft", which is smaller, and would let a
      person remove an edit from the MIDDLE of the list -- which is what
      Seamly2D's History panel is actually for.

      *Do:* not until the replay is exact for every operation, which the
      coordinate items above are in the way of. Measure first: replay the
      current fixture's edits and compare the result to the pattern they came
      from, vertex by vertex, and see whether the difference is zero or merely
      small.

And what is already done. The five pattern-editor items that stood here from 2026-10-17 are **done**,
and are recorded in [14-editing.md](14-editing.md) §6 with the numbers they
produced — truing the darts and the closed-dart profile, the rigid transforms
and cut-on-fold, cutting a piece in two and joining two into one, the edit
list and its replay onto another body, and the per-edge allowance and grain.
That is a deviation from the rule above, and a deliberate one: those items
settled nothing in [18-validation.md](18-validation.md), which is about the
solver, so the record lives with its subject. `node tools/edits.mjs` is the
instrument, and the gate covers every one of them.

- [ ] **Find what the viewer spends a sewing frame on, and stop doing it every
      frame.** The wasm solver steps the darted skirt in **17 ms**; the page
      takes **210-440 ms a frame** sewing the same garment. So ~95 % of the
      frame is the viewer, not the physics.

      *Do:* profile the frame part by part in the page -- `wasmSew.step`,
      `mirrorOnto`, `updateClothMesh`, `updateStitchLines`, `updateHUD` -- and
      cut what the screen does not need between one creep of the feed and the
      next. Caching the HUD's `sim.report()` was tried first and **did not
      help**, which is the measurement refusing a hypothesis: do not guess
      again. Known suspects, all self-inflicted: `mirrorOnto` does three
      per-stitch readbacks (gaps, tensions, peaks) every frame and the stall
      check a fourth, each a malloc/ccall/copy/free over 134 stitches, for
      numbers nothing reads until the pass ends.

      *Acceptance:* a sewing frame inside 33 ms in the page on the darted
      four-panel skirt, with the breakdown recorded so the next person does
      not have to re-derive it; and the per-frame path containing nothing that
      is not drawn.

      *Why it is first:* it is the complaint that started this -- "W is still
      slow" -- and it is still true in the only place that counts, which is
      the page.

- [ ] **Verify X headlessly, because it has now broken twice in one session
      and a person found it both times.** Once the drape function was deleted
      by an unrelated edit (`sendToWasm is not defined`, X threw and the
      garment never fell); once the branch that steps it was placed behind
      `stepFrame`'s `if (!(playing && sim)) return;` while the drape path sets
      `playing = false`, so X announced itself and nothing moved. Neither is
      subtle; both survived because nothing in this repository presses X.

      *Do:* a scripted J → W → X in `tools/viewshot.py` that waits for the
      sewing pass to end, presses X, pumps frames, and asserts three things:
      the drape's frame counter ADVANCES, the garment's lowest vertex MOVES,
      and the completion line is printed. Headless Chrome does not fire rAF,
      so it has to drive `__pump` and that is what makes the run slow -- which
      is the reason it keeps being skipped, and the reason it has to exist.

      *Acceptance:* the check runs in `node test/run.mjs`'s neighbourhood or
      as a named tool, and fails if X stops stepping.

- [ ] **Give `sim/blender_show.py` a camera and a light.** It clears to an
      empty factory scene, so Blender reports "no camera found in scene" and
      the file cannot be rendered, only orbited. One camera framed on the
      body, one sun, neither touching the physics.

- [ ] **Look at the 50 % grain strain the weld reports.** The sewing phase
      reports 7.6 % on the same garment and the weld then says 50.4 %, 8.3x
      the fabric's limit. It is a MAXIMUM over edges, so per rule 2 the first
      thing is the distribution -- how many edges, where, and whether they are
      the dart legs that were just merged -- not a fix.

The next two came out of the recovery in
[00-backtotrack.md](00-backtotrack.md) §7–§9 on 2026-10-16 and are ahead of the
validation work, which stays suspended while that document is open. A third —
the sewing feeding for ever on a seam that would not close — was queued here
and then closed on the same day: it was the dart legs being paired by index
instead of by Thales, and with that fixed the garment sews in 88 frames
([00-backtotrack.md](00-backtotrack.md) §8 and §9).

- [ ] **Put the sewing in wasm.** X runs in the page at 8.8 ms a frame and W
      does not: **126 ms/frame (7.9 fps)** on the plain four-panel skirt, and
      212 ms/frame with the asymmetric darts in. Profiled
      (`node tools/profile.mjs --scenario sew`), the time is **58.4 %
      `_solveHinges`**, 21.6 % `_substep`, 4.4 % `_dampAlong` — and 0.8 %
      `_solveStitches`. The stitches are not the cost; the bending is.

      *Do:* not a port of the sewing. In order:
      **(1) done 2026-10-17** — `sc_set_hinges`, `sc_hinge_count`,
      `sc_set_bend_sweeps` and the dihedral solve in
      `src/sewcloth/src/sewcloth.c`: the XPBD constraint from `cloth.js`
      line for line, lambdas accumulated across a substep's sweeps and reset
      between them, projected after integration and before contact. Held to
      its gradient by `src/sewcloth/test/test_hinge.c` — flat cloth untouched
      to 1e-4 cm, a 90° fold driven flat from either side and never further
      open, a stiffer hinge measurably ahead of a softer one, and every one of
      the four vertices of a hinge moving towards flat under a finite
      difference of the angle. `capabilities.bending` reports 1 and the smoke
      test fails if it ever stops matching. **Wired to nothing yet**, which is
      step 5;
      **(2) done 2026-10-17** — `sc_set_stitches`, `sc_set_stitch_params`,
      `sc_set_sew_speed`, `sc_arm_stitches`, and `sc_stitch_gaps` /
      `sc_stitch_tensions` / `sc_stitch_peaks` / `sc_feed_left` /
      `sc_is_sewing` reading back **per stitch**, never as a scalar, because
      which seam is open and by how much is the question a fitting asks
      (rule 2). One-sided and force-limited, as in `cloth.js`: slack does
      nothing, and the accumulated multiplier clamps at the gram-force limit so
      a seam that cannot close saturates and stays open. `test_stitch.c` holds
      it to that — a 10 cm seam closed in exactly two seconds at 5 cm/s, the
      same closure at 4 and at 16 substeps (the rate is per second, not per
      iteration), a slack thread moving nothing and pulling nothing, and a
      0.1 gf limit leaving 9.18 cm open with the tension parked at the limit.
      Three faults of my own came out of it: a rest length that crawled to
      2e-6 cm and so never stopped feeding, `sc_is_sewing` answering yes with
      the feed rate at zero, and no way to read the peak tension — which is
      the number a seam report is made of, since the instantaneous one is near
      zero whenever the cloth has caught up;
      **(3) done 2026-10-17** — `app/js/sewwasm.js`: `WasmSewing`, a garment
      being sewn that lives across frames (X is one solve, W is watched), plus
      a headless `sewWasm` for the trace and the tests. `wasmcloth.js` gained
      `setHinges`, `setStitches`, `setStitchParams`, `setSewSpeed`,
      `armStitches` and the per-stitch readback. The hinge topology moved out
      of `cloth.js` into `app/js/bending.js` on the way -- part of step 6, done
      early because both solvers now need the same quadruples and deriving
      them twice would be two chances to disagree;
      **(4) done 2026-10-17** — `node tools/trace.mjs --sew-wasm` sews the
      four-panel skirt through sewcloth in the same table as everything else;
      **(4b) done 2026-10-17** — `sc_set_strain_limit` and
      `sc_strain_residual`: the fabric's measured ceiling, swept until nothing
      is over it, applied last in the substep so a seam that closed by
      stretching the cloth is pulled back. `test_strain.c` holds it — an
      unlimited soft spring stretching the 49 % its load demands, the same
      spring held at **6.1 %** with no residual, jersey's 25 % honoured as
      25 %, and slack cloth untouched because a clamp that also pushes is a
      rod. On the garment, sewn through wasm: peak strain **34.5 % → 6.59 %**,
      and the drape afterwards goes from 0.38 % of the cloth inside the body
      to **0.01 %**, deepest −0.434 cm → **−0.002 cm**, settling in 2.6 s. The
      seam gap loosened from 0.084 to 0.172 cm — the limit now competes with
      the feed, which is the trade `cloth.js` spends sweeps on — and 0.172 is
      still inside the 0.25 cm weld tolerance. It was found like this:
      **(4b, as reported before it was fixed): the wasm sewing stretches the
      cloth.**
      It closes the seams -- 0.084 cm worst gap against the weld tolerance of
      0.25, feed fully taken up, 145 frames at **24.1 ms/frame against
      cloth.js's 126**, which is the 5x the port was for -- but peak strain
      comes out at **34.5 %** where `cloth.js` leaves 1.9 %, and the drape
      afterwards puts 0.38 % of the cloth inside the body instead of 0.11 %.
      The cause is the line of §8's inventory that was already suspected:
      `_clampStrain` enforces the fabric's measured strain limit every substep
      and **sewcloth has no such stage**. This is the same missing piece as
      item 2's 6 %-long hem, now visible on a garment rather than inferred.
      *Do it before step 5* -- wiring W to a solver that stretches the cloth a
      third of its length would be a regression someone would have to report;
      **(5) in hand 2026-10-17** — `params.sewBackend` ('wasm' by default,
      'cloth.js' beside it for comparison), `startWasmPass` / `endWasmPass`,
      and `stepFrame` driving the wasm pass. The stitch records stay `sim`'s
      and `WasmSewing.mirrorOnto` keeps them true, so the HUD, the seam
      report, the stall detector and the weld all read the same objects they
      always did — a backend swap that rewrote those would be a second place
      for the garment's state to live. Two faults found by driving the page:
      the module takes ~1 s to arrive and **cloth.js was sewing in the
      meantime** (4.2 cm of 17.3 taken up by the solver being replaced), fixed
      by holding the garment until the pass exists and by asking for the
      module at startup; and a pass that starts has to SAY which solver is
      sewing, or nobody can report a bug against the right one (rule 9).
      **(5b) NOT A SOLVER FAULT — the pattern was 16.6 cm short.** Reported
      from the screen while this was being written: *"it's normal to not be
      able to close a dart if there's not enough circumference on the body to
      take all the fabric"*, and the arithmetic agrees. A skirt drafted to the
      body's waist holds exactly the cloth the body needs; every centimetre a
      dart removes is a centimetre the waist seam no longer has. Measured, the
      fixture at 2x takes **16.59 cm out of a 78.28 cm waist** against
      **3.76 cm** of give in a woven at its 6.1 % limit. So it could not
      close, and the 1.8 cm of open seam was the pattern, not sewcloth.
      Fixed where the fault was: `dartedSkirt` drafts the skirt **wider by the
      dart allowance** in two passes -- draft at the body's waist to find out
      what the fixture takes, then draft that much wider and cut for real --
      so what is left after the darts still fits the body. In the viewer, the
      same garment now takes up its whole feed with **one** seam 0.3 cm short
      instead of three at 1.1-1.2 cm. `dartAllowanceCm` is the number, and it
      is printed when the darts are cut.
      **(5b, as first diagnosed and wrongly) the wasm pass cannot close a
      DART.** Measured on the asymmetric fixture at 4 cm/s,
      1,170 vertices, 135 stitches: `cloth.js` closes everything in 88 frames
      to a worst gap of 0.324 cm; sewcloth runs the whole feed and leaves
      **1.76 cm** open, far outside the 0.25 cm weld tolerance, so the garment
      comes out unsewn. The plain skirt is fine (0.172 cm), which is what
      names the difference: a seam drags a neighbouring panel, a dart pulls
      against its own. sewcloth's stretch is implicit SPRINGS where cloth.js's
      is a swept distance constraint, so the panel deforms instead of
      travelling and the strain limit then pulls the deformation back out.
      Found by the feed-slack sweep: at 0.5 and 1.0 cm of slack the pass hits
      the 3,000-frame cap with feed still left; at 2.0 it runs the feed out in
      exactly the 260 frames it should and still leaves 1.76 cm. *Do:* give
      sewcloth a swept distance constraint for the stretch, or raise the
      spring stiffness until the panel travels, and decide which by the gap on
      this fixture. Until then `params.sewBackend` defaults to 'cloth.js';
      **(5, as specified) wire W to it** — `toggleSewing` arms the stitches in the wasm
      cloth and `stepFrame` steps *that* instead of `sim.step(dt)`, reading
      the positions back zero-copy each frame and keeping the HUD, the stitch
      lines, the stall detector and the seam report fed from
      `sc_stitch_gaps`. **This is the step that makes the port visible to
      anyone**, and it is deliberately last: nothing above it changes what the
      viewer does, and this changes nothing else;
      **(6)** once the two agree, delete the JS sewing — which is where
      `cloth.js` goes.

      *One design note for (5), because it is not `drapeWasm` again.* X is a
      one-shot solve: create a cloth, step six seconds, hand back the vertices,
      dispose. W is **interactive** — the point is watching the seams close, a
      frame at a time, with the person free to press W again and stop it. So
      the wasm cloth has to **live across frames**: built when the pieces are
      laid out, stepped once per rendered frame, rebuilt when the garment is,
      destroyed when it is cleared. `drapeWasm`'s create-step-dispose shape is
      the wrong one to copy; `WasmCloth` already supports the right one, which
      is the reason `sc_positions()` returns a pointer that never moves.

      *Acceptance:* the four-panel skirt sews at **under 16.7 ms a frame**
      with the same seam gap as `cloth.js` to within the weld tolerance
      (0.25 cm), the constant-rate feed preserved — it closes seams to
      0.024 cm where Blender's own sewing springs leave 9.2 cm, which is why
      it is this project's and not Blender's — and the gate green.

      *What W actually triggers, which is the thing to be ported.* Pressing W
      calls `toggleSewing` → `sim.startSewing(pred)` + `armStitches`, sets the
      phase to `stitching`, and from then on every frame is
      `stepFrame` → `sim.step(dt)` → `_substep` × `substeps`. So the port is
      `_substep`'s chain, stage by stage, and most of it is already there:

      | per substep, in `cloth.js` | in sewcloth? |
      |---|---|
      | integrate + external forces | **yes** |
      | stretch sweeps (XPBD distance) | as *springs* in an implicit solve — a real divergence, and the comparison decides which the sewing phase wants |
      | `_solveHinges` | **no** — `capabilities.bending = 0` |
      | `_projectContacts` (SDF) | **yes**, and it now matches the oracle's clearance |
      | `_solveStitches` + `_feedStitches` | **no** — `capabilities.stitches = 0` |
      | `_readStitchTensions` | **no** — needs gaps and tensions back out, per stitch |
      | self-collision | **yes**, by vertex distance; `cloth.js` does primitive pairs |
      | `_dampAlong` (damping along constraints) | **no** — sewcloth damps globally |
      | `_clampStrain` (the measured strain limit) | **no** |

      The bookkeeping either side — `startSewing`, `stopSewing`,
      `armStitches`, `stitchReport`, `maxStitchGap`, `remainingFeedCm` — can
      stay in JS, provided the gaps and tensions come back from wasm per
      stitch.

      *And one line of that table probably explains the OTHER open item:*
      `_clampStrain` enforces the fabric's measured strain limit, a 6.1 %
      woven floor, and sewcloth has nothing of the kind — while the wasm drape
      settles with a hem **6 % longer** than it was cut. Worth testing before
      anything is tuned: the two items may have one cause.

      *The design, derived 2026-10-17 so it is not re-derived:* sewcloth is a
      **force** solver — backward Euler with a filtered conjugate gradient over
      springs — and both of the pieces it is missing are **constraints** in
      `cloth.js`: an XPBD dihedral hinge with rest angle 0 and a compliance,
      and an XPBD one-sided distance stitch whose accumulated multiplier is
      clamped at `maxTensionGf` so the seam saturates and stays open rather
      than being forced shut. They do not become springs. Blender's own
      sewing springs are the thing this project measured at 9.2 cm against
      0.024 cm, and its bending springs are what `docs/20-fork.md` §9 shows
      allowing 26.6 % strain at p95. So sewcloth gains a **projection stage**
      after integration — lambdas per substep, swept, exactly as
      `_solveHinges` and `_solveStitches` do it — and the two implementations
      are then checkable against each other constraint by constraint, which is
      the only reason to write the second one.

      *Then, and only then:* `BodyCollider` and `FABRICS` move out of
      `cloth.js` into their own modules — they are a collider and a table, not
      solver code, and `clearance.js`, the viewer, the tools and the gate all
      depend on them — and **`cloth.js` is deleted**
      ([16-solvers.md](16-solvers.md) §3b has the inventory). Not before: it
      is the only thing in this project that can sew, so deleting it first
      would leave no way to assemble a garment at all.

      *Why it is first:* W is now the whole wait, it is the last phase that is
      not in wasm, and **`cloth.js` is to be deleted** — so this is not an
      optimisation of it, it is the port that lets it go
      (the drape is already wasm-only in the page, and the side-car is out of it
      as of 2026-10-16). What moves is the *algorithm*, the
      constant-rate feed that beats Blender's sewing springs 0.024 cm to
      9.2 cm; the file it currently lives in is not what won.

- [ ] **Map the fabrics onto sewcloth, measured against the oracle.**
      **Every number in this item is void and has to be taken again:** it was
      measured while gravity pulled the cloth along the body's back
      ([00-backtotrack.md](00-backtotrack.md) §7b), so the "6 % long hem" and
      "2 folds instead of 4" describe a garment being dragged sideways rather
      than a fabric. With down pointing down the same drape settles at
      160.04 cm against 160 cut, in 8 folds. Re-measure first; there may be
      nothing left to map. The wasm drape gets **contact** right — 0 % of the cloth inside the body,
      stock Blender's own clearance, in a sixtieth of its time
      ([16-solvers.md](16-solvers.md) §3b) — and gets **stretch** wrong:
      169.68 cm of hem where the pattern was cut at 160 cm and both the oracle
      (160.07) and `cloth.js` (159.99) settle within 0.1 cm. About 6 % long,
      and 2 deep folds where the oracle throws 4, which is the same fact seen
      from the side.

      *Do:* sewcloth takes mass, tension and damping; `FABRICS` carries a
      bending length and a **measured** strain limit, and nothing maps one
      onto the other — the viewer passes friction and thickness and lets the
      rest default. Find the mapping by measurement against the side-car, not
      against `cloth.js`: it is derived from Blender, so the parameters it
      wants are Blender's, and `tools/drape_blender.mjs` already compares the
      two on one metric.

      *Acceptance:* hem length within the weld tolerance of the oracle's on
      the four-panel skirt, fold count equal, for each of the named fabrics
      that has a reference run — or the residual stated as the bound sewcloth
      diverges by, which is the contract its own README claims and does not
      yet quantify.

      *Why it matters:* this is now the only thing between the wasm drape and
      being simply the drape.

- [ ] **Validate the time integration against two closed forms.** The
      remaining analytic half of [18-validation.md](18-validation.md) Step 5.
      Nothing in this project checks the integrator itself: every finding so
      far has been about a constitutive model or an instrument, and the
      stepping has never been compared with an answer known in advance.

      *Do:* two cases, both cheap and both exact.
      **Free fall** — a disc with no body, no pins and `linearDragPerSec: 0`:
      the centre of mass must fall `½gt²` and every vertex must stay at the
      same relative position. This checks gravity, the integration, and
      whether the velocity clamp (`maxVelocity: 400`) silently truncates a
      real fall. **Rest** — the same disc fully pinned, and separately laid on
      the floor: nothing may move, and `kinetic()` must stay at zero rather
      than drifting.

      *Acceptance:* free-fall displacement within 1 % of `½gt²` over 1 s at
      the default substep count, with the deviation reported rather than
      asserted away; `kinetic()` bounded below a stated floor over 5 s at
      rest for all seven presets.

      *Why it is first:* it is the cheapest unexamined layer left, and it
      bears directly on a known open question — the denim bounce is **half
      numerical** (8× the substeps halves the rebound without removing it,
      §6.7/Step 5), and separating the solver's contribution from the cloth's
      needs an energy measure that does not yet exist. A drift number also
      tells us whether the 4-substep catastrophe was energy injection or
      merely under-resolution.

---

## Decisions outstanding

Live entries from [18-validation.md](18-validation.md) §8. Listed here so this
file is the only place that has to be read to know what is next.

- **§8.3 — Step 7: remesh, side-car, or a documented ceiling?** Partly
  pre-empted: `docs/16-solvers.md` §3 already sends drape to the side-car and
  §6 records that C-IPC builds. What is open is the *boundary* — which mesh
  densities stay in `cloth.js` and which go over the wire.
- **§8.4 — which physical measurements will actually be made?** **Largely
  dissolved 2026-10-12.** It was being treated as a blocker when most of what
  it blocked was either computable or already published. The shear geometry is
  computed (`tools/shearnet.mjs`), the locking angles are literature values in
  `FABRICS.shearLockDeg`, the strain limits came from `sim/cipc/fabrics.md`,
  and the bending lengths were always published ranges. What a physical
  measurement would still *refine*, rather than unblock: the locking angle of
  a specific cloth (one square and a protractor — shear it until it ripples),
  and the crease pitch on a draped disc, which is the only number in the
  project that came from looking at real fabric and currently sits at ~1 cm
  from a single observation.

---

## Done

Removed from the queue and recorded in [18-validation.md](18-validation.md),
except where an item is interface rather than solver and its record is in
[17-interface.md](17-interface.md):

- **A dialog title is a name, not a sentence** — done 2026-10-17. Three of
  the four titles were sentences, and `.dlg-title` clips with an ellipsis at
  the dialog's own width, so the explanatory half was precisely the part
  nobody could read: `the cloth itself -- shared by every test` measured
  379 px into a 357 px bar and showed `...shared by every te`; the accordion's
  427 px showed `...the pleated strip, for th`. Split into `title` (a name)
  and a new `hint` (a tooltip on the title bar and on the entry that opens
  it, so it is readable *before* the dialog is open). All four now fit at
  357/357. Gate green across these three interface changes: **310 pass, 0
  fail**, twice — though note the gate exercises the headless pipeline and has
  no check that would notice a broken menubar, so what actually verifies them
  is `tools/viewshot.py` driving the page. Two of the qualifiers were
  scaffolding the bar had already replaced — `drop test -- ` repeated the menu the dialog sits under, and
  `the cloth **itself**` distinguished the fabric from the tests that use it,
  which a separate `cloth` entry says structurally. Recorded at
  [17-interface.md](17-interface.md).

- **Why the presets did not look like cloth: `BEND_SCALE` was 30 and should
  have been 1.8** — diagnosed and repaired 2026-10-17/18, recorded at
  [18-validation.md](18-validation.md) §6.11-6.16.

  One line in `app/js/bending.js`. Validated on three rigs sharing no
  harness: the Peirce cantilever (1.793 cm against an asked 1.7,
  mesh-independent across a 4x range of element size), the Cusick drape
  (seven presets spread 32.6-97.3 across their published class bands,
  correctly ordered, against 87-98 for every one of them before), and the
  gate (**310 pass, 0 fail**, its bending check green on the material
  property for the first time).

  **The data was never at fault**, which was the point of measuring before
  editing: `FABRICS` is untouched.

  *The diagnosis was wrong four times before it was right* — cotangent
  weights, `BEND_SCALE` as a free-standing fudge, mesh dependence, then a
  constant with the mesh dependence explained away as a substep artifact.
  Every wrong reading is left standing in §6.12 rather than deleted, because
  the pattern across them is the transferable part: **every reading taken at
  a setting nobody questioned turned out to be the thing that mattered** —
  first `peirce()`'s auto-mesh, which holds `edge / c` constant and so
  samples the solver at one point by construction; then its substep count,
  which moves a measured bending length by 63 %.

  *Three consequences in the gate, each diagnosed rather than tuned away:*
  the check measured at a mesh that became too fine to converge once the
  cloth softened; the free-hang settle budget was tuned to the stiff cloth
  (threshold kept, time extended after measuring it settles at 8 s); and a
  **real stall-detection bug** in `cloth.js` where a permanently stuck seam
  reported "being sewn" (§6.14).

  *What it exposed and did not cause:* the garment path over-folds against
  the oracle, which is open above.

- **`tools/fabric.mjs --mesh-law`** — done 2026-10-17. Sweeps the cantilever
  across element sizes and reports measured-against-asked bending length, and
  the excess as rigidity. It is the instrument the repair needed and it
  answered its question in the negative: the dependence is a plateau with a
  steep fine-mesh transition, not a clean law. Recorded at
  [18-validation.md](18-validation.md) §6.12.

- **Three instruments gained what they needed to answer any of this** — done
  2026-10-17. `drapeTrace` (DC against time, which is how the static
  equilibrium was found), `--no-drag` / `--no-damping` (which exonerated
  damping), `--jitter` (which exonerated symmetry), and `hemDropCm` (which
  separates "too stiff to fold" from "not bending at all" — DC alone cannot,
  because when nothing drapes every DC is near 100). Recorded at
  [18-validation.md](18-validation.md) §6.12.

- **`drape (Cusick)` is in the `tests` menu** — done 2026-10-17, and the
  viewer and the headless tool verified to agree: both report DC 97.2, 0
  folds, not settled, for poplin at 1.2 cm. They share `app/js/cusick.js`,
  whose `setupCusick` / `measureCusick` split exists so the page cannot grow a
  second implementation of the scoring. The `measure it` button refuses to
  report while the cloth is moving, naming the speed.

- **The Cusick drape test exists** (Step 2, specified long before this
  session, never built) — done 2026-10-17. `app/js/cusick.js` +
  `tools/drape_coefficient.mjs`, standard 30 cm specimen on an 18 cm support,
  DC on the scale where 100 is card and 0 is no stiffness at all. First
  results say **every preset reads as card** — poplin 96.4 against a published
  class band of 40-65, linen 98.1 against 50-75, habotai 87.4 against 15-35 —
  which is §6.11's skirt finding on an independent scale with published
  numbers. Shipped with its own defect found and fixed: a fold counter that
  reported 30 folds on a 23-fold mesh, worst on exactly the specimens that did
  not drape. Recorded at [18-validation.md](18-validation.md) §6.12.

- **The menubar's test menu is called `tests`** — done 2026-10-17. It was
  `drop test`, which had stopped covering what belongs in it: the Cusick drape
  test and the Peirce cantilever are both tests and neither drops anything.
  Verified in the page; the bar reads `files · cloth · tests`.

- **Which component makes the presets look wrong: the data or the solver?** —
  answered 2026-10-17, the solver. The sweep across all seven presets against
  the oracle, the per-fold distribution behind the scalar, and the two
  instrument bugs that had to be fixed to get there (a comparison hard-coded
  to one fabric; a measurement whose output never reached the pipe because
  Node's stdout is asynchronous and the loop is synchronous) are recorded at
  [18-validation.md](18-validation.md) §6.11. The repair is queued above.
  **Nothing in `FABRICS` changed**, which was the point of asking first.

- **The two drop tests share one `drop test ▾` menu** — done 2026-10-17.
  They had a bar entry each, `drop: disc` and `drop: accordion`, which is a
  prefix doing a container's job; the bar is flat and eleven sections are
  still waiting to move onto it. `MenuBar.menu({ id, label })` plus
  `MenuBar.dialog({ ..., menu })` is the new affordance, and it holds **no
  state of its own** — the entries are the same `Dialog`s with the same ids
  and remembered positions, so both drop tests can still be open side by
  side, which is the whole point of the dialogs. It closes on the next click
  elsewhere, on Escape, and on a pick; the bar entry stays lit while any
  dialog under it is open; an already-open entry carries a dot, without which
  picking it closes the dialog and looks like the menu did nothing. One real
  bug came out of driving it rather than reading it: the capture-phase
  dismiss listener called `ev.target.closest(...)`, which is an `Element`
  method, and threw `TypeError` on a pointerdown that targeted the document
  itself. Popup placement is measured from `getBoundingClientRect()` because
  the bar scrolls sideways when narrow — verified `popLeft 253 = btnLeft
  253`, `popTop 35 = btnBottom 35`. Recorded at
  [17-interface.md](17-interface.md).

- **The menubar's leftmost cell names the open document** — done 2026-10-17.
  It held the constant `bodice`, hard-coded into `dockui.js`: an inert
  `<span>` with no handler, the third copy of that word on screen after the
  `<title>` and the HUD `<h1>`, and wrong whenever `params.garment` was
  `skirt`, `dress`, `torso` or `full`. It holds `loadedName` now, falling back
  to `(unsaved)`. `MenuBar.setBrand` is called from **one** place, the top of
  `updateHUD`: `loadedName` is assigned at eight scattered sites, and a call
  beside each is one more place for the ninth to forget, whereas everything
  that changes what is in hand already paints the HUD — so the bar and the
  HUD's `pattern` row cannot disagree. Driven through the real page rather
  than read off the source: `(unsaved)` → `skirt-4panel` (K) →
  `accordion-20x60` (A) → `bodice-8gore` (try-on). The first run of that
  measurement showed no change at all, because the evaluations read the label
  before the async draft had finished; pumping frames inside the eval is what
  made it say anything true. Two CSS findings came with it — `text-transform:
  uppercase` is right for a brand and wrong for a file name, and
  `text-overflow: ellipsis` has no effect on a flex container's anonymous
  item, so the first version clipped a long name mid-letter with no ellipsis
  (`scrollWidth 430 > clientWidth 253` after the fix). Recorded at
  [17-interface.md](17-interface.md).

- **Stop running two simulations of one fall; stream the side-car's frames** —
  done 2026-10-12, from the report that the garment "teleported back up" after
  X. The local solver was animating a fall whose contact lets the body
  through, while Blender draped the pre-fall pose and then overwrote it.
  Blender now flushes each solved frame as a JSON line, `GET /frames` reads
  them mid-solve, and the viewer plays those instead of simulating: one
  computation, by the solver that gets contact right. Frames verified arriving
  during the solve (first at 8.0 s, then every ~1.4 s). Collider cut from
  12,288 to 6,144 triangles on measurement — p95 difference 0.38 cm, inside
  the cloth's thickness, for a third off the wall time. Recorded at
  [18-validation.md](18-validation.md) §6.10.

- **Decide §8.1, §8.5, §8.6** — done 2026-10-12, all three. Shear defaults
  inert (mechanism kept, two values restore it); bending deficit accepted and
  named, with `--calibrated` for figures quoted against published ranges;
  measured strain limits adopted as a flat 6.1 % woven floor. **Gate 278 pass,
  0 fail — green for the first time**, with the dart closing at 0.185 cm as
  predicted and seam closure improving on three independent checks. One repair
  needed on the way: an assembly check hardcoded `maxStretchPct <= 4.0` where
  its own name said "past what it can take", now `grainOverLimit <= 1.05`
  against the fabric's own limit — the second absolute-threshold-for-relative-
  property defect of the session, now recorded as a rule in §9. Recorded at
  [18-validation.md](18-validation.md) §8.1, §8.5, §8.6 and §6.3.


- **Per-frame impact tracking, and the reported denim bounce** (the small half
  of Step 5) — done 2026-10-11. `_trackMotion()` reports `reboundCm`,
  `bounces`, `peakSpeedCmPerSec`. The bounce is real: denim rebounds 1.84 cm
  over 6 bounces, interfaced twill 2.45 cm over 8, silk habotai **zero**. It
  tracks flexural rigidity (7.8 / 1198 / 3188) and not damping — the two that
  bounce have the *higher* `damp` — so it is bending energy, not tensile
  elasticity. It is also partly numerical: 8× the substeps halves the rebound
  (1.84 → 0.92) without removing it. `impactSpeedCmPerSec` is marked
  untrustworthy in the code (131–200 cm/s for the same drop). The energy-drift
  half and the analytic cases are still open. Recorded at
  [18-validation.md](18-validation.md) Step 5.

- **Converge the bending solve, or make it converge cheaply** — done
  2026-10-11: the cost is measured and the answer is that it cannot be made
  cheap by tuning. Work per frame is `substeps × (stretch + bend sweeps)` and
  the defaults spend 160. Reaching 10 % accuracy needs 2560 — **16×** — at
  160 substeps. Substeps dominate sweeps at equal cost (160/8/8 at 2560 beats
  80/8/32 at 3200), correcting an earlier note here that said the reverse.
  Reallocating the existing 160 toward substeps gives 2.3× for free but not
  the 30× needed. So the remedy is a decision, now §8.6, and the long-term
  answer is an implicit solve rather than a constant. Recorded at
  [18-validation.md](18-validation.md) §6.8.


- **Fix the discrete bending model's normalisation against element size** —
  done 2026-10-11, and **there was nothing wrong with the normalisation.**
  Driven to 80 substeps and 32 sweeps the solver matches closed-form beam
  theory to 13 % and the asked bending length to 4 %, `BEND_SCALE = 30`
  unchanged — so `k = BEND_SCALE·D·|e|²/A_e` is right and the stencil's `len`
  and `area` are the right quantities. The deficit is **under-convergence**:
  `c_eff` goes 0.90 → 1.26 → 1.96 → 3.17 as substeps and sweeps rise, against
  an asked 3.3. The apparent mesh-dependence follows, since convergence
  quality falls as the element count rises. `cloth.js`'s own comment on
  `BEND_SCALE` had named the mechanism; what it could not know was that the
  instrument it was fitted against returned `edge/2`. Recorded at
  [18-validation.md](18-validation.md) §6.8; the remaining cost decision is
  item 1.


- **Settle whether the fine-mesh penetration floor is real or a statistic** —
  done 2026-10-11. `penetration()` now reports the distribution behind its
  maxima. The extent converges monotonically — 4.55 % → 1.16 % → 0.31 % of
  sampled points inside the body at edges 2.2 / 1.5 / 1.1, a 15× reduction —
  so contact is converging and the "floor" was not a defect. The depths do
  not converge, because at the fine end only ~34 points are inside at all and
  a p95 over those is its second-worst member. Rule: compare `insidePct`,
  never `deepestEdgeCm` or a percentile, across mesh sizes. Recorded at
  [18-validation.md](18-validation.md) §6.6.

- **Swap the accordion gate check from a stack-height ratio to
  `deepOverlaps`** — done 2026-10-11. The old control wanted contact-on to
  stack 5× taller than contact-off, which only worked while a crease had no
  radius; a real fillet gives the limp control loft of its own and the ratio
  fell to 2.5× *while the thickness model got better*. The check now asserts
  the proposition — pairs more than half a thickness through each other — and
  reads 5 against 35,206, a 7,000× discrimination. Threshold not loosened:
  20× margin with a floor of 20. **Gate 277 pass / 1 fail**, back to its
  pre-session count, the remaining failure being the dart's guessed strain
  limits (§8.5). Recorded at [18-validation.md](18-validation.md) §6.3.

- **A substep floor, or a warning, for the run that slid off the body** —
  done 2026-10-11. Swept a wool crepe disc: 2 substeps slides off entirely
  (97 cm, never settles), 4 is confidently wrong (names the shoulder instead
  of the neck, grain at 1.9× the tear limit, body 2.3 cm through the cloth),
  6 is the floor for a right answer and 10 for the strain limit to hold.
  `healthy()` catches none of it — it only looks for NaN. The obvious
  diagnostic failed: the strain limiter's residual is zero at every substep
  count, since it converges to its ceiling every time. The signal that works
  is `report().grainOverLimit`, the grain strain against the fabric's own
  `maxStrain`, which warns once above 1.2 — 1.88 at 4 substeps, 0.80 at 10,
  0.36 at 16. Recorded at [18-validation.md](18-validation.md) §6.7.

- **Make the cantilever an actual Peirce test: bisect the overhang** — done
  2026-10-11. `peirce()` solves for the free length by regula falsi on the tip
  angle and reports `c = L/2` with its convergence state. Width-independent
  (0.501 / 0.500 / 0.498 at widths 5 / 2 / 1.5), converges in 5 settles on
  denim with the bracket centred on `L = 2c`, and the specimen-length
  dependence that invalidated every earlier verdict is gone by construction.
  **Mesh-independence fails** — 1.74× over a 1.5× refinement — and that
  failure is now attributable to the solver, which is the handoff this item
  existed to produce. Two bugs of mine fixed inside it: the mesh sized from
  the trial length (self-referential runaway to a 0.45 cm specimen), and a
  silently exhausted settle budget. Recorded at
  [18-validation.md](18-validation.md) §6.9, §6.8 and Step 3.


- **Fix the cantilever readout so it stops quantising to `edge/2`** — done
  2026-10-11, and it uncovered two deeper faults. The interpolation works: the
  scan is monotone and repeat-free (0.412 … 9.607 against the old
  0.75 / 0.75 / 0.75 / 1.50 …). The tool now also reports `rowsToCrossing`,
  `rowPitchCm` and `resolved`, and refuses a stiffness verdict when the
  crossing falls inside fewer than two rows — the limp presets were all in
  that state at the default settings. But mesh-independence still fails and
  does not converge (0.403 / 0.470 / 0.588 / 0.442 at edges 1.0 / 0.6 / 0.4 /
  0.25), and the cause is §6.9: the test is not Peirce's, and its answer
  depends on the specimen length. Carried as item 1. Recorded at
  [18-validation.md](18-validation.md) Step 3, §6.8 and §6.9.


- **Find which pre-session `cloth.js` change regressed the dart seam
  closure** — done 2026-10-11. It was the replacement of cross-spring bending
  with dihedral hinges on Peirce bending lengths, and **it is not a defect**:
  linen's 2.3 cm is inside its published 2.0–2.6 range, and the dart gap
  tracks bending stiffness monotonically (0.252 cm at 2.3, 0.097 at 1.0,
  0.026 at 0.3 — the old model behaved like 0.3). What actually stops the
  seam is the cloth's **guessed** 3 % strain ceiling: `seamsAtTheLimit: 0`,
  `peakTensionGf: 28`, `maxStretchPct: 3`. Raising it to any measured value
  from `sim/cipc/fabrics.md` closes the dart (0.185 cm at 6.1 %, 0.030 at
  13.4 %). Same root cause as §6.6. Recorded at
  [18-validation.md](18-validation.md) §6.3; the fix is §8 decision 5.

- **Attribute the dart-closing gate failure against a pristine checkout** —
  done 2026-10-11. Clean worktree at `d9d6f01`: **268 pass, 0 fail**, dart
  check **0.029 cm**. Working tree: 0.252 cm. Therefore a regression from
  uncommitted work, not committed code. Recorded at
  [18-validation.md](18-validation.md) §6.3.
