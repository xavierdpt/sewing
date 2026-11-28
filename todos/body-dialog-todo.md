# The body section becomes a menu of dialogs — TODO

The working queue for its spec,
[body-dialog-spec.md](body-dialog-spec.md). The two are a pair in `todos/`
(rule 11): the spec holds the requirements and the resolved questions, this
document holds the work they imply.

**How this document is maintained.** The cycle is: read the spec, pick the next
item from it, add it **on top** here with an identifier, do it, mark it done
here, and reference it from the spec. Then read the spec again. An identifier
is never reused or renumbered once given, because code comments and the spec
cite it (`todos/body-dialog-todo.md item 1`). Work that is not this spec's
gets its own new spec + todo pair, not an item here.

---

## Open

**Opened 2026-11-27**, from the user: move the `body` folder out of the single
lil-gui panel into its own menubar menu with a dialog per subsection. The
spec's §1 has the inventory of the folder and the evidence that nothing
outside `main.js` touches it; §2 has the five entries and why.

- [x] **1. `Dialog.setTitle` in `dockui.js`. DONE 2026-11-27.** Spec §2 question 4: the
      measurements dialog renames itself on a unit change, and a `Dialog`'s
      title is written once in the constructor. Four lines, beside
      `MenuBar.setBrand`, which is the same gesture one level up.
      *Acceptance:* no behaviour change on its own; exercised by item 2.
      **Done.** `Dialog` keeps `this.titleEl` and gains `setTitle(text)`,
      which no-ops on an unchanged string the way `setBrand` does, and sets
      the element's `title` attribute **only when there is no hint**, so a
      renaming dialog never loses the explanation a hint put there.

- [x] **2. Move the folder. DONE 2026-11-27.** `app/js/main.js` only. A `body ▾` menu where
      `gui.addFolder('body')` was, five `dialogGUI` calls under it per spec
      §2 question 2, and `rebuildMeasurementGUI` rebuilding the measurements
      dialog's own lil-gui root instead of a folder inside the panel.
      *Acceptance:* the spec's §3 criteria 1-5, driven through the page
      (rule 9), on the repository copy.
      **Done**, `app/js/main.js` and the one `dockui.js` method of item 1.
      `bodyMenu` where `gui.addFolder('body')` was, five `dialogGUI` calls
      under it, and a new `fillDialogGUI(dlg, width)` factored out of
      `dialogGUI` — a dialog's contents are a lil-gui **root**, not a folder,
      so `rebuildMeasurementGUI`'s `fMeas.destroy()` + `addFolder` becomes
      "replace the root and reassign `dlg.gui`", which is what `refreshGUI`
      iterates.
      *Measured on the repository copy, `tools/viewshot.py`, exit 0 so no
      page error:*
      - bar reads `body · files · cloth · tests`, `body` first (criterion 1,
        spec §2 question 6);
      - the panel carries **ten** sections and none is `body` — read off
        `.lil-gui.autoPlace > .children`, not `.lil-gui.root`, which also
        catches the folders *inside* the dialogs and counted eleven
        (criterion 1);
      - the `body ▾` popup lists **five** entries: `size and units`,
        `measurements`, `shape`, `asymmetry`, `arms, legs and poses`
        (criterion 2);
      - opening all five gives **4 / 21 / 4 / 4 / 14 = 47** controllers,
        which is what the folder held (criterion 3). The spec's §1 first said
        13 for the limbs and was corrected to 14 off this count;
      - the unit toggle retitles the dialog `measurements (cm)` →
        `measurements (in)` and the form rebuilds in place: bust `92` →
        `36.22`, 21 rows either way, and the menu entry still reads
        `measurements` (criterion 4);
      - `refreshGUI` reaches the dialogs: setting pose `Arms overhead` in
        one dialog moved `arm raise (abduction)` from `10` to `108` in the
        same one, which is the programmatic-`params` path that goes stale
        when `gui.controllersRecursive()` is used instead (criterion 5).

- [x] **3. Run the gate. DONE 2026-11-27.** `node test/run.mjs`, expecting **306 pass / 0
      fail**. Count with `grep -c '^  PASS'`, not `grep -c PASS` — the
      `ALL CHECKS PASSED` banner matches the bare pattern and reads 307
      (show-body-todo.md item 2). Rule 6: before committing, not after.
      *Acceptance:* the spec's §3 criterion 7.
      **Done: 306 PASS, 0 FAIL, exit 0**, `ALL CHECKS PASSED` — the count the
      show-body pair left, unmoved. Counted with `grep -c '^  PASS'`; the
      bare `grep -c PASS` reads 307 because the banner contains the word.

- [x] **4. Rebuild the container and drive the SERVED page. DONE 2026-11-27.** Rule 12:
      `appdocker.sh build && stop && start`, then `viewshot.py --url
      http://127.0.0.1:8777`. Not optional and not conditional — the run
      image bakes the page in, so `:8777` serves whatever was built, and this
      pair's §3 criterion 6 exists because the show-body pair's item 3 was
      opened by the user for exactly this.
      *Acceptance:* the spec's §3 criterion 6, with the served file's `diff`
      against `app/js/main.js` reported.
      **Done**, and done *before* reporting the work rather than after being
      asked. `appdocker.sh build` (exit 0, `sewing-app-run:latest`), `stop`,
      `start`. `curl`ed against the working tree: `js/main.js` **identical**,
      `js/dockui.js` **identical**. Driven with `viewshot.py --url
      http://127.0.0.1:8777 --clear-ui-state`, exit 0: bar `body · files ·
      cloth · tests`, ten sections in the panel, the same five entries, the
      same **4 / 21 / 4 / 4 / 14** controllers, and the retitle to
      `measurements (in)` at 21 rows. The served page and the repository copy
      agree on every figure above.

- [x] **5. Correct the documents and write the tree node. DONE 2026-11-27.** Rule 10 and rule
      0: [17-interface.md](../docs/17-interface.md)'s bar table, its
      eleven-section list and its "4 of the 15 have moved" count;
      `docs/04-software.md` §on controls; a note under
      [19-todo.md](19-todo.md)'s eleven-section item, which keeps its
      identity and loses one section. The tree has no interface node at all
      (spec §1), and node 5 names "the viewer and its interface" as a child
      it expects, so one node goes there.
      *Acceptance:* the spec's §3 criterion 8, and the node reported by path
      and id.
      **Done.** [17-interface.md](../docs/17-interface.md): the bar table now
      has four entries over ten dialogs with `body ▾` first, the migration
      section reads **ten** sections left and **5 of the 15** moved, and the
      menu section carries the user's reason for submenus. Its section count
      was also *corrected as it was measured*: the document's own recipe,
      `.lil-gui.root > .children > .lil-gui > .title`, now catches the
      folders inside the dialogs as well and returned eleven; the panel is
      `.lil-gui.autoPlace`, which returns ten.
      `docs/04-software.md` no longer says the panel exposes the body
      measurements and asymmetry fields.
      [19-todo.md](19-todo.md)'s eleven-section item keeps its identity and
      carries a note that it is ten.
      **Tree node:** *Triangulated Garment System > Software, instruments and
      validation > The menubar and its floating dialogs*, **id 14**, with a
      link out to *The garment viewer in docker* (id 9) for the container the
      dialogs were driven on. It was the tree's first node on the interface,
      which node 5 had been naming as a child it expected.

## Done

All five items, 2026-11-27, marked in place above. The `body` folder is a
`body ▾` menu over five dialogs on both the repository copy and the served
container, the gate is **306 pass / 0 fail**, and `dockui.js` gained one
method (`Dialog.setTitle`) that the next renaming section will want too.
The `measure the model` button that moved with the rest was removed hours
later by its own pair, [measure-button-spec.md](measure-button-spec.md).
