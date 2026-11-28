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

## The leftmost cell names the open document

The bar begins with `.menubar-brand`. Until 2026-10-17 that was the literal
word `bodice`, hard-coded in `dockui.js` — an inert `<span>`, no handler, no
`cursor: pointer`, the third copy of the same word on screen after the `<title>`
and the HUD's `<h1>`. It was also wrong whenever it mattered: `params.garment`
offers `skirt`, `dress`, `torso` and `full`, and draft any of them and the bar
still said BODICE. A generic UI module should not know what garment the app
makes.

It holds `loadedName` now — `bodice-8gore`, `skirt-4panel`, or the stem of an
imported file — falling back to `(unsaved)`, which is what the leftmost cell of
a menubar is for everywhere else.

`MenuBar.setBrand(text)` sets it, and `main.js` calls it from **exactly one
place: the top of `updateHUD`.** That is the point of the design, not an
accident of where it was convenient. `loadedName` is assigned at eight
scattered sites (the skirt, the accordion, the drafted bodice, two import
paths, `putOnTable`, …); a `setBrand` beside each is one more place for the
ninth to forget, which is precisely how a label goes stale. Everything that
changes what is in hand already calls `updateHUD`, so the bar and the HUD's
own `pattern` row are read from the same variable in the same paint and
cannot disagree.

Two things the CSS has to do, both measured rather than assumed:

* **No `text-transform: uppercase`.** Fine for a brand, wrong for data: an
  imported `my-dress.json` is not `MY-DRESS`.
* **`display: block`, not `flex`.** `text-overflow: ellipsis` has no effect on
  a flex container's anonymous item, so the flex version clipped a long name
  mid-letter with no ellipsis at all. Capped at `28ch`; measured at
  `scrollWidth 430 > clientWidth 253` on a 43-character name, so the menu
  entries cannot be pushed off the right edge.

Verified by driving the real page, since the wiring is the whole feature and
reading the code only shows the capability (rule 9):

```
boot:               (unsaved)
after K (skirt):    skirt-4panel
after A (accordion): accordion-20x60
after try-on:       bodice-8gore
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

It also **answers dialogs**, since 2026-10-17. With the Page domain enabled
and nobody handling them, an `alert()` blocks the page until someone does, so
an `--eval` that opened one hung the evaluate it came from and the run timed
out saying nothing about why. They are now dismissed as they open, printed in
the log as `[dialog]`, and kept in `cdp.dialogs` — which turns what the page
*said* into something a check can assert on, instead of something only a
person at the screen can see.

## What is on the bar so far

Four entries over ten dialogs, read off the running page rather than off
the source — `(unsaved) · body ▾ · files · cloth · tests ▾`:

| entry | dialog title | what it holds |
|---|---|---|
| **body ▾** | *a menu* | → **size and units** (the size chart, the unit, `reframe the view`), **measurements** (titled `measurements (cm)`, 17 sliders + the nested breadth-and-depth 4), **shape**, **asymmetry**, **arms, legs and poses** |
| **files** | save and load | the dress form and the pattern, the SVG, the OBJ (docs/14-editing.md §5) |
| **cloth** | cloth | the fabric parameters every test draws on |
| **tests ▾** | *a menu* | → **disc** (the disc with a hole), **accordion** (the pleated strip), **drape (Cusick)** (the drape coefficient), **cantilever (Peirce)** (bending length) |

`body` sits first because the body is step one, and because the code that
builds it is where the folder was. It is the first section of the eleven to
move, 2026-11-27, and the first whose *subfolders* became the entries —
[body-dialog-spec.md](../todos/body-dialog-spec.md), which also records the
one thing a dialog could not do until then: **rename itself.** The
measurement form is destroyed and rebuilt on every unit change, and carries
the unit in its name, so `Dialog.setTitle` exists now beside
`MenuBar.setBrand`, and `measurements (cm)` → `measurements (in)` was driven
in the page (bust `92` → `36.22`, 21 rows either way). The entry's own label
stays `measurements`: the label names the section, the title reports its
state.

`size and units` holds three rows, not the four it moved with: the `measure
the model` button was removed the same day
([measure-button-spec.md](../todos/measure-button-spec.md)), because it
answered into `console.table` — a control whose effect is invisible to the
person pressing it, which is the fault this document keeps finding one layer
at a time.

`tests`, not `drop test`: the menu was named after the only two experiments it
had, and the Cusick drape test drops nothing. A container named after its
first occupants stops being a container.

```bash
python3 tools/viewshot.py bar.png --clear-ui-state \
  --eval '[...document.querySelectorAll(".menubar-item")].map(x => x.textContent)'
```

## Migrating the rest

**Ten sections are still in the single panel** — the shape this document
opens by calling the problem. Measured the same way, reading
`.lil-gui.autoPlace > .children > .lil-gui > .title` (the `.root` selector
also catches the folders *inside* the dialogs, which is how the first reading
of this counted one too many):

> shell (step two) · fit (static, no physics) · explicit joining ·
> pattern · try a pattern on · flare and gathers · sewing by hand ·
> the drape -- in this page, in wasm · the cutting table · view

So **5 of the 15 original sections have moved** — the two drop tests, the
cloth they share, save/load, which is the testing corner, and `body`, the
first of the garment-making ones, 2026-11-27 — and one dialog
was born on the bar rather than migrated to it: `drape (Cusick)`, added
2026-10-17 with the instrument behind it. Ten dialogs, ten sections still
in the panel.

Everything a person uses to *make a garment* is still in the panel. The queue
for the rest is in [19-todo.md](../todos/19-todo.md), which also records the thing to
avoid repeating: `drape (Cusick)` was wired up, measured correctly, and
dropped its specimen **off the edge of the screen**, because `frameScene(true)`
frames the body and a test piece placed with `besideTheBody` is not the body.
It was found by looking at a screenshot, not by reading the code — the test
ran perfectly and was invisible. `frameOn(centre, radius)` is the fix, and
anything else placed beside the body needs it.

The one thing to remember when moving one: a programmatic change to `params`
must refresh *every* lil-gui root, so call `refreshGUI()` in `main.js` rather
than `gui.controllersRecursive()`, which would silently leave the dialogs
showing stale numbers.

## A menu, when entries belong together

`MenuBar.menu({ id, label })` makes a bar entry that drops a short list
instead of opening one dialog; `MenuBar.dialog({ ..., menu })` puts an entry
inside it. The two drop tests were the first case, 2026-10-17 — they had one
bar entry each, reading `drop: disc` and `drop: accordion`, which is a prefix
doing a container's job.

The reason is not tidiness. The bar is flat and **ten sections are still
waiting to move onto it**: fifteen entries in one scrolling row is this
document's opening complaint one level up — the one you want is off the edge.
A menu groups without taking anything away, because **the menu holds no state
of its own**. That is also the reason the user gave for `body ▾`, asked
whether it wanted one dialog or five: *"do submenus, that's more
extendible"* — and it is why a section with subfolders becomes a menu of
dialogs rather than one dialog with its subfolders intact, which would be
this document's opening complaint one level down. Its entries are the same `Dialog`s, with the same ids, the same
remembered positions and the same toggle, so moving an entry under a menu
does not move the window it opens; and both can still be open side by side,
which is what the dialogs exist for.

Three rules it follows, each because the alternative is a menu you have to
tidy up after:

* it closes on the next click anywhere else, on `Escape`, and on choosing
  something;
* the bar entry stays lit while **any** dialog under it is open, so the bar
  still says what is on screen without being opened first;
* an entry whose dialog is already open carries a dot. Without it, picking an
  open entry closes the dialog and looks like the menu did nothing.

Two things measured rather than assumed:

* **The popup is positioned from `getBoundingClientRect()`, not from an entry
  count.** The bar scrolls sideways when the window is narrow, so an entry is
  not where its index says it is. Verified aligned: `popLeft 253 = btnLeft
  253`, `popTop 35 = btnBottom 35`.
* **The dismiss handler has to survive a non-Element target.** The
  capture-phase `pointerdown` listener called `ev.target.closest(...)`, and
  `closest` is an `Element` method — a pointerdown targeting the document
  itself threw `TypeError: ev.target.closest is not a function` out of the
  listener. Found by driving it, not by reading it.

Driven through the page, the whole interaction:

```
boot                        bar [files, cloth, drop test]   0 dialogs open
menu down                   drop test <down>                0 dialogs open
picked disc                 drop test lit, disc dotted      1 dialog open
clicked on the garment      menu closed, disc still open    1 dialog open
picked disc again           drop test unlit, no dot         0 dialogs open
```

## A title is a name; what a section is *for* goes in the hint

Three of the four titles were sentences. They were clipped, and the clipped
part was the half worth reading — `.dlg-title` is `overflow: hidden;
text-overflow: ellipsis` at the dialog's own width, measured at **357 px**:

| title | measured | shown |
|---|---|---|
| `the cloth itself -- shared by every test` | 379 px | `…shared by every te` |
| `drop test -- the pleated strip, for thickness` | 427 px | `…the pleated strip, for th` |

So a title that explains itself loses its explanation first. The fix is not a
wider dialog; it is that these were two different things wearing one slot:

* **`title`** is a name. `cloth`, `the disc with a hole`, `the pleated strip`.
  All four now fit at 357/357.
* **`hint`** is what the section is for, as a tooltip on the title bar *and*
  on the entry that opens it — readable in full, and readable before the
  dialog is opened, which the title never was.

Two of the qualifiers turned out to be scaffolding the bar had already
replaced. `drop test -- ` prefixed both drop titles; they sit under a
`drop test ▾` menu now, so the title was repeating its own container. And
`the cloth **itself**` was distinguishing the fabric from the tests that use
it — which is what a separate `cloth` entry says structurally. The one piece
of real information in that title, *that every test shares these numbers and
changing one changes all of them*, was the part being cut off; it is the hint
now, where it can be read.

## Two labels that are still wrong

Neither is in `dockui.js`, and both are the same fault the brand cell had —
a constant where a reading of the program's own state belongs. They are
written down here rather than fixed in passing, because each is a change to
`main.js` and wants the gate:

* **`app/index.html:109` advertises `T try on`.** `main.js:3345` binds `t` to
  `openTable()`; try-on is reachable only from the panel's *try a pattern on*
  folder. The help strip is wrong about a key someone presses — rule 9's
  failure in its purest form, on the one line of the page whose whole job is
  to say what the keys do. Check the rest of that strip against the handler at
  `main.js:3323` while fixing it, not just this entry.
* **`main.js:2331` titles the lil-gui panel `'bodice'`.** The same word the
  menubar stopped claiming, one panel over, and wrong for the same reason:
  `params.garment` also offers `skirt`, `dress`, `torso` and `full`.
