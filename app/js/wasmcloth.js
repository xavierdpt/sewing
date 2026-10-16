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
      thickness: 0.35, friction: 0.3, sampleEdges: true, ...fabric,
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
