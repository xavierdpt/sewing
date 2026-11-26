// The cutting table: a 2D pattern editor living inside the 3D scene.
//
// The pieces lie flat on a table beside the body, at true scale, on a
// centimetre grid. You edit them there -- take a dart out, let a godet in --
// and then lift them off the table onto the body to be sewn.
//
// One scene rather than two panes, which is not laziness: the pieces on the
// table are the same objects that get arranged on the body, so there is one
// renderer, one pick path and one set of coordinates. The thing a separate 2D
// pane would buy is precision, and that is available without it -- `topDown()`
// snaps the camera to an orthographic view straight down at the table, which
// IS a 2D view, with true distances and no foreshortening.
//
// The table is the only part of this project other than main.js that knows
// about three.js. Everything it does to a pattern goes through patternedit.js,
// which does not.

import * as THREE from 'three';
import {
  takeOutWedge, letInWedge, check, panelArea, isPlanned,
  movePiece, turnPiece, mirrorPiece, splitPiece, joinPieces,
  trueDarts, closedDartProfile, setAllowance, setGrain, editList, replayEdits,
} from './patternedit.js';

const GRID_CM = 10;

/** Pattern (x, y) -> world, on a table lying in the xz plane. */
const toWorld = (origin, off, x, y) => [origin[0] + off[0] + x, origin[1], origin[2] + off[1] - y];

export class PatternTable {
  /**
   * @param onEdit     called after any change, with (pattern, report)
   * @param onPlanned  called with a tool id when a tool that is not built is
   *   pressed. The table refuses the gesture itself rather than letting the
   *   caller remember to: an unknown tool used to fall through to the spread,
   *   because `apply` chose between two operations with a ternary, so picking
   *   anything new would have quietly let a wedge in.
   */
  constructor({ scene, camera, controls, dom, onEdit = null, onPlanned = null, onRefused = null }) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.dom = dom;
    this.onEdit = onEdit;
    this.onPlanned = onPlanned;
    this.onRefused = onRefused;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.pattern = null;
    this.offsets = [];              // per piece, its place on the table
    this.meshes = [];
    this.tool = 'select';
    this.intakeDeg = 15;
    this.spreadDeg = 20;
    this.mirrorMode = 'copy';          // copy | flip | fold
    this.joinToleranceCm = 0.5;
    this.history = [];
    this.origin = [0, 0, 0];
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.drag = null;
    this._bind();
  }

  // ------------------------------------------------------------- the table

  /**
   * Lay a pattern out on the table.
   *
   * The pieces are spaced by their own bounding boxes, in a row, which is what
   * a cutting table looks like before anything is pinned. Nothing here is the
   * nesting used for the printed pattern -- that packs for cloth economy, and
   * this packs for being able to see and reach each piece.
   */
  show(pattern, { origin = [60, 0, 0], gapCm = 6 } = {}) {
    this.pattern = pattern;
    this.origin = origin;
    this.gapCm = gapCm;
    this._relayout();
    this.group.visible = true;
    this._build();
    return this;
  }

  /** Space the pieces out again: one place on the table per piece. */
  _relayout() {
    const gapCm = this.gapCm === undefined ? 6 : this.gapCm;
    this.offsets = [];
    let x = 0;
    let maxH = 0;
    for (const p of this.pattern.panels) {
      const xs = p.pts.map((q) => q.x), ys = p.pts.map((q) => q.y);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      this.offsets.push([x - Math.min(...xs), -(Math.min(...ys) + h / 2)]);
      x += w + gapCm;
      maxH = Math.max(maxH, h);
    }
    this.spanCm = [x, maxH];
  }

  /**
   * Draw the pattern again after an edit.
   *
   * An edit that changes how MANY pieces there are -- mirroring one, cutting
   * one in two, joining two into one -- invalidates the places on the table,
   * which are one per piece. Redrawing without re-spacing them would read the
   * wrong offset for every piece after the one that changed, or none at all
   * for a piece that is new.
   */
  _rebuildFor(pattern) {
    this.pattern = pattern;
    if (this.offsets.length !== pattern.panels.length) this._relayout();
    this._build();
  }

  hide() { this.group.visible = false; return this; }

  get visible() { return this.group.visible; }

  _clear() {
    for (const m of this.group.children.slice()) {
      this.group.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    this.meshes = [];
  }

  _build() {
    this._clear();
    const o = this.origin;

    // the table itself, and a centimetre grid on it
    const grid = new THREE.GridHelper(Math.max(this.spanCm[0], 120) + 20,
      Math.round((Math.max(this.spanCm[0], 120) + 20) / GRID_CM), 0x3a3f49, 0x272b33);
    grid.position.set(o[0] + this.spanCm[0] / 2, o[1] - 0.05, o[2]);
    this.group.add(grid);

    this.pattern.panels.forEach((p, pi) => {
      const off = this.offsets[pi];
      const pos = [];
      for (const q of p.pts) pos.push(...toWorld(o, off, q.x, q.y));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(p.tris.flat());
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL((pi * 0.37) % 1, 0.3, 0.72),
        roughness: 0.9, side: THREE.DoubleSide, flatShading: false,
      }));
      mesh.userData.panel = pi;
      this.group.add(mesh);
      this.meshes.push(mesh);

      // the outline, lifted clear so it reads as a cutting line
      const loop = p.loop && p.loop.length ? p.loop : null;
      if (loop) {
        const lp = [];
        for (let k = 0; k < loop.length; k++) {
          const a = p.pts[loop[k]], b = p.pts[loop[(k + 1) % loop.length]];
          lp.push(...toWorld(o, off, a.x, a.y), ...toWorld(o, off, b.x, b.y));
        }
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
        const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x11131a }));
        lines.position.y += 0.08;
        this.group.add(lines);
      }

      // dart legs, drawn as the pair of lines a sewer would fold together
      for (const d of p.darts || []) {
        if (d.apex === undefined) continue;
        const A = p.pts[d.apex];
        if (!A) continue;
        const lp = [];
        for (const sgn of [-1, 1]) {
          const a = (d.bisectDeg + sgn * d.intakeDeg / 2) * Math.PI / 180;
          const r = d.legCm ? d.legCm[sgn < 0 ? 0 : 1] : 10;
          lp.push(...toWorld(o, off, A.x, A.y),
            ...toWorld(o, off, A.x + Math.cos(a) * r, A.y + Math.sin(a) * r));
        }
        const dg = new THREE.BufferGeometry();
        dg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
        const dl = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0xc0392b }));
        dl.position.y += 0.1;
        this.group.add(dl);
      }
    });

    // the wedge being dragged out, if any
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.preview = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ color: 0x2ecc71 }));
    this.preview.position.y += 0.12;
    this.preview.visible = false;
    this.group.add(this.preview);
  }

  /** Look straight down at the table: the 2D view, without a second pane. */
  topDown() {
    const o = this.origin;
    const cx = o[0] + this.spanCm[0] / 2;
    this.controls.target.set(cx, o[1], o[2]);
    this.camera.position.set(cx, o[1] + Math.max(this.spanCm[0], 80), o[2] + 0.01);
    this.controls.update();
    return this;
  }

  // ---------------------------------------------------------- interaction

  /** Where on the table, and on which piece, is the pointer? */
  _pick(ev) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    this.ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    if (!hit) return null;
    const pi = hit.object.userData.panel;
    const off = this.offsets[pi];
    return {
      panel: pi,
      // back out of the table's mapping into the piece's own coordinates
      x: hit.point.x - this.origin[0] - off[0],
      y: -(hit.point.z - this.origin[2] - off[1]),
      world: hit.point,
    };
  }

  /** The nearest pattern point, if it is close enough to mean it. */
  _snap(pi, x, y, withinCm = 2.5) {
    const p = this.pattern.panels[pi];
    let best = null, bd = withinCm * withinCm;
    p.pts.forEach((q, i) => {
      const d = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best === null ? null : { i: best, x: p.pts[best].x, y: p.pts[best].y };
  }

  _bind() {
    this.dom.addEventListener('pointerdown', (ev) => {
      if (!this.visible || this.tool === 'select') return;
      // A planned tool is said out loud on the press, not on the release: the
      // person gets the message before dragging across the piece, and nothing
      // starts that would have to be undone.
      if (isPlanned(this.tool)) {
        if (this.onPlanned) this.onPlanned(this.tool);
        return;
      }
      const at = this._pick(ev);
      if (!at) return;
      const snap = this._snap(at.panel, at.x, at.y);
      this.drag = {
        panel: at.panel,
        apex: snap ? [snap.x, snap.y] : [at.x, at.y],
        snapped: !!snap,
        angle: 0,
        angle0: null,
        cur: snap ? [snap.x, snap.y] : [at.x, at.y],
        over: at.panel,
      };
      this.controls.enabled = false;
      // A capture that fails must not take the gesture down with it. Headless
      // Chrome, which is how this editor is tested (tools/viewshot.py), sends
      // pointer events that were never "active", and setPointerCapture throws
      // on those -- so the drag died on the press and nothing could be driven.
      try { this.dom.setPointerCapture(ev.pointerId); } catch { /* not a real pointer */ }
      this._preview();
    });

    this.dom.addEventListener('pointermove', (ev) => {
      if (!this.drag) return;
      const at = this._pick(ev);
      if (!at) return;
      // Which piece the pointer is over NOW is the second half of a join, so
      // it is tracked even when it is not the piece the drag started on --
      // which this used to return early on, making a join ungestureable.
      this.drag.over = at.panel;
      if (at.panel !== this.drag.panel && this.tool !== 'join') return;
      if (at.panel !== this.drag.panel) { this._preview(); return; }
      this.drag.cur = [at.x, at.y];
      this.drag.angle = Math.atan2(at.y - this.drag.apex[1], at.x - this.drag.apex[0]);
      if (this.drag.angle0 === null) this.drag.angle0 = this.drag.angle;
      this.drag.reach = Math.hypot(at.y - this.drag.apex[1], at.x - this.drag.apex[0]);
      this._preview();
    });

    const finish = (ev) => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      this.controls.enabled = true;
      if (this.preview) this.preview.visible = false;
      try {
        if (ev && ev.pointerId !== undefined && this.dom.hasPointerCapture(ev.pointerId)) {
          this.dom.releasePointerCapture(ev.pointerId);
        }
      } catch { /* never captured */ }
      // A join is a press on one piece and a release on another, so it is the
      // only tool for which going nowhere on the first piece is the gesture.
      const joining = this.tool === 'join' && d.over !== undefined && d.over !== d.panel;
      if (!joining && (!d.reach || d.reach < 1)) return;   // a click, not a drag
      this.apply(d);
    };
    this.dom.addEventListener('pointerup', finish);
    this.dom.addEventListener('pointercancel', finish);
  }

  _preview() {
    if (!this.preview || !this.drag) return;
    const d = this.drag;
    const off = this.offsets[d.panel];
    const half = (this.tool === 'dart' ? this.intakeDeg : this.spreadDeg) * Math.PI / 180 / 2;
    const r = Math.max(4, d.reach || 10);
    const a = this.preview.geometry.attributes.position.array;
    const seg = (from, to, k) => {
      const p0 = toWorld(this.origin, off, from[0], from[1]);
      const p1 = toWorld(this.origin, off, to[0], to[1]);
      a[k] = p0[0]; a[k + 1] = p0[1]; a[k + 2] = p0[2];
      a[k + 3] = p1[0]; a[k + 4] = p1[1]; a[k + 5] = p1[2];
    };
    const leg = (ang, k) => seg(d.apex,
      [d.apex[0] + Math.cos(ang) * r, d.apex[1] + Math.sin(ang) * r], k);

    // Every tool draws the thing it is about to do: a dart its two legs, a
    // spread the cut and where it opens to, a mirror or a cut the line
    // itself, a move or a turn the drag.
    if (this.tool === 'dart') { leg(d.angle - half, 0); leg(d.angle + half, 6); }
    else if (this.tool === 'spread') { leg(d.angle, 0); leg(d.angle + 2 * half, 6); }
    else if (this.tool === 'mirror' || this.tool === 'split') {
      // the line, drawn well past both ends so it reads as a line and not as
      // the segment the pointer happened to cover
      const dx = d.cur[0] - d.apex[0], dy = d.cur[1] - d.apex[1];
      const L = Math.hypot(dx, dy) || 1;
      const ext = 60 / L;
      seg([d.apex[0] - dx * ext, d.apex[1] - dy * ext],
        [d.apex[0] + dx * ext, d.apex[1] + dy * ext], 0);
      seg(d.apex, d.cur, 6);
    } else { seg(d.apex, d.cur, 0); seg(d.apex, d.cur, 6); }
    this.preview.geometry.attributes.position.needsUpdate = true;
    this.preview.visible = true;
  }

  /** Apply the active tool, with the pattern snapshotted first so it can be undone. */
  apply(d) {
    if (isPlanned(this.tool)) {
      if (this.onPlanned) this.onPlanned(this.tool);
      return null;
    }
    const deg = (x) => x * 180 / Math.PI;
    const ops = {
      dart: () => takeOutWedge(this.pattern, d.panel, {
        apex: d.apex, bisectDeg: deg(d.angle), intakeDeg: this.intakeDeg,
      }),
      spread: () => letInWedge(this.pattern, d.panel, {
        apex: d.apex, towardsDeg: deg(d.angle), spreadDeg: this.spreadDeg,
      }),
      move: () => movePiece(this.pattern, d.panel, {
        dx: +(d.cur[0] - d.apex[0]).toFixed(3), dy: +(d.cur[1] - d.apex[1]).toFixed(3),
      }),
      // the drag sweeps the angle: where it started against where it ended,
      // about the point it was pressed on
      turn: () => turnPiece(this.pattern, d.panel, {
        degrees: +deg(d.angle - (d.angle0 === null ? d.angle : d.angle0)).toFixed(2),
        about: d.apex,
      }),
      mirror: () => mirrorPiece(this.pattern, d.panel, {
        line: [d.apex, d.cur], mode: this.mirrorMode,
      }),
      split: () => splitPiece(this.pattern, d.panel, { from: d.apex, to: d.cur }),
      join: () => joinPieces(this.pattern, d.panel, d.over, { toleranceCm: this.joinToleranceCm }),
    };
    if (!ops[this.tool]) return null;
    const snapshot = JSON.stringify(this.pattern);
    let report;
    try {
      report = ops[this.tool]();
    } catch (err) {
      // the operation was not possible where it was asked for -- say so and
      // leave the pattern alone rather than half-editing it
      console.warn(`${this.tool}: ${err.message}`);
      this._rebuildFor(JSON.parse(snapshot));
      if (this.onRefused) this.onRefused(this.tool, err);
      return null;
    }
    this.history.push(snapshot);
    if (this.history.length > 50) this.history.shift();
    if (report && report.pattern) this.pattern = report.pattern;
    this._rebuildFor(this.pattern);
    const c = check(this.pattern);
    if (!c.ok) console.warn('the pattern no longer checks out:', c.problems.join('; '));
    if (this.onEdit) this.onEdit(this.pattern, { ...report, check: c });
    return report;
  }

  undo() {
    if (!this.history.length) return false;
    this._rebuildFor(JSON.parse(this.history.pop()));
    if (this.onEdit) this.onEdit(this.pattern, { undone: true, check: check(this.pattern) });
    return true;
  }

  /**
   * The edits that are not a gesture.
   *
   * A dart is dragged; truing every dart is not a thing you point at. These
   * are the same operations as the gestures -- same functions, same recording,
   * same `check()` afterwards -- reached from a button instead of a drag.
   */
  command(name, opts = {}) {
    const snapshot = JSON.stringify(this.pattern);
    let report = null;
    try {
      if (name === 'true-darts') report = trueDarts(this.pattern);
      else if (name === 'dart-profile') return closedDartProfile(this.pattern);
      else if (name === 'edits') return editList(this.pattern);
      else if (name === 'allowance') report = setAllowance(this.pattern, opts);
      else if (name === 'grain') {
        report = setGrain(this.pattern, opts.panelIndex === undefined ? 0 : opts.panelIndex, opts.degrees);
      } else if (name === 'replay') {
        // onto a pattern someone else drafted -- another body, usually
        if (!opts.onto) throw new Error('replay needs a pattern to replay onto');
        report = replayEdits(opts.onto, this.pattern.edits || []);
      } else throw new Error(`no such command ${name}`);
    } catch (err) {
      console.warn(`${name}: ${err.message}`);
      this._rebuildFor(JSON.parse(snapshot));
      if (this.onRefused) this.onRefused(name, err);
      return null;
    }
    this.history.push(snapshot);
    if (this.history.length > 50) this.history.shift();
    if (report && report.pattern) this._rebuildFor(report.pattern);
    const c = check(this.pattern);
    if (!c.ok) console.warn('the pattern no longer checks out:', c.problems.join('; '));
    if (this.onEdit) this.onEdit(this.pattern, { ...report, command: name, check: c });
    return report;
  }

  /** What the pattern measures and whether it will still sew. */
  report() {
    const c = check(this.pattern);
    return {
      pieces: this.pattern.panels.length,
      seams: (this.pattern.seams || []).length,
      darts: this.pattern.panels.reduce((n, p) => n + (p.darts || []).length, 0),
      clothCm2: +this.pattern.panels.reduce((a, p) => a + panelArea(p), 0).toFixed(0),
      ...c,
    };
  }
}
