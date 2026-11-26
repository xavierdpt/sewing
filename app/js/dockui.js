/**
 * The menubar and its floating dialogs.
 *
 * One lil-gui panel with twenty folders was a list, not a workspace: the
 * folder you wanted was always scrolled off, and two panels you wanted to
 * watch at once could not both be open. So the sections become dialogs --
 * one per menubar entry, each draggable, collapsible and closable, each
 * remembering where it was put.
 *
 * DOM only, no three.js: the dialog hands back a container element and the
 * caller fills it (with a lil-gui instance, or anything else).
 */

const PERSIST = 'sewing.dockui.v1';

function loadState() {
  try { return JSON.parse(localStorage.getItem(PERSIST)) || {}; } catch { return {}; }
}

export class MenuBar {
  /**
   * @param {object} [opts]
   * @param {HTMLElement} [opts.mount]  where the bar and dialogs are attached
   * @param {boolean} [opts.persist]    remember position and open state
   * @param {number} [opts.reserveRight]  px of the right edge a dialog should
   *   not be dropped on by default (the panel that has not moved here yet)
   * @param {string} [opts.brand]  the leftmost cell of the bar. It used to be
   *   the word "bodice", hard-coded here -- which made a generic UI module
   *   know what garment the app makes, and lied the moment you drafted a
   *   skirt. It is the open document's name now; see `setBrand`.
   */
  constructor({ mount = document.body, persist = true, reserveRight = 0, brand = '' } = {}) {
    this.mount = mount;
    this.persist = persist;
    this.reserveRight = reserveRight;
    this.state = persist ? loadState() : {};
    this.dialogs = new Map();
    this.menus = new Map();
    // above lil-gui's autoplaced panel, which sits at 1001
    this.topZ = 1100;

    // A menu closes on the next click anywhere else, and on Escape. Captured
    // on the document rather than on the popup, because the click that
    // dismisses a menu is by definition one the menu did not receive.
    addEventListener('pointerdown', (ev) => {
      // Not every pointerdown has an Element for a target -- the document
      // itself can be one -- and `closest` is an Element method, so the
      // unguarded version threw out of a capture-phase listener.
      const t = ev.target instanceof Element ? ev.target : null;
      if (!t || !t.closest('.menu-pop, .menubar-item.has-menu')) this.closeMenus();
    }, true);
    addEventListener('keydown', (ev) => { if (ev.key === 'Escape') this.closeMenus(); });

    this.el = document.createElement('div');
    this.el.className = 'menubar';
    this.el.innerHTML = '<span class="menubar-brand"></span>';
    this.brandEl = this.el.querySelector('.menubar-brand');
    this.setBrand(brand);
    mount.appendChild(this.el);
  }

  /**
   * Name the open document in the leftmost cell of the bar -- where every
   * editor puts it, and where this program had a constant instead.
   *
   * Empty text leaves the cell out of the layout entirely rather than
   * standing there as a blank gap the width of its padding.
   */
  setBrand(text) {
    const s = text == null ? '' : String(text);
    if (this.brandEl.textContent === s) return;      // called once per HUD paint
    this.brandEl.textContent = s;
    this.brandEl.style.display = s ? '' : 'none';
    this.brandEl.title = s;                          // in full, when it is elided
  }

  _save() {
    if (!this.persist) return;
    try { localStorage.setItem(PERSIST, JSON.stringify(this.state)); } catch { /* private mode */ }
  }

  /** Raise a dialog above the others, and keep that the stacking order. */
  raise(dlg) { dlg.el.style.zIndex = String(++this.topZ); }

  /**
   * Add a menubar entry with a dialog behind it. Clicking the entry opens the
   * dialog, or closes it if it is already open.
   *
   * @param {object} opts
   * @param {string} opts.id      stable key for the remembered position
   * @param {string} opts.label   the menubar entry
   * @param {string} [opts.title] the dialog's own title (defaults to the label)
   * @param {string} [opts.hint]  what the section is for: a tooltip on the
   *   title and on the entry, NOT more words in the title bar
   * @param {number} [opts.width] dialog width in px
   * @param {number} [opts.x]     default position, if nothing is remembered
   * @param {number} [opts.y]
   * @param {boolean} [opts.open] open on first run
   * @returns {Dialog}
   */
  dialog(opts) {
    const dlg = new Dialog(this, opts);
    this.dialogs.set(opts.id, dlg);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opts.label;
    btn.addEventListener('click', () => dlg.toggle());
    if (opts.menu) {
      // The entry lives in a menu rather than on the bar. The dialog itself
      // is unchanged -- same id, same remembered position, same toggle -- so
      // moving an entry under a menu does not move the window it opens.
      opts.menu._addItem(dlg, btn);
    } else {
      btn.className = 'menubar-item';
      this.el.appendChild(btn);
    }
    if (opts.hint) btn.title = opts.hint;
    dlg.button = btn;
    dlg._syncButton();

    return dlg;
  }

  /**
   * Add a menubar entry that opens a small menu of dialogs rather than one
   * dialog. `MenuBar.dialog({ ..., menu })` puts an entry inside it.
   *
   * The bar is flat, and the migration out of the single lil-gui panel has
   * eleven sections still to come: fifteen entries in one row is the panel's
   * own fault one level up -- the one you want scrolled off the edge. A menu
   * groups the ones that belong together (the two drop tests) without taking
   * away what the dialogs are for: each still opens, moves and closes on its
   * own, and two of them can be watched side by side.
   *
   * @param {object} opts
   * @param {string} opts.id     stable key (reserved; menus remember nothing yet)
   * @param {string} opts.label  the menubar entry
   * @returns {Menu}
   */
  menu(opts) {
    const m = new Menu(this, opts);
    this.menus.set(opts.id, m);
    return m;
  }

  /** Close every open menu. A menu is transient: it never survives a click. */
  closeMenus(except = null) {
    for (const m of this.menus.values()) if (m !== except) m.close();
  }

  /** Close every dialog -- the "give me the garment back" gesture. */
  closeAll() { this.closeMenus(); for (const d of this.dialogs.values()) d.close(); }
}

/**
 * A menubar entry that drops a short list of dialogs.
 *
 * It holds no state of its own: the entries are the same `Dialog`s, opened
 * and closed the same way. The menu is transient -- it closes on the next
 * click, on Escape, and on choosing something -- so it is never a place the
 * person has to tidy up afterwards.
 */
class Menu {
  constructor(bar, { id, label }) {
    this.bar = bar;
    this.id = id;
    this.items = [];
    this.isOpen = false;

    this.btn = document.createElement('button');
    this.btn.className = 'menubar-item has-menu';
    this.btn.type = 'button';
    this.btn.textContent = label;
    this.btn.addEventListener('click', () => this.toggle());
    bar.el.appendChild(this.btn);

    this.pop = document.createElement('div');
    this.pop.className = 'menu-pop';
    this.pop.style.display = 'none';
    bar.mount.appendChild(this.pop);
  }

  _addItem(dlg, btn) {
    btn.className = 'menu-item';
    // Choosing something closes the menu, whichever way the choice went:
    // a menu that stays open after a pick is a menu you then have to dismiss.
    btn.addEventListener('click', () => this.close());
    this.pop.appendChild(btn);
    this.items.push(dlg);
    dlg.menu = this;
  }

  _sync() {
    this.btn.classList.toggle('on', this.items.some((d) => d.isOpen));
  }

  open() {
    this.bar.closeMenus(this);
    this.isOpen = true;
    this.pop.style.display = 'block';
    // Measured from the button, not computed from an entry count: the bar
    // scrolls sideways when it is narrow, so the entry is not where its
    // index says it is.
    const r = this.btn.getBoundingClientRect();
    this.pop.style.top = `${Math.round(r.bottom)}px`;
    this.pop.style.left = `${Math.round(Math.min(r.left, innerWidth - this.pop.offsetWidth - 8))}px`;
    this.btn.classList.add('open');
  }

  close() {
    this.isOpen = false;
    this.pop.style.display = 'none';
    this.btn.classList.remove('open');
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }
}

class Dialog {
  constructor(bar, { id, label, title = label, hint = '', width = 430, x, y, open = false }) {
    this.bar = bar;
    this.id = id;
    const saved = bar.state[id] || {};

    this.el = document.createElement('section');
    this.el.className = 'dlg';
    this.el.style.width = `${width}px`;
    this.el.innerHTML = `
      <header class="dlg-bar">
        <button class="dlg-fold" type="button" title="collapse / expand">▾</button>
        <span class="dlg-title"></span>
        <button class="dlg-close" type="button" title="close">×</button>
      </header>
      <div class="dlg-body"></div>`;
    const titleEl = this.el.querySelector('.dlg-title');
    titleEl.textContent = title;
    // A title is a NAME. `.dlg-title` clips at the width of the dialog with an
    // ellipsis, so a title that explains itself loses the explanation first:
    // `the cloth itself -- shared by every test` measured 379 px into a 357 px
    // bar and read `...shared by every te`. What a section is for goes in the
    // hint, which is a tooltip on the title and on the entry that opens it.
    this.hint = hint;
    if (hint) titleEl.title = hint;
    this.body = this.el.querySelector('.dlg-body');
    this.foldBtn = this.el.querySelector('.dlg-fold');

    // Where it goes if nothing was ever dragged: stacked down the right side,
    // clear of the HUD on the left.
    // Nothing remembered yet: cascade, so a dialog opened second does not sit
    // exactly on top of the first and look like it never opened.
    const n = bar.dialogs.size;
    this.x = saved.x ?? x ?? Math.max(12, innerWidth - width - 24 - bar.reserveRight - n * 30);
    this.y = saved.y ?? y ?? 46 + n * 30;
    this.collapsed = saved.collapsed ?? false;
    this.isOpen = saved.open ?? open;

    this._place();
    this._applyFold();
    this.el.style.display = this.isOpen ? 'block' : 'none';
    bar.mount.appendChild(this.el);
    bar.raise(this);

    this.el.addEventListener('pointerdown', () => bar.raise(this));
    this.foldBtn.addEventListener('click', () => this.setCollapsed(!this.collapsed));
    this.el.querySelector('.dlg-close').addEventListener('click', () => this.close());
    this._dragFrom(this.el.querySelector('.dlg-bar'));
  }

  _place() {
    this.el.style.left = `${Math.round(this.x)}px`;
    this.el.style.top = `${Math.round(this.y)}px`;
    // A dialog dragged down the screen scrolls its contents rather than
    // running off the bottom edge, where the last controls are unreachable.
    const bar = this.el.querySelector('.dlg-bar').offsetHeight || 34;
    this.body.style.maxHeight = `${Math.max(120, innerHeight - this.y - bar - 12)}px`;
  }

  _applyFold() {
    this.body.style.display = this.collapsed ? 'none' : '';
    this.el.classList.toggle('collapsed', this.collapsed);
    this.foldBtn.textContent = this.collapsed ? '▸' : '▾';
  }

  _syncButton() {
    if (this.button) this.button.classList.toggle('on', this.isOpen);
    // The menu's own entry lights up while any dialog under it is open, so
    // the bar still says what is on screen without being opened first.
    if (this.menu) this.menu._sync();
  }

  _remember() {
    this.bar.state[this.id] = { x: this.x, y: this.y, collapsed: this.collapsed, open: this.isOpen };
    this.bar._save();
  }

  /** Drag by the title bar, clamped so the bar can always be grabbed again. */
  _dragFrom(handle) {
    handle.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button')) return;      // fold and close are not handles
      ev.preventDefault();
      handle.setPointerCapture(ev.pointerId);
      const dx = ev.clientX - this.x;
      const dy = ev.clientY - this.y;
      const move = (e) => {
        const w = this.el.offsetWidth;
        this.x = Math.min(Math.max(e.clientX - dx, 8 - w + 60), innerWidth - 60);
        this.y = Math.min(Math.max(e.clientY - dy, 0), innerHeight - 24);
        this._place();
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        this._remember();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  setCollapsed(v) { this.collapsed = !!v; this._applyFold(); this._remember(); }

  open() {
    this.isOpen = true;
    this.el.style.display = 'block';
    // A dialog dragged off-screen, or left behind by a window resize, comes
    // back where it can be reached.
    this.x = Math.min(this.x, innerWidth - 60);
    this.y = Math.min(this.y, innerHeight - 24);
    this._place();
    this.bar.raise(this);
    this._syncButton();
    this._remember();
  }

  close() {
    this.isOpen = false;
    this.el.style.display = 'none';
    this._syncButton();
    this._remember();
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }
}
