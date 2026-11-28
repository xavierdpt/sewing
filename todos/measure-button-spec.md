# The `measure the model` button is removed — SPEC

Paired with [measure-button-todo.md](measure-button-todo.md), which is its
queue (rule 11). A separate pair from
[body-dialog-spec.md](body-dialog-spec.md), which only *moved* the control:
this one takes a control away, which is a different decision with a different
acceptance.

## 0. The premise

**From the user, 2026-11-27**, shown what the button does: *"I don't think
that has any added value to the user"*, and then *"Remove that button."*

It was raised under rule 10 — code identified as no longer fitting, with its
files and entry points, and proposed rather than deleted. The user decided.

**Extended the same day**, when the two readouts of the same shape were
reported as identified-not-changed: *"Then remove those two other
console-only readouts."* So this pair covers **three** controls, all in the
body's dialogs and all answering into `console.table`. The title keeps the
first one's name, because the identifiers in it are cited elsewhere and a
pair is not renamed once it is referenced (rule 11).

## 1. What it is, and what it uniquely did

| what | where |
|---|---|
| the control | `app/js/main.js:2691`, `fBody.add({ m: ... }, 'm').name('measure the model')`, in the `size and units` dialog since the body moved |
| its only caller | `measureTable()`, `app/js/main.js:1766-1789` |
| what it reads | `torso.measure()`, `app/js/body.js:754` — **stays**, it has six other callers |

`measureTable` builds 16 rows of `measurement · asked · model · error`,
converted to the form's unit, and the button prints them with
`console.table`. Driven on the served page, 2026-11-27, at the EU 38 default:
every girth, `backLength`, `apexToApex` and `apex to waist (front)` read
`error 0`, plus four derived rows with no asked value (`bust projection
5.38`, `across the knees 23.92`, the hip and waist breadth/depth pairs).

**The one thing it did that nothing else in the page does** is the `error`
column. The HUD prints `torso.M` (`main.js:2330-2341`) — the measurements
that were *asked for*. Nothing else in the viewer measures the generated
surface and subtracts.

**Why that is not enough to keep it**, measured rather than argued:

1. `console.table` reaches a browser console. A person at the viewer with a
   tape measure never opens one, so the control appears to do nothing — rule
   9's shape, a capability with no path a person presses.
2. The question it asks is already asked by the gate, headlessly and on every
   run: `test/run.mjs` calls `Body.measure()` at lines **80, 121, 130, 160,
   170 and 223**, including the unit round-trip and the belly and shape
   variants.

## 2. The resolved questions

1. **Does `Body.measure()` go?** *No.* Six gate call sites depend on it, and
   it is the method `docs/10-body.md` §2 calls the only honest test of a body
   generator. Only the viewer's button and `measureTable` go.
2. **Is the live body's error left unchecked?** *Yes, knowingly.* The gate
   measures constructed bodies, not the one typed into the form just now
   (custom measurements, asymmetry, a pose). The answer to that, if it is
   ever wanted, is the `error` column **in the HUD**, where it would be read
   — not a button whose output lands where nobody is looking. Proposed here,
   not built: nothing asked for it.
3. **Do the two other console-only readouts go with it?** *First no, then
   yes.* `hem clearance in this pose` and `measure the armscye`
   (`main.js:2637` and `2649` after the move, in the `arms, legs and poses`
   dialog) are the same shape; the user first said *"that button"*,
   singular, and then, shown the two under rule 10, *"remove those two other
   console-only readouts"*. Both go, as **item 5**. `torso.legSpanAt` and
   `torso.armscye` stay — they have five other callers between them
   (`main.js:419` builds the armscye lines, `tools/poses.mjs:46`, and
   `test/run.mjs:245, 270, 299`), so only the two GUI rows and their inline
   bodies go.

   **What is lost, stated plainly:** the hem readout was the only thing that
   printed what a hem must clear at knee, mid-thigh, crotch and low hip *in
   the current pose*, and the armscye readout the only one that printed each
   armhole's circumference. Neither is computed anywhere else in the page.
   The gate checks `legSpanAt` seated and at the crotch, and `armscye` for
   both sides, so the methods stay honest; what goes is the invisible way of
   asking them.
4. **Does `reframe the view` go?** *No.* Its effect is in the viewport, not
   in the console. It was never part of the complaint.

## 3. Acceptance

1. `grep -rn "measure the model\|measureTable" app/ tools/ test/` is empty,
   and so is `grep -rn "hem clearance\|measure the armscye" app/`.
2. The `size and units` dialog has **3** controls where it had 4, the `arms,
   legs and poses` dialog **12** where it had 14, and the other three body
   dialogs are unchanged at 21 / 4 / 4 — driven in the page, not read
   (rule 9).
3. The page loads with no error, on **both** artifacts and the report says
   which is which: the repository copy, and the served container after a
   rebuild and restart (rule 12).
4. `node test/run.mjs` is **306 pass / 0 fail**. The suite does not import
   `main.js` — its 24 imports are at `test/run.mjs:3-26` — so this change
   cannot move the count in either direction, which is a prediction the run
   either confirms or refutes.
5. `docs/10-body.md` §2 no longer tells the reader the viewer has that
   button (rule 10), and [17-interface.md](../docs/17-interface.md)'s bar
   table and the knowledge-tree node on the menubar agree with the page.

**All five met, 2026-11-27**, by [measure-button-todo.md](measure-button-todo.md)
items 1-5: criteria 1-2 by items 1 and 5 (`size and units` **3**, `arms, legs
and poses` **12**, the rest **21 / 4 / 4**, and no GUI row matching any of the
three names), criterion 3 by items 2 and 5 on the repository copy and on the
rebuilt container with the served file diffing identical, criterion 4 by item
3 at **306 pass / 0 fail**, criterion 5 by item 4 — `docs/10-body.md` §2 and
`docs/17-interface.md`, with the tree checked and found not to name any of
them.
