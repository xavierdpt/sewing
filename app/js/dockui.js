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
   */
  constructor({ mount = document.body, persist = true, reserveRight = 0 } = {}) {
    this.mount = mount;
    this.persist = persist;
    this.reserveRight = reserveRight;
    this.state = persist ? loadState() : {};
    this.dialogs = new Map();
    // above lil-gui's autoplaced panel, which sits at 1001
    this.topZ = 1100;

    this.el = document.createElement('div');
    this.el.className = 'menubar';
    this.el.innerHTML = '<span class="menubar-brand">bodice</span>';
    mount.appendChild(this.el);
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
    btn.className = 'menubar-item';
    btn.type = 'button';
    btn.textContent = opts.label;
    btn.addEventListener('click', () => dlg.toggle());
    this.el.appendChild(btn);
    dlg.button = btn;
    dlg._syncButton();

    return dlg;
  }

  /** Close every dialog -- the "give me the garment back" gesture. */
  closeAll() { for (const d of this.dialogs.values()) d.close(); }
}

class Dialog {
  constructor(bar, { id, label, title = label, width = 430, x, y, open = false }) {
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
    this.el.querySelector('.dlg-title').textContent = title;
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
