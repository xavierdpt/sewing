# 17 — The Menubar and Its Dialogs

`app/js/dockui.js`, the `.menubar` / `.dlg` rules in `app/index.html`.

The viewer grew as one lil-gui panel with twenty folders, and that shape has
two faults that do not go away with more care:

* the folder you want is always scrolled off the bottom;
* two sections you want to watch at once — the drop-test parameters while the
  cloth is falling, say — cannot both be open beside the garment.

So a section becomes a **dialog**: a floating window opened from a menubar
entry, draggable by its title bar, collapsible to that bar alone, closable,
and remembering where it was put.

## What a dialog is

`MenuBar.dialog({ id, label, title, width })` adds the menubar entry and
returns a `Dialog`. The dialog is DOM only — no three.js, no lil-gui — and
hands back `.body`, an empty element the caller fills. `main.js` fills it with
a lil-gui root (`dialogGUI`), so a section's code reads exactly as it did when
it was a folder:

```js
const dropDialog = dialogGUI({ id: 'droptest', label: 'drop test',
                               title: 'drop test -- real cloth physics' });
const fDrop = dropDialog.gui;
fDrop.add(params, 'holeR', 3, 24, 0.5).name('hole radius cm');
```

Position, collapsed and open state are kept in `localStorage` under
`sewing.dockui.v1`, per `id`. That is what makes the placement worth doing:
the arrangement you settle on is still there tomorrow. Clearing it is one
line in the console, or `--clear-ui-state` in the screenshot tool below.

## Two things that were measured, not assumed

**Stacking.** lil-gui's autoplaced panel sits at `z-index: 1001`. The first
version of the dialog used `z-index: 20` and opened *exactly underneath* the
main panel — the click did everything right and nothing appeared. Dialogs
start at 1100 and are raised on `pointerdown`; the menubar is at 5000.

**Label width.** `collide edge midpoints (body pokes through without it)`
pushed its own checkbox off the right edge of the dialog: the control was
there and could not be clicked. The reason now lives in the element's
`title`, and in `docs/11-cloth.md` where it belongs.

Both were found by looking at a screenshot of the real page, not by reasoning
about the CSS — which is what `tools/viewshot.py` is for:

```bash
python3 tools/viewshot.py shot.png --clear-ui-state \
  --eval 'document.querySelector(".menubar-item").click()'
```

It drives the actual viewer in headless Chrome over CDP, runs the JS you give
it, pumps frames (`__pump`, because requestAnimationFrame does not fire
headless) and exits non-zero if the page logged an error.

## What is on the bar so far

| entry | what it holds |
|---|---|
| **files** | save and load the dress form and the pattern, print the SVG, export the OBJ (docs/14-editing.md §5) |
| **drop test** | the cloth parameters and the drop, pause, step, report controls |

## Migrating the rest

Sections move out of the single panel one at a time; what is still in `gui`
has not been moved yet. The one thing to remember when moving one: a
programmatic change to `params` must refresh *every* lil-gui root, so call
`refreshGUI()` in `main.js` rather than `gui.controllersRecursive()`, which
would silently leave the dialogs showing stale numbers.
