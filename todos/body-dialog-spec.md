# The body section becomes a menu of dialogs — SPEC

Paired with [body-dialog-todo.md](body-dialog-todo.md), which is its queue
(rule 11). This document holds the requirement and the resolved questions; the
todo holds the work they imply.

## 0. The premise

**From the user, 2026-11-27:** *"We want to move the body folder into its
own menu + floating dialog"*, and, when asked whether that was one dialog or
one per subsection: *"do submenus, that's more extendible"*.

So the `body` folder leaves the single lil-gui panel and becomes a **`body ▾`
menubar menu** whose entries are **one dialog per subsection** — the shape
[17-interface.md](../docs/17-interface.md) calls a menu, and the reason given
for it is extensibility, not tidiness.

This is the first of the eleven sections named in
[19-todo.md](19-todo.md)'s open item *"Eleven of the fifteen sections are
still in the single panel"*. That item is not renumbered or closed by this
pair; it keeps its identity and loses one section (rule 11).

## 1. What is in the folder, and what touches it

Measured, not assumed — `grep -n` over `app/js/main.js` and over every other
`app/js/*.js`, `tools/*` and `test/*`, 2026-11-27. The folder is
`main.js:2483-2629`, eight rows, five of them subfolders:

| row | kind | line |
|---|---|---|
| `standard size` | dropdown over `SIZE_CHART`, calls `applyStandardSize` + `rebuildMeasurementGUI` | 2487 |
| `units` | `cm`/`in`, converts `LENGTH_KEYS` then rebuilds the form | 2547 |
| `measurements (<units>)` | subfolder: 17 sliders from `MEASUREMENTS`, plus a nested `breadth and depth` of 4 from `SHAPE_PAIRS` | 2531 |
| `shape` | subfolder: belly, buttocks, posture, shoulder slope | 2558 |
| `asymmetry -- what no size chart offers` | subfolder, closed: 4 sliders | 2567 |
| `arms, legs and poses` | subfolder: 14 rows — pose, six joint angles, five `show*`/`*Collide` flags, two `console.table` readouts | 2573 |
| `measure the model` | button, `console.table(measureTable())` | 2628 |
| `reframe the view` | button, `frameScene(true)` | 2629 |

**Nothing outside `main.js` names any of these containers.** `fBody`, `fMeas`,
`fShape`, `fa`, `fArms` and `fPairs` appear in no other file. The only
cross-file surface is `rebuildMeasurementGUI`, called from three places, all
in `main.js`: the size dropdown (2490), the unit toggle (2555), `loadForm`
(2020) and boot (3538) — four call sites, three of them re-entrant.

**The one real constraint** is that `rebuildMeasurementGUI` **destroys and
re-creates** its container on every unit change, size preset and form load,
and names it with the current unit. A `Dialog`'s title is set once in its
constructor and `dockui.js` has no way to change it, so a dialog whose title
carries the unit needs one.

**No persistence and no file format is touched.** The dialogs' remembered
position lives in `localStorage` under `sewing.dockui.v1` per `id` (new keys,
nothing migrated); `params` and the dress-form JSON are untouched.

**Rule 0, step 1:** `kt_search_text` for `menubar`, `dialog` and `dockui`
returns empty — the tree has no node on the interface at all, though node 5
*"Software, instruments and validation"* names "the viewer and its interface"
as one of the children it expects. That node is written as part of this work
(todo item 4), from `docs/17-interface.md` and `app/js/dockui.js`.

## 2. The resolved questions

1. **One dialog or one per subsection?** *One per subsection, under a menu.*
   The user's reason is extensibility; the repo's is that a single `body`
   dialog is the panel's own complaint one level down — a scrolled-off list
   inside a window — and that two sections you want at once (the
   measurements while watching a pose) could not both be open.
2. **How many entries, and what are they?** *Five.* Four are the existing
   subfolders; the fifth, `size and units`, holds what was loose in the
   folder — the size dropdown, the unit toggle and the two readout buttons.
   A loose row cannot live on a menu, which lists dialogs, so it needs a
   dialog of its own rather than being dropped or scattered.
3. **Where does `reframe the view` go?** *With `size and units`.* It is a view
   action and arguably belongs in the panel's `view` folder, but moving it
   there is a second decision the user did not ask for; it keeps the company
   it had (rule 3's shape: proposed, not performed).
4. **Does the unit stay in the measurements title?** *Yes*, and `dockui.js`
   gains `Dialog.setTitle(text)` for it. The alternative — keeping a lil-gui
   folder named `measurements (cm)` inside a dialog titled `measurements` —
   is the same word twice, and the unit is data, which 17-interface.md's
   "a title is a name" section puts in the title only when it *is* the name.
   `setTitle` is four lines, generic, and the next section to move that
   renames itself wants it too.
5. **Do the four `show*` flags move with `arms, legs and poses`?** *Yes*, as
   they are — `showArms`, `showArmscye`, `showLegs`, `armsCollide`,
   `legsCollide` are rows of that subfolder and this is a move, not a
   redesign. (`showBody` was removed by the
   [show-body pair](show-body-spec.md) and is not among them.)
6. **Where on the bar?** *First*, before `files · cloth · tests`, because the
   code that builds it stays where the folder was and the body is step one.
   The testing corner keeps its order.
7. **Does the panel survive?** *Yes.* Ten sections remain in it and
   `reserveRight: 450` still holds the right edge clear for it.

## 3. Acceptance

1. `gui.addFolder('body')` is gone; no `.lil-gui.root > .children > .lil-gui
   > .title` in the panel reads `body`, and the panel still carries its other
   **ten** sections.
2. The bar carries a `body ▾` menu whose popup lists **five** entries, each
   opening a dialog that is draggable, collapsible, closable and remembered.
3. Every control that was in the folder is in exactly one dialog, counted
   off the page: **4 + 21 + 4 + 4 + 14 = 47 rows** (the `size and units` 4
   became **3** later the same day, when the user had the `measure the model`
   button removed — [measure-button-spec.md](measure-button-spec.md); that is
   a separate decision and does not change what this move had to preserve), which is what the folder
   held (2 loose + 2 buttons, 17 measurements + 4 breadth-and-depth, 4 shape,
   4 asymmetry, 14 arms-and-legs). None lost and none duplicated.
4. The unit toggle and the size dropdown still rebuild the measurement form,
   and the dialog's title follows the unit — driven in the page, not read.
5. `refreshGUI()` reaches the new dialogs, so a programmatic `params` change
   (a pose, a loaded form) does not leave them stale.
6. Measured on **both** artifacts and the report says which is which: the
   repository copy under `tools/viewshot.py`'s own server, **and** the served
   page under `--url http://127.0.0.1:8777` after a rebuild and restart
   (rule 12, and [served-page-spec.md](served-page-spec.md) §4).
7. `node test/run.mjs` is **306 pass / 0 fail**, the count the
   [show-body pair](show-body-spec.md) left. Before committing (rule 6).
8. [17-interface.md](../docs/17-interface.md) and `docs/04-software.md` are
   corrected in the same turn (rule 10): the bar table, the eleven-section
   list, and the count of what has moved.

**All eight met, 2026-11-27**, by [body-dialog-todo.md](body-dialog-todo.md)
items 1-5: criteria 1-5 by item 2 on the repository copy, criterion 6 by item
4 on the served container (`diff` identical, same figures), criterion 7 by
item 3 at **306 pass / 0 fail**, criterion 8 by item 5, which also added the
tree's first interface node (id 14) and corrected the section count the
document's own measuring recipe had got wrong.
