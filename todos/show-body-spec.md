# The body is always shown — SPEC

Paired with [show-body-todo.md](show-body-todo.md), which is its queue
(rule 11). This document holds the requirement and the resolved questions; the
todo holds the work they imply.

## 0. The premise

**From the user, 2026-11-27:** *"We want to assume that showBody is always true
and remove the checkbox."*

`params.showBody` is a viewer-only display flag with a `body > showBody`
checkbox in the main lil-gui panel. It is to be removed, and the body mesh is
to be visible unconditionally.

## 1. What depends on it

Measured, not assumed — `grep -rn showBody` over the whole repository outside
`docs/knowledge.db`, 2026-11-27, returns **three sites, all in
`app/js/main.js`**:

| line | site | what it does |
|---|---|---|
| 148 | `showBody: true,` | the default in the `params` object |
| 379 | `bodyMesh.visible = params.showBody;` | applied once, in `buildBodyMesh()` |
| 2486 | `fBody.add(params, 'showBody').onChange(...)` | the checkbox and its handler |

Nothing else reads it:

- **No persistence.** `params` is never serialised wholesale — the only writes
  to it are `Object.assign(params, torso.band(...))` (1845, 2645, 3538), and
  the saved pattern record names its fields one by one. So removing the key
  changes no file format, unlike items 1 and 5 of the body-source pair.
- **No other visibility path.** `bodyMesh.visible` is assigned at exactly two
  places, 379 and the checkbox's handler. Nothing else hides the body.
- **No keyboard shortcut.** The flag is not on any key.
- **No documentation.** No `*.md` in the repository names `showBody`, and no
  document inventories the `body` folder's controls, so rule 10 has nothing to
  correct here.
- **No knowledge-tree node.** `kt_search_text` for `showBody` and for
  "toggle checkbox body visible" both return empty, so rule 0's step 1 was
  silent and there is no node to bring into line.

## 2. The resolved questions

1. **Keep `bodyMesh.visible = true` or drop the line?** *Dropped.*
   `THREE.Object3D.prototype.visible` is `true` on construction, so an explicit
   assignment to the value it already holds states nothing. This is the
   opposite call from the body-source pair's item 1, which *kept* two sites as
   the constant they now evaluate to — but those two were written into files
   whose format must not change. This one is read by nobody.
2. **Does the `body` folder survive?** *Yes.* `fBody` still holds the standard
   size dropdown, the measurement form, the breadth-and-depth pairs and the
   unit toggle. Only its first row goes.
3. **Do the sibling flags go with it?** *No.* `showTiles`, `showSeams`,
   `showShell`, `showArms`, `showArmscye`, `showLegs` are untouched; the user
   named `showBody`. Narrowing or widening the scope is not this spec's call.

## 3. Acceptance

1. `grep -rn showBody` over the repository is empty but for this pair.
2. The page loads with no error and the body is visible, measured by
   `python3 tools/viewshot.py` (rule 9) — the scene still holds its four
   position-carrying meshes and `bodyMesh.visible` is `true` with no control
   having been touched. **Amended 2026-11-27, after this criterion was met and
   the user still saw the checkbox:** "the page" means **both** artifacts and
   the report says which is which — the repository copy under the tool's own
   server, *and* the served page under `--url`, after whatever rebuild that
   takes. This is the amendment
   [served-page-spec.md](served-page-spec.md) §4 made to the body-source pair
   for the same reason; it was read this session and not applied.
3. No GUI control matches `/showBody/i`, and the `body` folder still carries
   its other controls.
4. `node test/run.mjs` is **306 pass / 0 fail**, the count the body-source pair
   left (rule 6, and before committing rather than after).

**All four met, 2026-11-27**, criterion 2 only after item 3. Criteria 1-3 by
[show-body-todo.md](show-body-todo.md) item 1 **on the repository copy** and by
item 3 **on the served page**, both with `tools/viewshot.py` at exit 0: the flag is absent from `params`, the four
position-carrying meshes are all visible with no control touched, and the
`body` folder has lost its first row and kept the rest. Criterion 4 by item 2:
**306 PASS / 0 FAIL**, exit 0. Item 2 also records the counting trap — the
suite's `ALL CHECKS PASSED` banner matches a bare `grep -c PASS`, which reads
307.
