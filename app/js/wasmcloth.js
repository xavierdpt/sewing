// The cloth solver, in WebAssembly, driven from the viewer.
//
// This is the layer that lets the browser simulate without the side-car: no
// Blender process, no HTTP round trip, no waiting for a 30-second bake to
// come back. What it gives up is stated in src/sewcloth/README.md and is not
// small -- Blender tests triangle against triangle, this tests points -- so
// the two are different tools rather than one replacing the other.
//
// THE SDF NEEDS NO CONVERSION. app/js/sdf.js stores its field as a
// Float32Array indexed (k * ny + j) * nx + i, which is x-fastest, and that is
// exactly the layout sewcloth expects. The body's field is handed over as it
// stands: no resampling, no copy on this side, no chance of the two
// disagreeing about what is inside.

/** Load the module. In a browser; node tests inject their own. */
export async function loadSewcloth(url = '../wasm/sewcloth.mjs') {
  const { default: factory } = await import(url);
  return factory();
}

export class WasmCloth {
  /**
   * @param mod   an instantiated emscripten module
   * @param opts.verts  [[x,y,z], ...] in centimetres
   * @param opts.edges  iterable of {a, b} -- an Assembly's edges Map values
   * @param opts.sdf    an SDF from sdf.js, or null for no body
   * @param opts.fabric {mass, tension, damping, thickness, friction}
   */
  constructor(mod, { verts, edges, sdf = null, fabric = {} }) {
    this.mod = mod;
    this.n = verts.length;

    const f = {
      mass: 0.5, tension: 20000, damping: 0.995,
      thickness: 0.35, friction: 0.3, sampleEdges: true,
      // Off unless asked for, and `selfDistance` defaults to nothing: a
      // sensible default here would be a guess about the caller's mesh. It
      // wants to be roughly 0.6 of the edge length -- larger and neighbours
      // fight, smaller and two layers slide through each other between
      // samples.
      selfCollision: false, selfDistance: 0, ...fabric,
    };

    // positions in, once
    const flat = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      flat[i * 3] = verts[i][0];
      flat[i * 3 + 1] = verts[i][1];
      flat[i * 3 + 2] = verts[i][2];
    }
    const pIn = mod._malloc(flat.byteLength);
    mod.HEAPF32.set(flat, pIn >> 2);
    this.ptr = mod.ccall('sc_create', 'number', ['number', 'number'], [this.n, pIn]);
    mod._free(pIn);
    if (!this.ptr) throw new Error('sewcloth: could not create the cloth');

    // springs from the assembly's edges, which already carry the topology
    const pairs = [];
    for (const e of edges) pairs.push(e.a, e.b);
    if (pairs.length) {
      const arr = new Int32Array(pairs);
      const sp = mod._malloc(arr.byteLength);
      mod.HEAP32.set(arr, sp >> 2);
      mod.ccall('sc_set_springs', 'number', ['number', 'number', 'number'],
                [this.ptr, pairs.length / 2, sp]);
      mod._free(sp);
    }
    this.nsprings = pairs.length / 2;

    mod.ccall('sc_set_fabric', null, ['number', 'number', 'number', 'number'],
              [this.ptr, f.mass, f.tension, f.damping]);
    mod.ccall('sc_set_thickness', null, ['number', 'number'], [this.ptr, f.thickness]);
    mod.ccall('sc_set_friction', null, ['number', 'number'], [this.ptr, f.friction]);
    mod.ccall('sc_set_implicit', null, ['number', 'number'], [this.ptr, 1]);
    mod.ccall('sc_set_sample_edges', null, ['number', 'number'],
              [this.ptr, f.sampleEdges ? 1 : 0]);
    if (f.selfCollision && f.selfDistance > 0) {
      mod.ccall('sc_set_self_collision', null, ['number', 'number', 'number'],
                [this.ptr, 1, f.selfDistance]);
    }

    if (sdf) this.setBody(sdf);
  }

  /** Hand over the body's field. Copied into the module, so the SDF on this
   *  side may be rebuilt or discarded afterwards. */
  setBody(sdf) {
    const { mod } = this;
    const [nx, ny, nz] = sdf.n;
    const bytes = sdf.phi.length * 4;
    const p = mod._malloc(bytes);
    mod.HEAPF32.set(sdf.phi, p >> 2);
    const ok = mod.ccall('sc_set_sdf', 'number',
                         ['number', 'number', 'number', 'number', 'number',
                          'number', 'number', 'number', 'number'],
                         [this.ptr, p, nx, ny, nz,
                          sdf.lo[0], sdf.lo[1], sdf.lo[2], sdf.cell]);
    mod._free(p);
    if (!ok) throw new Error('sewcloth: the field was refused');
    this.gridMB = bytes / (1024 * 1024);
    return this;
  }

  /** A half-space the cloth stays above: dot(n, x) >= d. A floor, a table,
   *  a wall. Cheaper than putting them in the field, and exact. */
  addPlane(nx, ny, nz, d) {
    this.mod.ccall('sc_add_plane', 'number',
                   ['number', 'number', 'number', 'number', 'number'],
                   [this.ptr, nx, ny, nz, d]);
    return this;
  }

  /** A sphere the cloth stays outside of. */
  addSphere(cx, cy, cz, radius) {
    this.mod.ccall('sc_add_sphere', 'number',
                   ['number', 'number', 'number', 'number', 'number'],
                   [this.ptr, cx, cy, cz, radius]);
    return this;
  }

  clearColliders() {
    this.mod.ccall('sc_clear_colliders', null, ['number'], [this.ptr]);
    return this;
  }

  /**
   * The hinges: one quadruple (apex A, apex B, edge, edge) and one compliance
   * each, in exactly the order `cloth.js` keeps them, so the two solvers bend
   * the same mesh the same way.
   *
   * `app/js/bending.js` produces both from the assembly, which is the only
   * place either is decided.
   */
  setHinges(stencils, rigidity, bendScale) {
    const { mod } = this;
    const n = stencils.length;
    if (!n) return this;
    const quads = new Int32Array(n * 4);
    const alphas = new Float32Array(n);
    stencils.forEach((g, k) => {
      quads[k * 4] = g.v[0]; quads[k * 4 + 1] = g.v[1];
      quads[k * 4 + 2] = g.v[2]; quads[k * 4 + 3] = g.v[3];
      // The same compliance formula cloth.js uses, and for the same reason:
      // A / (B |e|^2) makes the stiffness resolution-independent.
      alphas[k] = g.alpha ?? (g.area / (bendScale * rigidity * g.len * g.len));
    });
    const pq = mod._malloc(quads.byteLength);
    const pa = mod._malloc(alphas.byteLength);
    mod.HEAP32.set(quads, pq >> 2);
    mod.HEAPF32.set(alphas, pa >> 2);
    const got = mod.ccall('sc_set_hinges', 'number',
                          ['number', 'number', 'number', 'number'],
                          [this.ptr, n, pq, pa]);
    mod._free(pq); mod._free(pa);
    if (got !== n) throw new Error(`sewcloth: ${got} of ${n} hinges accepted`);
    this.nhinges = got;
    return this;
  }

  setBendSweeps(sweeps) {
    this.mod.ccall('sc_set_bend_sweeps', null, ['number', 'number'],
                   [this.ptr, sweeps]);
    return this;
  }

  /**
   * The stitches: pairs of vertices that are the same point of the garment,
   * cut on different pieces. `rest` defaults to the gap each one has, which is
   * the garment as arranged.
   */
  setStitches(stitches, rest = null) {
    const { mod } = this;
    const n = stitches.length;
    if (!n) return this;
    const pairs = new Int32Array(n * 2);
    stitches.forEach((st, k) => { pairs[k * 2] = st.a; pairs[k * 2 + 1] = st.b; });
    const pp = mod._malloc(pairs.byteLength);
    mod.HEAP32.set(pairs, pp >> 2);
    let pr = 0;
    if (rest) {
      const r = new Float32Array(rest);
      pr = mod._malloc(r.byteLength);
      mod.HEAPF32.set(r, pr >> 2);
    }
    const got = mod.ccall('sc_set_stitches', 'number',
                          ['number', 'number', 'number', 'number'],
                          [this.ptr, n, pp, pr]);
    mod._free(pp);
    if (pr) mod._free(pr);
    if (got !== n) throw new Error(`sewcloth: ${got} of ${n} stitches accepted`);
    this.nstitches = got;
    return this;
  }

  /** Compliance, the force limit in gram-force, and a 0..1 scale on it. */
  setStitchParams(alpha, maxGf, strength = 1) {
    this.mod.ccall('sc_set_stitch_params', null,
                   ['number', 'number', 'number', 'number'],
                   [this.ptr, alpha, maxGf, strength]);
    return this;
  }

  /** The fabric's measured ceiling on stretch, swept until nothing is over
   *  it. `sc_strain_residual` says what, if anything, it could not pull back. */
  setStrainLimit(maxStrain, passes = 200, tol = 1e-4) {
    this.mod.ccall('sc_set_strain_limit', null,
                   ['number', 'number', 'number', 'number'],
                   [this.ptr, maxStrain, passes, tol]);
    return this;
  }

  strainResidual() {
    return this.mod.ccall('sc_strain_residual', 'number', ['number'], [this.ptr]);
  }

  /** Feed rate in cm/s and the lag the feed will wait for. 0 stops it. */
  setSewSpeed(cmPerSec, slackCm = 0.5) {
    this.mod.ccall('sc_set_sew_speed', null, ['number', 'number', 'number'],
                   [this.ptr, cmPerSec, slackCm]);
    return this;
  }

  /** Put the thread in, or take it out. */
  armStitches(on = true) {
    this.mod.ccall('sc_arm_stitches', null, ['number', 'number'],
                   [this.ptr, on ? 1 : 0]);
    return this;
  }

  /** Per stitch, as a plain array: the gap, the last substep's tension, or the
   *  hardest it ever pulled. The seam report is built from the PEAKS -- the
   *  instantaneous tension is near zero whenever the cloth has caught up with
   *  the feed, which reads as a seam under no strain at all. */
  _perStitch(fn) {
    const { mod } = this;
    const n = this.nstitches || 0;
    if (!n) return [];
    const p = mod._malloc(n * 4);
    mod.ccall(fn, 'number', ['number', 'number'], [this.ptr, p]);
    const out = Array.from(new Float32Array(mod.HEAPF32.buffer, p, n));
    mod._free(p);
    return out;
  }

  stitchGaps() { return this._perStitch('sc_stitch_gaps'); }

  stitchTensions() { return this._perStitch('sc_stitch_tensions'); }

  stitchPeaks() { return this._perStitch('sc_stitch_peaks'); }

  /** What the feed has taken up: the rest length per stitch, cm. */
  stitchRests() { return this._perStitch('sc_stitch_rests'); }

  /** The widest rest length still to take up, cm. */
  feedLeftCm() {
    return this.mod.ccall('sc_feed_left', 'number', ['number'], [this.ptr]);
  }

  /** Is thread still being fed? False once the feed is spent OR stopped. */
  isSewing() {
    return !!this.mod.ccall('sc_is_sewing', 'number', ['number'], [this.ptr]);
  }

  pin(index, on = true) {
    this.mod.ccall('sc_set_pinned', null, ['number', 'number', 'number'],
                   [this.ptr, index, on ? 1 : 0]);
  }

  setGravity(x, y, z) {
    this.mod.ccall('sc_set_gravity', null,
                   ['number', 'number', 'number', 'number'], [this.ptr, x, y, z]);
  }

  step(dt = 1 / 60, substeps = 2) {
    this.mod.ccall('sc_step', null, ['number', 'number', 'number'],
                   [this.ptr, dt, substeps]);
  }

  /**
   * Live positions as xyzxyz, for a BufferGeometry attribute.
   *
   * The view is rebuilt when the module's heap has been REPLACED, which
   * happens whenever wasm memory grows -- the old Float32Array then points
   * into a detached buffer and reads as zeros. Caching the view without
   * this check works perfectly until the first allocation that grows the
   * heap, which is the worst kind of bug to ship.
   */
  positions() {
    const { mod } = this;
    const ptr = mod.ccall('sc_positions', 'number', ['number'], [this.ptr]);
    if (!this._view || this._viewBuffer !== mod.HEAPF32.buffer || this._viewPtr !== ptr) {
      this._view = new Float32Array(mod.HEAPF32.buffer, ptr, this.n * 3);
      this._viewBuffer = mod.HEAPF32.buffer;
      this._viewPtr = ptr;
    }
    return this._view;
  }

  /** What the last step had to do: contacts corrected, and how deep the
   *  worst one was. A drape with a growing `deepest` is one the thickness is
   *  no longer absorbing. */
  report() {
    const { mod, ptr } = this;
    return {
      contacts: mod.ccall('sc_contacts', 'number', ['number'], [ptr]),
      selfContacts: mod.ccall('sc_self_contacts', 'number', ['number'], [ptr]),
      deepestCm: mod.ccall('sc_deepest', 'number', ['number'], [ptr]),
      cgIterations: mod.ccall('sc_cg_iterations', 'number', ['number'], [ptr]),
      vertices: this.n,
      springs: this.nsprings,
    };
  }

  dispose() {
    if (this.ptr) {
      this.mod.ccall('sc_destroy', null, ['number'], [this.ptr]);
      this.ptr = 0;
      this._view = null;
    }
  }
}
