// Viewer + controls. This is the only file that knows about three.js; all the
// geometry lives in the plain-JS modules so it can be tested under node
// (see test/run.mjs).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';

import { Body, SIZE_CHART, BELLY, BUTTOCKS, POSTURE, POSES, SHOULDER_SLOPE, INCH,
  LENGTH_KEYS } from './body.js';
import { MeshSurface } from './meshsurface.js';
import { Assembly } from './assembly.js';
import { buildGridShell, quantize, growOntoSurface } from './lattice.js';
import { relax, settle, worstEdges, faceClearanceReport } from './relax.js';
import { makePattern } from './panels.js';
import { patternSVG } from './patternsvg.js';
import { exportPatternJSON, importPatternJSON, sew, drape, fitField, fitReport,
  sewFlat } from './patternio.js';
import { Cloth, BodyCollider, FABRICS } from './cloth.js';
import { annulusPattern } from './testpieces.js';
import { neckFrame, floorOf } from './droptest.js';
import { flaredSkirtPattern, placeSkirt, hemProfile, assemblyReport,
  waistRing } from './skirt.js';
import { layOut, weldStitched } from './assemble.js';
import * as arrange from './arrange.js';
import { drapeRemote, health as sidecarHealth, DEFAULT_URL } from './remote.js';
import { startTelemetry, tlog, flushTelemetry } from './telemetry.js';
import { clearance } from './clearance.js';
import { PatternTable } from './table.js';
import { LIBRARY, byId } from './tiles.js';
import { sub, add, mul, cross, norm, dist, DEG } from './geom.js';

// ----------------------------------------------------------------- scene

const container = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
scene.fog = new THREE.Fog(0x14161a, 160, 420);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 2000);
camera.position.set(72, 18, 108);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight(0x9fb4d0, 0x2a241c, 0.65));
const key = new THREE.DirectionalLight(0xfff3e0, 1.9);
key.position.set(60, 90, 70);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0015;
key.shadow.normalBias = 0.5;
Object.assign(key.shadow.camera, { left: -70, right: 70, top: 90, bottom: -50, near: 10, far: 300 });
scene.add(key);
const rim = new THREE.DirectionalLight(0x6f8fc0, 0.7);
rim.position.set(-70, 30, -60);
scene.add(rim);
// A low front fill, so the undersides of the bust and the seat are not read as
// holes. With only a high key light a convex bulge looks concave.
const fill = new THREE.DirectionalLight(0xffe8d0, 0.55);
fill.position.set(10, -30, 90);
scene.add(fill);
// The arms sit at the far left and right, so their visible faces point along
// -x and +x and catch neither the key nor the front fill -- which made them
// read as flat blue slabs rather than limbs.
for (const x of [-90, 90]) {
  const side = new THREE.DirectionalLight(0xdfe6ef, 0.35);
  side.position.set(x, 25, 20);
  scene.add(side);
}

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(150, 64).rotateX(-Math.PI / 2),
  new THREE.ShadowMaterial({ opacity: 0.35 }),
);
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(260, 52, 0x2a2e36, 0x22252c);
scene.add(grid);

/** Stand the body on the floor and frame it, whatever its height. */
function frameScene(reset = false) {
  // the body's own yMin is the crotch now; the legs hang below it
  const legFloor = (surface.heights && surface.heights.knee !== undefined)
    ? surface.heights.knee : Infinity;
  const base = Math.min(surface.yMin !== undefined ? surface.yMin : -24, legFloor);
  const floor = base - 2;
  ground.position.y = floor;
  grid.position.y = floor + 0.1;
  Object.assign(key.shadow.camera, {
    left: -80, right: 80, top: 110, bottom: floor - 10, near: 10, far: 340,
  });
  key.shadow.camera.updateProjectionMatrix();
  if (reset) {
    const top = surface.yMax !== undefined ? surface.yMax : 40;
    const mid = (floor + top) / 2;
    const span = Math.max(40, top - floor);
    controls.target.set(0, mid, 0);
    camera.position.set(span * 0.62, mid + span * 0.26, span * 1.45);
    controls.update();
  }
}

// ------------------------------------------------------------ app state

const params = {
  source: 'parametric',       // 'parametric' | 'makehuman'
  module: 2.0,                // u, cm
  // Ease must clear the chord sag of a flat tile over a curved region --
  // h^2/(8R), so ~1.25 cm for an 8 cm tile over a 10 cm radius bust. Less than
  // that and the body pokes through the facets, which is correct behaviour but
  // looks like a rendering bug.
  ease: 2.2,                  // cm
  vLo: 0.31, vHi: 0.99,          // replaced at startup by torso.band('bodice')
  wrap: true,
  front: false,               // build only the front half
  colour: 'defect',           // 'defect' | 'strain' | 'tile' | 'gore' | 'fit' | 'plain'
  showBody: true,
  showTiles: true,
  showSeams: true,
  showShell: false,            // step one is the body on its own
  showArms: true, showArmscye: true, armsCollide: true,
  showLegs: true, legsCollide: true,
  garment: 'bodice',
  pose: 'Rest (standing)',
  sizePreset: 'EU 38',
  // relaxation
  iters: 20, attract: 0.40, push: 1.0, gravity: 0.0, tangentDrift: 1,
  edgeStiffness: 1.0, edgePasses: 4, faceClearance: 0.5,
  // growth
  growMax: 220,
  // pattern
  gores: 8, patternRows: 36, seamAllowanceCm: 1.0, fabricWidthCm: 140,
  gravity: 0.005, drapeIters: 140,
  // the drop test
  holeR: 7.5, discR: 28, discEdge: 2.2, dropCm: 4,
  fabric: 'cotton poplin', friction: 0.4, substeps: 10,
  // 0 means "use the fabric's own value"
  internalDamping: 0, terminalCmPerSec: 150,
  // the flared / gathered skirt
  skirtPanels: 4, skirtHemCm: 160, skirtLengthCm: 55, skirtGather: 1.0,
  skirtEaseCm: 1.0, skirtEdge: 3.0,
  // assembling from separate pieces
  standoffCm: 6, stitchSeconds: 2.5, pinWaist: true,
  // Sewing by hand (docs/15-manual-sewing.md). `stepCm` and `stepDeg` are how
  // far one press of a transform button moves the selection.
  stepCm: 1, stepDeg: 5, weldTolCm: 0.25,
  // The drape side-car. This project's solver resolves contact as a point
  // query per vertex, so it holds the cloth off the body at its VERTICES and
  // nowhere else and the figure comes through the triangles in between --
  // measured, 0.47 cm at 130 sample points on a four-panel skirt, against
  // 0 cm at none for the side-car. So the local fall is a preview and the
  // side-car is the answer. See sim/server.py and docs/16-solvers.md.
  sidecarUrl: DEFAULT_URL, useSidecar: true, sidecarSeconds: 6,
  // Draw the body inset by half the cloth's thickness, which is the half of
  // the cloth the renderer otherwise leaves out. Capped at that; it is not a
  // knob for hiding penetration.
  bodyInsetCm: 0.2, clothThicknessCm: 0.4,
  // Send what the viewer measures to the side-car, so it can be read without
  // someone copying a browser console by hand.
  telemetry: true,
  // How fast a seam is drawn closed, cm/s. Constant: the seam is fed at this
  // rate rather than pulled towards zero, so it never accelerates.
  sewSpeedCmPerSec: 4,
  stitchColour: 'tension',        // 'tension' | 'seam'
  maxTensionGf: 250, stitchSoftness: 60,
  // Whether a seam that cannot be closed is welded anyway. Off is the honest
  // setting and the default; on is the old behaviour, kept because it is the
  // control case the new one is measured against.
  forceSeamsShut: false,
  // the cutting table
  tool: 'select', intakeDeg: 15, spreadDeg: 20,
  selfCollision: true, clothColour: 'stretch', slowMo: 1,
  // Collide edge midpoints as well as vertices while ARRANGING, so the body
  // does not bulge through the middle of a triangle while the cloth is still
  // bridging between a handful of contacts. Off for free drape, where it costs
  // the drop test its settle. See docs/15-manual-sewing.md.
  edgeCollision: true,
};

// when a pattern has been sewn onto the body, this holds the fit result
let garment = null;
let fit = null;
// the pattern currently in hand: imported from disk, or last drafted. Exports
// come from THIS, so a pattern loaded from a file can be re-exported to SVG
// without being silently regenerated from the body on screen.
let loadedPattern = null;
let loadedName = null;

let surface = null;
let asm = null;
let sim = null;              // the running cloth simulation, if any
// When a garment is being assembled from separate pieces, this holds what is
// needed to weld it once the seams are closed.
let assembling = null;
// what the drape side-car is doing, for the HUD
let sidecar = null;
let clothMesh = null;
let playing = false;
let bodyMesh = null;
let armMesh = null;
let legMesh = null;
let armscyeLines = null;
let tileMesh = null;
let seamLines = null;
let makehuman = null;      // cached MeshSurface

const busy = document.getElementById('busy');
const withBusy = (label, fn) => {
  busy.textContent = label; busy.style.display = 'grid';
  requestAnimationFrame(() => { setTimeout(() => { try { fn(); } finally { busy.style.display = 'none'; } }, 0); });
};

// --------------------------------------------------------------- surfaces

const torso = new Body();

async function loadMakeHuman() {
  if (makehuman) return makehuman;
  const txt = await fetch('./models/bodice.obj').then((r) => {
    if (!r.ok) throw new Error('bodice.obj not found - run tools/prep_bodice.py');
    return r.text();
  });
  makehuman = new MeshSurface(txt);
  return makehuman;
}

/**
 * The body, drawn inset by half the cloth's thickness.
 *
 * Not a cheat, and the distinction matters. The solver models cloth with a
 * real thickness (`clothThickness`, 0.4 cm) and holds its MID-SURFACE that
 * far off the skin -- but the renderer draws the cloth as a zero-thickness
 * sheet sitting exactly on its mid-surface, and draws the skin at the skin.
 * So the near half of the cloth's own body is simply missing from the
 * picture, and the figure reads as poking through wherever the sheet is
 * within half a thickness of it. Garment software renders the offset for
 * precisely this reason.
 *
 * What this does NOT do is hide solver error. It is clamped to half the
 * modelled thickness, which is the amount that is physically there; the HUD
 * goes on reporting the true clearance from `penetration()`, measured against
 * the real surface, so anything deeper than the cloth is thick still shows up
 * as a number and still shows up on screen.
 */
function buildBodyMesh() {
  if (bodyMesh) { scene.remove(bodyMesh); bodyMesh.geometry.dispose(); }
  const d = surface.mesh(params.source === 'parametric' ? { nu: 110, nv: 80 } : {});
  const inset = Math.max(0, Math.min(params.bodyInsetCm, params.clothThicknessCm / 2));
  const pos = inset > 0
    ? d.positions.map((v, i) => v - d.normals[i] * inset)
    : d.positions;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(d.normals, 3));
  g.setIndex(d.indices);
  bodyMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0x6b6256, roughness: 0.92, metalness: 0.0,
    side: THREE.DoubleSide, flatShading: params.source === 'makehuman',
  }));
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.visible = params.showBody;
  scene.add(bodyMesh);
  frameScene();
  buildArms();
}

/** Arms, shoulder joints and the armscye they carve. */
function buildArms() {
  for (const m of [armMesh, armscyeLines]) {
    if (m) { scene.remove(m); m.geometry.dispose(); }
  }
  if (legMesh) { scene.remove(legMesh); legMesh.geometry.dispose(); legMesh = null; }
  armMesh = null; armscyeLines = null;
  if (params.source !== 'parametric') return;
  surface.includeArms = params.armsCollide;
  surface.includeLegs = params.legsCollide;

  const ld = surface.legMesh();
  const lg2 = new THREE.BufferGeometry();
  lg2.setAttribute('position', new THREE.Float32BufferAttribute(ld.positions, 3));
  lg2.setAttribute('normal', new THREE.Float32BufferAttribute(ld.normals, 3));
  lg2.setIndex(ld.indices);
  legMesh = new THREE.Mesh(lg2, new THREE.MeshStandardMaterial({
    color: 0x5d564c, roughness: 0.92, side: THREE.DoubleSide,
  }));
  legMesh.castShadow = true;
  legMesh.visible = params.showLegs;
  scene.add(legMesh);

  const d = surface.armMesh();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(d.normals, 3));
  g.setIndex(d.indices);
  armMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0x5d564c, roughness: 0.92, side: THREE.DoubleSide,
  }));
  armMesh.castShadow = true;
  armMesh.visible = params.showArms;
  scene.add(armMesh);

  const pts = [];
  for (const side of [-1, 1]) {
    const loop = surface.armscye(side);
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i].p, b = loop[(i + 1) % loop.length].p;
      const push = (q) => pts.push(q[0] * 1.01, q[1], q[2] * 1.01);
      push(a); push(b);
    }
  }
  if (pts.length) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    armscyeLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xd98b4a }));
    armscyeLines.visible = params.showArmscye;
    scene.add(armscyeLines);
  }
}

// ----------------------------------------------------------------- shell

const RAMP = (t) => {               // blue (negative K) -> grey -> orange (positive K)
  t = Math.max(-1, Math.min(1, t));
  return t < 0
    ? new THREE.Color(0.30, 0.45, 0.78).lerp(new THREE.Color(0.72, 0.70, 0.66), 1 + t)
    : new THREE.Color(0.72, 0.70, 0.66).lerp(new THREE.Color(0.90, 0.48, 0.22), t);
};
const GORE_COLOURS = Array.from({ length: 24 }, (_, i) =>
  new THREE.Color().setHSL((i * 0.41) % 1, 0.45, 0.58));
const TILE_COLOURS = Object.fromEntries(LIBRARY.map((t, i) => {
  const c = new THREE.Color().setHSL((i * 0.137) % 1, 0.42, 0.56);
  return [t.id, c];
}));

function buildTileMesh() {
  if (tileMesh) { scene.remove(tileMesh); tileMesh.geometry.dispose(); }
  if (seamLines) { scene.remove(seamLines); seamLines.geometry.dispose(); }
  if (!asm || !asm.tiles.length) return;

  const defects = asm.angleDefects();
  const strainByVert = new Array(asm.verts.length).fill(0);
  for (const s of asm.edgeStrains()) {
    const a = Math.abs(s.strain);
    strainByVert[s.e.a] = Math.max(strainByVert[s.e.a], a);
    strainByVert[s.e.b] = Math.max(strainByVert[s.e.b], a);
  }

  const pos = [], col = [], nor = [];
  // Every tile gets its own three vertices: tiles are rigid flat panels and must
  // read as facets, never as a smooth-shaded surface.
  const inset = 0.02;                                   // shrink slightly to read the seams
  for (const tl of asm.tiles) {
    const P = tl.v.map((i) => asm.verts[i]);
    const c = mul(add(add(P[0], P[1]), P[2]), 1 / 3);
    const n = norm(cross(sub(P[1], P[0]), sub(P[2], P[0])));
    // Orient against the body's own normal under the tile. The cheap
    // "point away from the y axis" test flips on the bust and the shoulders,
    // where the surface normal is nowhere near radial.
    const bn = surface.closestPoint(c).normal;
    const outward = (n[0] * bn[0] + n[1] * bn[1] + n[2] * bn[2]) < 0 ? mul(n, -1) : n;
    for (let k = 0; k < 3; k++) {
      const p = add(P[k], mul(sub(c, P[k]), inset));
      pos.push(p[0], p[1], p[2]);
      nor.push(outward[0], outward[1], outward[2]);
      let colour;
      if (params.colour === 'fit' && fit) {
        // red = the cloth is being stretched (too small here)
        // blue = it stands off the body (too big here); green = as drafted
        const ten = fit.tension[tl.v[k]] || 0;
        const gap = fit.gap[tl.v[k]] || 0;
        colour = ten > 0.01
          ? new THREE.Color(0.55, 0.62, 0.50).lerp(new THREE.Color(0.88, 0.22, 0.18),
              Math.min(1, ten / 0.08))
          : new THREE.Color(0.55, 0.62, 0.50).lerp(new THREE.Color(0.30, 0.50, 0.82),
              Math.min(1, Math.max(0, gap - 1.0) / 2.5));
      } else if (params.colour === 'tile') colour = TILE_COLOURS[tl.tileId] || new THREE.Color(0.6, 0.6, 0.6);
      else if (params.colour === 'gore') {
        // which gore of the exported pattern this tile would fall in
        const cols = (asm.meta && asm.meta.cols) || 1;
        const g = tl.cell ? Math.floor(tl.cell.i * params.gores / cols) : 0;
        colour = GORE_COLOURS[g % GORE_COLOURS.length];
      }
      else if (params.colour === 'strain') colour = RAMP(strainByVert[tl.v[k]] / 0.15);
      else if (params.colour === 'defect') {
        const d = defects[tl.v[k]];
        colour = d === null ? new THREE.Color(0.38, 0.38, 0.40) : RAMP(d / 60);
      } else colour = new THREE.Color(0.74, 0.70, 0.64);
      col.push(colour.r, colour.g, colour.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tileMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.72, metalness: 0.02,
    side: THREE.DoubleSide, flatShading: true,
  }));
  tileMesh.castShadow = true;
  tileMesh.visible = params.showTiles;
  scene.add(tileMesh);

  // seam wireframe, pushed slightly outward so it is never z-fighting
  const lp = [];
  for (const e of asm.edges.values()) {
    for (const vi of [e.a, e.b]) {
      const p = asm.verts[vi];
      lp.push(p[0] * 1.004, p[1], p[2] * 1.004);
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  seamLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x11131a }));
  seamLines.visible = params.showSeams;
  scene.add(seamLines);
}

// ------------------------------------------------- the drop test (physics)

/**
 * Drop a hollow disc of cloth on the body and watch where it goes.
 *
 * Nothing is placed and nothing is pinned. The disc starts flat and
 * horizontal, centred on the neck axis, and from then on gravity, contact and
 * friction decide everything -- including whether it stays on the body at all.
 * A hole a little larger than the neck catches on the shoulders and becomes a
 * yoke; a hole much larger slides down the bodice and ends on the floor. The
 * simulation is not told which; see docs/11-cloth.md.
 */
function startDrop() {
  withBusy('building the level set…', () => {
    const neck = neckFrame(surface);
    const pattern = annulusPattern({
      innerR: params.holeR, outerR: params.discR, edge: params.discEdge,
    });
    const garmentAsm = sewFlat(pattern, {
      y: neck.yTop + params.dropCm, center: neck.center,
    });
    sim = new Cloth(garmentAsm, surface, {
      fabric: params.fabric,
      friction: params.friction,
      substeps: params.substeps,
      selfCollision: params.selfCollision,
      terminalCmPerSec: params.terminalCmPerSec,
      // 0 on the slider means "leave the fabric's own viscosity alone"
      internalDamping: params.internalDamping > 0 ? params.internalDamping : null,
      floorY: floorOf(surface),
    });
    sim.pattern = pattern;
    // clearShell() first: it nulls `asm`, so assigning the disc before calling
    // it would throw the disc away and leave an empty scene.
    clearShell();
    asm = garmentAsm;
    buildClothMesh();
    playing = true;
    console.log(`disc: hole r ${params.holeR} cm (circumference `
      + `${pattern.meta.holeCircumferenceCm} cm) against a ${neck.girthCm.toFixed(1)} cm neck; `
      + `${pattern.panels[0].tris.length} triangles, ${garmentAsm.verts.length} vertices, `
      + `${sim.weightG.toFixed(0)} g of ${params.fabric}`);
    updateHUD();
  });
}

/**
 * Draft a flared or gathered skirt, sew it, hang it from the waist and let it
 * fall into folds.
 *
 * The whole point is that the folds are not authored. The pattern contains
 * more cloth at the hem than the waist can account for -- that is what flare
 * is -- and the only place the excess can go is into standing waves. Turn the
 * gather up instead and the excess appears at the waist seam itself, which is
 * a different garment entirely from the same generator.
 */
function startSkirt() {
  withBusy('drafting, sewing and hanging…', () => {
    // Measure the waist seam on the body, then draft to what was measured.
    // The ring at a given ease is not the tape measurement plus anything
    // obvious -- 72 cm of waist is a 78 cm ring at 1 cm of ease -- and
    // drafting to the tape measure starts the skirt 8 % stretched.
    const waistV = surface.landmarkV('waist');
    const ring = waistRing(surface, { waistV, ease: params.skirtEaseCm });
    const pattern = flaredSkirtPattern({
      panels: params.skirtPanels,
      waistCm: ring.circumferenceCm,
      hemCm: Math.max(ring.circumferenceCm * params.skirtGather + 1, params.skirtHemCm),
      lengthCm: params.skirtLengthCm,
      gather: params.skirtGather,
      edge: params.skirtEdge,
      waistV,
    });
    const placed = placeSkirt(pattern, surface, { ease: params.skirtEaseCm, waistV });
    sim = new Cloth(placed.asm, surface, {
      fabric: params.fabric,
      friction: params.friction,
      substeps: params.substeps,
      selfCollision: params.selfCollision,
      terminalCmPerSec: params.terminalCmPerSec,
      internalDamping: params.internalDamping > 0 ? params.internalDamping : null,
      floorY: floorOf(surface),
    });
    // Pin the waistband on over a third of a second. Without this the waist
    // vertices stay where the cone put them and the skirt hangs from a circle
    // in mid-air instead of from the body.
    sim.pinRamp(placed.pinRamp);
    sim.pattern = pattern;
    clearShell();
    asm = placed.asm;
    loadedPattern = pattern;
    loadedName = `skirt-${params.skirtPanels}panel`;
    buildClothMesh();
    playing = true;
    console.log(`${pattern.meta.panels} panels, waist ring `
      + `${ring.circumferenceCm.toFixed(1)} cm, hem ${pattern.meta.hemCm} cm `
      + `(flare ${pattern.meta.flareRatio}x, gather ${pattern.meta.gather}x); `
      + `each panel is a ${pattern.meta.sectorAngleDeg} deg sector`);
    console.table(assemblyReport(pattern));
    updateHUD();
  });
}

/**
 * Arrange the pattern pieces in 3D, stitch them together, then let it fall.
 *
 * Three phases, watched rather than reported: the pieces stand around the body
 * unjoined, the seams draw closed with gravity off while the cloth wraps onto
 * the figure, and then the seams are welded and gravity comes on. See
 * docs/13-assembly.md.
 *
 * Gravity is off during stitching for a measured reason, not a cosmetic one: a
 * garment sewn while it is also falling fills with strain a nearly
 * inextensible mesh can never work back out.
 */
function startAssembly() {
  withBusy('arranging the pieces…', () => {
    // Whatever pattern is in hand, edits and all -- a skirt off the cutting
    // table, an imported file, or a bodice drafted for this body. This used to
    // call currentSkirtPattern() unconditionally, which DISCARDED any pattern
    // that was not a flared skirt and drafted a skirt instead, so arranging a
    // bodice by hand was not reachable at all.
    const pattern = currentArrangePattern();
    if (table) table.hide();
    const laid = layOut(pattern, surface, { standoffCm: params.standoffCm });
    sim = new Cloth(laid.asm, surface, {
      fabric: params.fabric,
      friction: params.friction,
      substeps: params.substeps,
      // Cut pieces are allowed to pass through each other while they are
      // still cut pieces -- the same reason assemble.js gives for the headless
      // path, which the viewer was not honouring. A wide panel cannot be
      // arranged near the body without overlapping its neighbours, and
      // treating that overlap as a collision stops the seams closing:
      // measured, the viewer's seams stalled at 0.4 cm and nothing welded,
      // against 0.032 cm and a full weld with it off.
      selfCollision: false,
      edgeCollision: params.edgeCollision,
      gravityScale: 0,
      stitches: laid.stitches,
      maxTensionGf: params.maxTensionGf,
      stitchSoftness: params.stitchSoftness,
      sewSpeedCmPerSec: params.sewSpeedCmPerSec,
      floorY: floorOf(surface),
    });
    sim.pattern = pattern;
    // Nothing is being sewn yet. Sewing is a choice of pieces, made below.
    sim.stitchStrength = 0;
    assembling = {
      pattern, laid, phase: 'arranging',
      selected: new Set(pattern.panels.map((_, i) => i)),   // all, to begin with
      sewn: new Set(),                                      // seams already drawn closed
    };
    clearShell();
    asm = laid.asm;
    loadedPattern = pattern;
    loadedName = pattern.meta && pattern.meta.test === 'flared-skirt'
      ? `skirt-${params.skirtPanels}panel` : (loadedName || 'pattern');
    params.clothColour = 'selection';      // so the selection is visible
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    buildClothMesh();
    buildStitchLines();
    // Nothing moves until you say so. The pieces are laid out where the
    // placement hints put them; move them wherever you want them first.
    playing = false;
    const names = pattern.panels.map((p, i) => `${i}:${p.name}`).join('  ');
    const widest = Math.max(...laid.stitches.map((st) => {
      const a = laid.asm.verts[st.a], c = laid.asm.verts[st.b];
      return Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    }));
    tlog('arranged', phaseMetrics({
      pieces: pattern.panels.length,
      seams: pattern.seams.length,
      stitches: laid.stitches.length,
      standoffCm: params.standoffCm,
      widestGapCm: +widest.toFixed(2),
      arrangementStrainPct:
        +(100 * Math.max(...laid.asm.edgeStrains().map((x) => Math.abs(x.strain)))).toFixed(4),
    }));
    console.log(
      `${pattern.panels.length} pieces laid out around the body, all selected. `
      + `${laid.stitches.length} stitches waiting on `
      + `${pattern.seams.length} seams; the widest is ${widest.toFixed(1)} cm open.\n`
      + `pieces:  ${names}\n`
      + '\nNEXT, to sew it two pieces at a time:\n'
      + '  1. press N  -- deselect everything (W on all four sews the lot at once)\n'
      + '  2. click a piece, then SHIFT-CLICK the one next to it\n'
      + `  3. press W  -- their seam starts closing at ${params.sewSpeedCmPerSec} cm/s.`
      + ' Press W again at any point to stop it where it is.\n'
      + '  4. read the seam table that prints, then press G to add the next piece'
      + ' along, and W again\n'
      + '  5. press X when you are done -- welds whatever closed, and drops it\n'
      + '\nMoving things: arrow keys (shift = radius), [ ] spin, ; \' tilt,'
      + ' M mirror, F flip, 0 reset. Or just drag.');
    updateHUD();
  });
}

// ------------------------------------------------- selection and sewing

/**
 * Every stitch whose two pieces are both selected: what W will actually sew.
 *
 * Read off `sim.stitches`, never `laid.stitches`. Cloth takes its own copy of
 * the array, so the two hold DIFFERENT objects and all the live state --
 * armed, feeding, tension -- is on the solver's. Filtering the layout's copy
 * and handing the result to the solver matches nothing at all, which is a
 * silent no-op: W appeared to do nothing because not one stitch was ever
 * armed.
 */
function stitchesInSelection() {
  if (!assembling || !sim) return [];
  const sel = assembling.selected;
  return sim.stitches.filter((st) => sel.has(st.pa) && sel.has(st.pb));
}

/**
 * Select pieces, and keep the picture and the solver in step.
 *
 * The selection is what decides which seams are being sewn -- a stitch is
 * active iff BOTH its pieces are selected -- so changing it has to re-arm the
 * solver, not just recolour the mesh.
 */
function setSelection(ids) {
  if (!assembling) return;
  assembling.selected = new Set(ids);
  armStitches();
  updateClothMesh();
  updateStitchLines();
  updateHUD();
}

/** A stitch's seam, named even when the pattern did not name it. */
const seamKeyOf = (st) => st.seam || `P${st.pa}-P${st.pb}`;

/**
 * Tell the solver which seams are being sewn.
 *
 * Three states, and the middle one is what makes assembly progressive:
 *
 *   NOT YET SEWN       a thread that has not been put in. Inactive: the two
 *                      pieces are free to be moved apart.
 *   ALREADY SEWN       sewn on an earlier pass. Stays active for ever, because
 *                      a seam does not come undone when you select the next
 *                      pair of pieces. These are the basting threads.
 *   BEING SEWN NOW     inside the selection, while the phase is 'stitching'.
 */
/**
 * Keep every seam that has ever been threaded active, at full strength.
 *
 * There is no ramp any more and nothing needs one: the gentleness comes from
 * the feed rate, which draws the seam together at a constant `sewSpeedCmPerSec`
 * instead of pulling it towards zero with a constant force. A thread once in
 * stays in and keeps holding at whatever it has closed, which is what makes
 * stopping half way mean something.
 */
function armStitches() {
  if (!assembling || !sim) return 0;
  let n = 0;
  for (const st of sim.stitches) {
    st.active = st.rest !== null;
    st.strength = 1;
    if (st.active) n++;
  }
  if (n > 0 && sim.stitchStrength <= 0) sim.stitchStrength = 1;
  return n;
}

/** Pieces sharing a seam with the selection: the next step of an assembly. */
function selectAdjacent() {
  if (!assembling) return;
  const sel = new Set(assembling.selected);
  for (const st of assembling.laid.stitches) {
    if (sel.has(st.pa)) sel.add(st.pb);
    if (sel.has(st.pb)) sel.add(st.pa);
  }
  setSelection(sel);
}

/**
 * W: start sewing the selected seams, or stop where they have got to.
 *
 * A toggle, because sewing is now something that takes time at a known rate
 * rather than an event. Press it and the seams begin closing at
 * `sewSpeedCmPerSec`; press it again and they stop exactly where they are,
 * threads still in and holding, and you are back to arranging. Select other
 * pieces and press it again to carry on -- including on a seam that was left
 * half closed, which resumes from where it stopped rather than starting over.
 */
function toggleSewing() {
  if (!assembling || assembling.phase === 'falling') return;
  if (assembling.phase === 'stitching') { pauseSewing('stopped'); return; }

  const todo = stitchesInSelection();
  if (!todo.length) {
    console.warn('no seams inside the selection -- select at least two pieces '
      + 'that share a seam (shift-click, or "grow the selection").');
    return;
  }
  // Predicated on the selection rather than on object identity, so it cannot
  // matter which copy of the stitch array the caller happened to look at.
  const sel = assembling.selected;
  const n = sim.startSewing((st) => sel.has(st.pa) && sel.has(st.pb));
  armStitches();
  assembling.phase = 'stitching';
  playing = true;
  const seams = [...new Set(todo.map(seamKeyOf))];
  const togo = sim.remainingFeedCm();
  tlog('sew-start', phaseMetrics({
    stitches: n, seams: seams.length, toTakeUpCm: +togo.toFixed(2),
    sewSpeedCmPerSec: params.sewSpeedCmPerSec,
    maxTensionGf: params.maxTensionGf,
  }));
  console.log(`sewing ${n} stitches on ${seams.length} seam(s) `
    + `(${seams.join(', ')}): ${togo.toFixed(1)} cm to take up at `
    + `${params.sewSpeedCmPerSec} cm/s, about `
    + `${(togo / params.sewSpeedCmPerSec).toFixed(1)} s. `
    + 'Press W again to stop it where it is.');
}

/** Stop feeding, leaving every seam exactly where it has got to. */
function pauseSewing(why = 'stopped') {
  if (!assembling || assembling.phase !== 'stitching') return;
  sim.stopSewing();
  assembling.phase = 'arranging';
  playing = false;
  for (const st of sim.stitches) {
    if (st.rest !== null) assembling.sewn.add(seamKeyOf(st));
  }
  const rows = sim.stitchReport({ closedCm: params.weldTolCm })
    .filter((r) => r.sewing !== 'no');
  const left = sim.remainingFeedCm();
  tlog('sew-stop', phaseMetrics({
    why,
    leftToTakeUpCm: +left.toFixed(2),
    seamsOpen: rows.filter((r) => r.maxGapCm > params.weldTolCm).length,
    seamsClosed: rows.filter((r) => r.maxGapCm <= params.weldTolCm).length,
    peakTensionGf: +Math.max(0, ...sim.stitches.map((x) => x.peakGf)).toFixed(0),
    seams: rows.map((r) => ({
      seam: r.seam, closedPct: r.closedPct, maxGapCm: r.maxGapCm,
      meanTensionGf: r.meanTensionGf, verdict: r.verdict,
    })),
  }));
  console.log(`${why}: ${left > params.weldTolCm
    ? `${left.toFixed(1)} cm still to take up -- press W to carry on`
    : 'every armed seam is fully taken up'}.`);
  console.table(rows);
  const bad = rows.filter((r) => r.sewing === 'done' && r.maxGapCm > params.weldTolCm);
  if (bad.length) {
    console.warn(`${bad.length} seam(s) would not close: `
      + bad.map((r) => `${r.seam} ${r.verdict}`).join('; ')
      + '. They are NOT welded shut -- fix the pattern on the table (T), or '
      + 'accept it and drop anyway.');
  }
  console.log('select other pieces and press W again, or X to weld and drop.');
  updateStitchLines();
  updateClothMesh();
  updateHUD();
}

/** Phase 2 -> 3: weld the closed seams and switch gravity on. */
function finishAssembly() {
  if (!assembling || assembling.phase === 'falling') return;
  const { pattern, laid } = assembling;
  // Only seams that were actually SEWN are candidates for welding. Passing
  // every stitch would weld a seam nobody ever sewed, purely because its two
  // pieces happened to be parked within the tolerance of each other -- which
  // would make the arrangement, rather than the sewing, decide what is joined.
  // Press X having sewn half the seams and you get a half-assembled garment,
  // which is the honest answer.
  const sewnStitches = sim.stitches.filter((st) => assembling.sewn.has(seamKeyOf(st)));
  if (!sewnStitches.length) {
    console.warn('nothing has been sewn yet -- press W on a selection first.');
    return;
  }
  const welded = weldStitched(laid.asm, sewnStitches, {
    velocities: sim.vel,
    closedCm: params.forceSeamsShut ? Infinity : params.weldTolCm,
  });
  const idsOfKind = (kind) => {
    const out = new Set();
    for (const p of pattern.panels) {
      for (const r of p.runs || []) {
        if (r.kind !== kind) continue;
        for (const i of r.pts) {
          const v3 = p.pts[i].v3;
          if (laid.v3Of.has(v3)) out.add(welded.map[laid.v3Of.get(v3)]);
        }
      }
    }
    return [...out];
  };
  welded.asm.meta.hemIds = idsOfKind('bottom');
  welded.asm.meta.waistIds = idsOfKind('top');
  // Only a skirt has a waist ring to measure against, and the hem profile and
  // the HUD both key off this. A bodice arranged by hand must not claim to be
  // one, or `count the folds` reports nonsense about it.
  const isSkirt = !!(pattern.meta && pattern.meta.test === 'flared-skirt');
  welded.asm.meta.skirt = isSkirt;
  if (isSkirt) welded.asm.meta.waistRingCm = pattern.meta.waistCm;
  const gap = sim.maxStitchGap();
  const report = sim.stitchReport({ closedCm: params.weldTolCm });
  const next = new Cloth(welded.asm, surface, {
    fabric: params.fabric,
    friction: params.friction,
    substeps: params.substeps,
    selfCollision: params.selfCollision,
    edgeCollision: params.edgeCollision,
    // The seams that would not close keep their basting threads through the
    // fall. They are still held as well as the thread can hold them, they
    // still report their tension, and they are visibly still open -- which is
    // the point: a garment with a seam that does not meet should LOOK like
    // one, not like a garment with a puckered seam.
    stitches: welded.openStitches,
    maxTensionGf: params.maxTensionGf,
    stitchSoftness: params.stitchSoftness,
    floorY: floorOf(surface),
  });
  if (welded.openStitches.length) next.stitchStrength = 1;
  welded.velocities.forEach((v, i) => { next.vel[i] = v; });
  if (params.pinWaist && welded.asm.meta.waistIds.length) {
    for (const i of welded.asm.meta.waistIds) {
      welded.asm.pinned[i] = true;
      next.invMass[i] = 0;
    }
  }
  next.pattern = pattern;
  sim = next;
  asm = welded.asm;
  assembling.phase = 'falling';
  // Gravity is on in the new Cloth, but something has to STEP it. This used
  // to be inherited: finishAssembly was reached from inside the render loop
  // while a sewing pass was running, so `playing` was already true. Since W
  // became a toggle the pass ends paused, and X was welding a garment with
  // gravity enabled and then leaving it hanging in mid-air, untouched.
  playing = true;
  assembling.seamReport = report;
  panelOfVert = [];
  if (!welded.openStitches.length) {
    for (const o of [stitchLines, seamCorners]) {
      if (o) { scene.remove(o); o.geometry.dispose(); }
    }
    stitchLines = null; seamCorners = null;
  } else {
    buildStitchLines();
  }
  buildClothMesh();
  tlog('welded', phaseMetrics({
    weldedPct: welded.weldedPct,
    leftBasted: welded.openStitches.length,
    weldTolCm: params.weldTolCm,
  }));
  console.log(`welded ${welded.weldedPct} % of the stitches `
    + `(within ${params.weldTolCm} cm); ${welded.asm.verts.length} vertices. `
    + `Widest seam still open: ${gap.toFixed(2)} cm. Gravity on.`);
  if (params.useSidecar) sendToSidecar();
  if (welded.openStitches.length) {
    console.warn(`${welded.openStitches.length} stitches were NOT welded because `
      + 'their seams would not close. They stay basted and visible.');
    console.table(report.filter((r) => r.maxGapCm > params.weldTolCm));
  }
  updateHUD();
}

/**
 * Hand the welded garment to the drape side-car, and put the answer back.
 *
 * Measured on a four-panel skirt, the same garment draped both ways:
 *
 *   this project   4.2 s   0.47 cm through the body at 130 sample points
 *   side-car      42   s   0    cm at none
 *
 * The difference is not tuning. Contact here is a point query per vertex, so
 * the cloth is held off the body at its vertices and the triangle between
 * them is free to dip below the surface; the side-car's solver does
 * triangle-against-triangle with the response spread over the three corners
 * by barycentric weight. No amount of adjusting the former turns it into the
 * latter -- which is what an afternoon of trying it established.
 *
 * It is asynchronous and the local fall keeps running underneath, so the
 * viewer never blocks: you watch the preview drop, and a minute later it is
 * replaced by the real thing.
 */
async function sendToSidecar() {
  if (!sim || !asm) return;
  const target = asm;
  const pinned = asm.pinned.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  const h = await sidecarHealth(params.sidecarUrl);
  if (!h) {
    console.warn(`no drape side-car at ${params.sidecarUrl} -- showing the local`
      + ' preview only, which lets the body through between the vertices.'
      + ' Start it with:  python3 sim/server.py');
    updateHUD();
    return;
  }
  sidecar = { state: 'running', since: Date.now() };
  tlog('sidecar-start', phaseMetrics({ backends: Object.keys(h.backends || {}) }));
  updateHUD();
  console.log(`side-car (${Object.entries(h.backends).map(([k, v]) => `${k}: ${v}`).join(', ')})`
    + ` draping ${asm.verts.length} vertices…`);
  try {
    const out = await drapeRemote(target, surface, {
      url: params.sidecarUrl,
      session: telemetrySessionId,
      fabric: params.fabric,
      seconds: params.sidecarSeconds,
      pinned,
      selfCollision: params.selfCollision,
    });
    // the garment may have been cleared or rebuilt while we waited
    if (asm !== target) { sidecar = null; return; }
    playing = false;
    out.verts.forEach((p, i) => {
      target.verts[i][0] = p[0]; target.verts[i][1] = p[1]; target.verts[i][2] = p[2];
    });
    for (const v of sim.vel) { v[0] = 0; v[1] = 0; v[2] = 0; }
    const pen = sim.penetration();
    sidecar = { state: 'done', backend: out.backend, seconds: out.wallSeconds, pen };
    updateClothMesh();
    updateStitchLines();
    updateHUD();
    tlog('sidecar-done', phaseMetrics({
      backend: out.backend, solveSeconds: out.wallSeconds,
    }));
    flushTelemetry();
    console.log(`side-car drape done in ${out.wallSeconds}s (${out.backend}).`
      + ` Inside the body: ${pen.worstCm} cm at ${pen.insideSamples} sample points.`);
    console.table(sim.report());
  } catch (e) {
    sidecar = { state: 'failed', error: String(e.message || e) };
    tlog('sidecar-failed', { error: String(e.message || e) });
    flushTelemetry();
    console.error(`side-car drape failed: ${e.message || e}`);
    updateHUD();
  }
}

const STRETCH_RAMP = (t) => (t >= 0
  ? new THREE.Color(0.58, 0.60, 0.55).lerp(new THREE.Color(0.90, 0.20, 0.16), Math.min(1, t))
  : new THREE.Color(0.58, 0.60, 0.55).lerp(new THREE.Color(0.28, 0.48, 0.80), Math.min(1, -t)));

/**
 * Cloth gets its own mesh rather than going through buildTileMesh.
 *
 * Two reasons. It is an indexed, smooth-shaded sheet, where a tiled shell is a
 * set of rigid facets that must read as facets. And it is redrawn sixty times
 * a second, so the geometry is allocated once and only the positions and
 * colours are rewritten -- buildTileMesh rebuilds every buffer and asks the
 * body for a closest point per tile, which is several milliseconds a frame.
 */
function buildClothMesh() {
  if (clothMesh) { scene.remove(clothMesh); clothMesh.geometry.dispose(); }
  clothMesh = null;
  if (!sim) return;
  const n = asm.verts.length;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setIndex(asm.tiles.flatMap((t) => t.v));
  clothMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.78, metalness: 0.0, side: THREE.DoubleSide,
  }));
  clothMesh.castShadow = true;
  clothMesh.visible = params.showTiles;
  scene.add(clothMesh);
  updateClothMesh();
}

const PANEL_COLOURS = Array.from({ length: 12 }, (_, i) =>
  new THREE.Color().setHSL((i * 0.37) % 1, 0.42, 0.60));
let panelOfVert = [];

/** Which panel each vertex belongs to, for colouring the assembly. */
function indexPanels() {
  panelOfVert = new Array(asm.verts.length).fill(0);
  const names = [...new Set(asm.tiles.map((t) => t.label))];
  for (const t of asm.tiles) {
    const k = names.indexOf(t.label);
    for (const v of t.v) panelOfVert[v] = k;
  }
}

function updateClothMesh() {
  if (!clothMesh || !sim) return;
  if (panelOfVert.length !== asm.verts.length) indexPanels();
  const g = clothMesh.geometry;
  const pos = g.attributes.position.array;
  const col = g.attributes.color.array;
  const V = asm.verts;
  for (let i = 0; i < V.length; i++) {
    pos[i * 3] = V[i][0]; pos[i * 3 + 1] = V[i][1]; pos[i * 3 + 2] = V[i][2];
  }
  // Colour is recomputed from the seam strains, which is the whole point of
  // the exercise: red where the cloth is being pulled past what was cut, blue
  // where it has gone slack and will fold.
  const f = sim.field();
  for (let i = 0; i < V.length; i++) {
    let c;
    if (params.clothColour === 'panel') c = PANEL_COLOURS[(panelOfVert[i] || 0) % PANEL_COLOURS.length];
    else if (params.clothColour === 'selection') {
      // selected pieces in their own colour, the rest dimmed: the only way to
      // see what a button press is about to move
      const pi = assembling ? assembling.laid.panelOf[i] : null;
      const on = !assembling || assembling.selected.has(pi);
      c = PANEL_COLOURS[(panelOfVert[i] || 0) % PANEL_COLOURS.length].clone();
      if (!on) c.lerp(new THREE.Color(0.20, 0.21, 0.23), 0.78);
    } else if (params.clothColour === 'stretch') c = STRETCH_RAMP((f.tension[i] - f.slack[i]) / 0.05);
    else if (params.clothColour === 'contact') {
      c = f.contact[i] ? new THREE.Color(0.92, 0.55, 0.15) : new THREE.Color(0.56, 0.60, 0.66);
    } else if (params.clothColour === 'gap') {
      c = STRETCH_RAMP(-Math.min(1, Math.max(0, f.gap[i]) / 4));
    } else c = new THREE.Color(0.74, 0.70, 0.64);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.attributes.position.needsUpdate = true;
  g.attributes.color.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
}

let stitchLines = null;

/**
 * Draw every stitch as a line between the two points it will join, coloured by
 * the seam it belongs to, with the ends of each seam marked.
 *
 * Arranging pieces without seeing which edge marries which is guesswork, and
 * the pattern already knows: a stitch is a pair of points that share a vertex
 * id. Three things the picture has to show, and the colour is what makes the
 * last two possible:
 *
 *   WHAT JOINS WHAT  one coloured ribbon per seam, rather than sixty
 *                    anonymous lines between two heaps of cloth.
 *   WHICH WAY ROUND  a piece laid in back to front still sews -- the points
 *                    all find their partners -- but its stitches cross each
 *                    other in an X instead of running parallel, and the
 *                    garment comes out wrung. (Measured: half a radian of spin
 *                    on one panel of four took a 235 cm hem to 79 cm.) The
 *                    crossing is the warning, and you can only see it if the
 *                    lines of one seam are distinguishable from the next.
 *   HOW FAR TO GO    the lines shorten to nothing as the seams close.
 *
 * The ends of each seam are marked, because those are the corners that have to
 * meet and the places a mismatch shows first.
 */
let seamCorners = null;
let stitchSeamColour = null;

/**
 * How hard a stitch is pulling, as a colour: slack grey through to the full
 * force limit in red.
 *
 * This is the visible half of the force limit. A seam closing easily stays
 * grey; one that is being dragged shut goes red and STAYS red and open, which
 * is the thing the old hard projection could not show because it always won.
 */
const TENSION_RAMP = (t) => new THREE.Color(0.45, 0.47, 0.50)
  .lerp(new THREE.Color(0.95, 0.80, 0.20), Math.min(1, t * 2))
  .lerp(new THREE.Color(0.95, 0.15, 0.12), Math.max(0, Math.min(1, (t - 0.5) * 2)));

function buildStitchLines() {
  for (const o of [stitchLines, seamCorners]) {
    if (o) { scene.remove(o); o.geometry.dispose(); }
  }
  stitchLines = null; seamCorners = null;
  if (!assembling || !sim || !sim.stitches.length) return;

  // which seam does each stitch belong to? the pattern's runs say so
  const seamOfV3 = new Map();
  const seamIds = [];
  for (const p of assembling.pattern.panels) {
    for (const r of p.runs || []) {
      if (r.kind !== 'seam' || !r.v3) continue;
      if (!seamIds.includes(r.seam)) seamIds.push(r.seam);
      for (const v of r.v3) seamOfV3.set(v, r.seam);
    }
  }
  const colourOf = (v3) => {
    const k = seamIds.indexOf(seamOfV3.get(v3));
    // a stitch on no named seam is a dart: a seam inside a single piece
    return k < 0 ? new THREE.Color(0.85, 0.45, 0.15) : PANEL_COLOURS[(k * 5 + 2) % PANEL_COLOURS.length];
  };

  const n = sim.stitches.length;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
  // The colour is rewritten every frame now (updateStitchLines), because it
  // carries the tension. `stitchColourOf` is kept on the object so the update
  // does not have to rebuild the seam index sixty times a second.
  stitchSeamColour = colourOf;
  stitchLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.8,
  }));
  scene.add(stitchLines);

  // the corners: the first and last stitch of each seam
  const ends = new Map();
  for (const st of sim.stitches) {
    const id = seamOfV3.get(st.v3) ?? 'dart';
    if (!ends.has(id)) ends.set(id, []);
    ends.get(id).push(st);
  }
  const cpts = [], ccol = [];
  for (const [, list] of ends) {
    for (const st of [list[0], list[list.length - 1]]) {
      const c = colourOf(st.v3);
      for (const i of [st.a, st.b]) {
        cpts.push(asm.verts[i][0], asm.verts[i][1], asm.verts[i][2]);
        ccol.push(c.r, c.g, c.b);
      }
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cpts, 3));
  cg.setAttribute('color', new THREE.Float32BufferAttribute(ccol, 3));
  seamCorners = new THREE.Points(cg, new THREE.PointsMaterial({
    size: 1.4, vertexColors: true, sizeAttenuation: true,
  }));
  seamCorners.userData.pairs = [...ends.values()].flatMap((l) => [l[0], l[l.length - 1]]);
  scene.add(seamCorners);
  updateStitchLines();
}

function updateStitchLines() {
  if (!stitchLines || !sim) return;
  const a = stitchLines.geometry.attributes.position.array;
  const col = stitchLines.geometry.attributes.color.array;
  const byTension = params.stitchColour === 'tension';
  const lim = Math.max(1e-6, sim.maxTensionGf);
  sim.stitches.forEach((st, k) => {
    const p = asm.verts[st.a], q = asm.verts[st.b];
    a[k * 6] = p[0]; a[k * 6 + 1] = p[1]; a[k * 6 + 2] = p[2];
    a[k * 6 + 3] = q[0]; a[k * 6 + 4] = q[1]; a[k * 6 + 5] = q[2];
    let c;
    if (!st.active) {
      // a thread not yet put in: nearly invisible, so the seams being worked
      // on are the ones you see
      c = new THREE.Color(0.22, 0.23, 0.26);
    } else if (byTension) {
      c = TENSION_RAMP(st.tensionGf / lim);
    } else {
      c = stitchSeamColour ? stitchSeamColour(st.v3) : new THREE.Color(0.8, 0.8, 0.8);
    }
    for (const o of [0, 3]) { col[k * 6 + o] = c.r; col[k * 6 + o + 1] = c.g; col[k * 6 + o + 2] = c.b; }
  });
  stitchLines.geometry.attributes.color.needsUpdate = true;
  stitchLines.geometry.attributes.position.needsUpdate = true;
  stitchLines.geometry.computeBoundingSphere();
  if (seamCorners) {
    const c = seamCorners.geometry.attributes.position.array;
    seamCorners.userData.pairs.forEach((st, k) => {
      const p = asm.verts[st.a], q = asm.verts[st.b];
      c[k * 6] = p[0]; c[k * 6 + 1] = p[1]; c[k * 6 + 2] = p[2];
      c[k * 6 + 3] = q[0]; c[k * 6 + 4] = q[1]; c[k * 6 + 5] = q[2];
    });
    seamCorners.geometry.attributes.position.needsUpdate = true;
    seamCorners.geometry.computeBoundingSphere();
  }
}

function clearDrop() {
  for (const o of [stitchLines, seamCorners]) {
    if (o) { scene.remove(o); o.geometry.dispose(); }
  }
  stitchLines = null; seamCorners = null;
  playing = false;
  sim = null;
  assembling = null;
  if (clothMesh) { scene.remove(clothMesh); clothMesh.geometry.dispose(); clothMesh = null; }
}

/** Rebuild the body and whatever is shown on it. */
function refreshBody() {
  torso.build();
  // the level set is built from the body's geometry, so it is stale now, and
  // so is any cloth that was resting on the old one
  BodyCollider.invalidate(torso);
  clearDrop();
  if (params.source !== 'parametric') return;
  buildBodyMesh();
  loadedPattern = null;
  if (params.showShell) rebuildShell(); else clearShell();
  updateHUD();
}

function clearShell() {
  asm = null; garment = null; fit = null;
  if (tileMesh) { scene.remove(tileMesh); tileMesh.geometry.dispose(); tileMesh = null; }
  if (seamLines) { scene.remove(seamLines); seamLines.geometry.dispose(); seamLines = null; }
  updateHUD();
}

/** What a tape would read off the model, against what was asked for. */
function measureTable() {
  const got = torso.measure();
  const k = torso.m.units === 'in' ? 1 / INCH : 1;
  const rows = [];
  for (const key of ['bust', 'underBust', 'waist', 'lowHip', 'neckCircumference',
    'backLength', 'apexToApex', 'thighGirth', 'kneeGirth']) {
    rows.push({ measurement: key, asked: +torso.m[key].toFixed(2),
      model: +(got[key] * k).toFixed(2), error: +((got[key] * k) - torso.m[key]).toFixed(2) });
  }
  const apexToWaist = torso.m.frontLengthFromCBNP - torso.m.bustHeightFromCBNP;
  rows.push({ measurement: 'apex to waist (front)', asked: +apexToWaist.toFixed(2),
    model: +(got.apexToWaistFront * k).toFixed(2),
    error: +((got.apexToWaistFront * k) - apexToWaist).toFixed(2) });
  rows.push({ measurement: 'bust projection (derived)', asked: '-',
    model: +(torso.bustProjection * k).toFixed(2), error: '-' });
  for (const key of ['hipWidth', 'hipThickness', 'waistWidth', 'waistThickness']) {
    rows.push({ measurement: key, asked: torso.m[key] || '(default)',
      model: +(got[key] * k).toFixed(2),
      error: torso.m[key] ? +((got[key] * k) - torso.m[key]).toFixed(2) : '-' });
  }
  rows.push({ measurement: 'across the knees', asked: '-',
    model: +(got.acrossKnees * k).toFixed(2), error: '-' });
  return rows;
}

function rebuildShell() {
  garment = null; fit = null;
  if (params.colour === 'fit') params.colour = 'defect';
  const o = {
    u: params.module, ease: params.ease, vLo: params.vLo, vHi: params.vHi,
    wrap: params.front ? false : params.wrap,
  };
  if (params.front) { o.uLo = -0.25; o.uHi = 0.25; }
  asm = buildGridShell(surface, o);
  doRelax(params.iters);
}

function relaxOpts() {
  return {
    iters: params.iters, ease: params.ease, attract: params.attract,
    push: params.push, gravity: params.gravity, tangentDrift: params.tangentDrift,
    edgeStiffness: params.edgeStiffness, edgePasses: params.edgePasses,
    faceClearance: params.faceClearance,
  };
}

function doRelax(n = params.iters) {
  if (!asm) return;
  relax(asm, surface, { ...relaxOpts(), iters: n });
  buildTileMesh(); updateHUD();
}

function doQuantize() {
  if (!asm) return;
  asm = quantize(asm);
  buildTileMesh(); updateHUD();
}

function doSettle() {
  withBusy('settling…', () => {
    const r = settle(asm, surface, quantize, { rounds: 8, relaxOpts: relaxOpts() });
    asm = r.asm;
    console.table(r.log);
    buildTileMesh(); updateHUD();
  });
}

function doGrow() {
  withBusy('growing…', () => {
    if (!asm || !asm.tiles.length) {
      asm = new Assembly({ u: params.module, weldTol: Math.min(0.5, 0.25 * params.module) });
      asm.seedOnSurface(surface, 'R345', 0, (params.vLo + params.vHi) / 2, { ease: params.ease });
    }
    const r = growOntoSurface(asm, surface, { maxTiles: params.growMax, ease: params.ease });
    console.log('grow:', r);
    doRelax(10);
  });
}

/**
 * Build a pattern and download it as a true-scale SVG.
 *
 * Note this builds its OWN shell rather than using the tiled one on screen.
 * The tile shell is the measuring instrument; a pattern wants a fine, smooth
 * triangulation of the body cut into one-cell-wide strips, because only a
 * strip with no interior vertices flattens without self-overlap. See
 * docs/01-geometry.md section 8 and docs/09-pattern.md.
 */
function exportPattern() {
  withBusy('building pattern…', () => {
    const pattern = currentPattern();
    console.table(pattern.panels.map((p) => ({
      panel: p.name, 'area cm2': p.areaCm2, darts: p.darts.length,
      edges: (p.runs || []).map((r) => r.seam || r.kind.toUpperCase()).join(' '),
    })));
    console.table(pattern.seams);
    const { svg, layout } = patternSVG(pattern, {
      fabricWidthCm: params.fabricWidthCm,
      seamAllowanceCm: params.seamAllowanceCm,
      showTiles: false,
      title: `${loadedName} (${pattern.meta.ease} cm ease)`,
    });
    console.log(`fabric ${layout.widthCm} x ${layout.heightCm.toFixed(0)} cm`);
    download(svg, 'image/svg+xml', `${loadedName}.svg`);
  });
}

function download(text, type, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function patternJSON() {
  const shell = buildGridShell(surface, {
    u: 1, cols: params.gores, rows: params.patternRows,
    vLo: params.vLo, vHi: params.vHi, ease: params.ease,
  });
  const { panels } = makePattern(shell, { mode: 'strips', stripWidth: 1, surface });
  return exportPatternJSON(panels, {
    gores: params.gores, rows: params.patternRows, ease: params.ease,
    vLo: params.vLo, vHi: params.vHi, waistV: surface.landmarkV('waist'),
    body: params.source,
    drafted: new Date().toISOString().slice(0, 10),
  }, shell);
}

// where the waist sits in the body's v parameter, for the balance marks
const WAIST_V = () => torso.landmarkV('waist');

/** The pattern to act on: whatever is loaded, else draft one for this body. */
function currentPattern() {
  if (!loadedPattern) {
    loadedPattern = patternJSON();
    loadedName = `bodice-${params.gores}gore`;
  }
  return loadedPattern;
}

function exportPatternJSONFile() {
  withBusy('building pattern…', () => {
    const pattern = currentPattern();
    download(JSON.stringify(pattern), 'application/json', `${loadedName}.json`);
  });
}

/** Forget the loaded pattern, so the next export drafts for the body on screen. */
function redraftForThisBody() {
  loadedPattern = null;
  currentPattern();
  console.log(`drafted ${loadedPattern.panels.length} panels for the current body`);
  updateHUD();
}

/**
 * Sew an imported pattern and let it settle onto whichever body is loaded.
 *
 * Draping a pattern back onto the body it was drafted for only proves the round
 * trip. Draping it onto a DIFFERENT body is the useful operation, and it is the
 * thing a bought pattern can never tell you: not what size you are, but where
 * exactly this piece of paper stops matching you.
 */
function drapePattern(pattern) {
  withBusy('sewing and draping…', () => {
    try {
      garment = sew(pattern, surface, { ease: pattern.meta?.ease ?? params.ease });
      const report = drape(garment, surface, {
        iters: params.drapeIters, gravity: params.gravity,
      });
      fit = fitField(garment, surface);
      asm = garment;
      params.colour = 'fit';
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      console.table(report);
      console.log(`VERDICT: ${report.verdict}`);
      buildTileMesh();
      updateHUD();
    } catch (err) {
      alert(`could not drape that pattern: ${err.message}`);
      console.error(err);
    }
  });
}

function importPatternFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        loadedPattern = importPatternJSON(String(r.result));
        loadedName = f.name.replace(/\.json$/i, '');
        drapePattern(loadedPattern);
      } catch (err) {
        alert(err.message);
      }
    };
    r.readAsText(f);
  };
  input.click();
}

/** Draft a pattern for the current body and immediately try it on. */
function tryOnCurrent() {
  withBusy('drafting…', () => drapePattern(currentPattern()));
}

function exportOBJ() {
  const blob = new Blob([asm.toOBJ(`${params.source} u=${params.module}cm`)], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bodice-shell-u${params.module}.obj`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// -------------------------------------------------------------------- HUD

/**
 * The numbers worth recording at a phase boundary -- the same ones
 * tools/trace.mjs prints, so a session in the viewer and a headless run can
 * be compared line for line. That parity is the whole point: when the two
 * disagree about the same garment, the difference is the bug. It is how the
 * viewer's seams were found stalling at 0.4 cm where the headless path
 * reached 0.032 cm.
 *
 * Clearance costs a few milliseconds over ~19k samples, so this is called at
 * phase boundaries and never per frame.
 */
function phaseMetrics(extra = {}) {
  if (!sim || !asm) return extra;
  try {
    const c = clearance(asm, surface, {
      collider: sim.collider,
      insetCm: Math.min(params.bodyInsetCm, params.clothThicknessCm / 2),
    });
    const r = sim.report();
    return {
      vertices: asm.verts.length,
      triangles: asm.tiles.length,
      insideAreaPct: c.insideAreaPct,
      deepestCm: c.deepestCm,
      visiblePct: c.visiblePct,
      trianglesTouched: c.trianglesTouched,
      medianGapCm: c.medianCm,
      maxStretchPct: r.maxStretchPct,
      rmsSpeedCmPerSec: r.rmsSpeedCmPerSec,
      simSeconds: +sim.time.toFixed(2),
      playing,
      widestSeamGapCm: +sim.maxStitchGap().toFixed(3),
      feedLeftCm: +sim.remainingFeedCm().toFixed(2),
      fabric: params.fabric,
      ...extra,
    };
  } catch (e) {
    return { metricsError: String(e && e.message || e), ...extra };
  }
}

/**
 * What the side-car is doing, as one line.
 *
 * A function and not an object literal indexed by state, which is how this
 * was first written and was a crash: `{running: a, done: b}[state]` builds the
 * whole object first, so the `done` branch dereferenced the result before
 * there was one and threw while the job was still running -- taking the
 * side-car call down with it.
 */
function sidecarLine(sc) {
  switch (sc.state) {
    case 'running':
      return `side-car working… (${((Date.now() - sc.since) / 1000).toFixed(0)} s)`;
    case 'done':
      return `${sc.backend}, ${sc.seconds} s -- ${sc.pen.worstCm} cm inside`
        + ` at ${sc.pen.insideSamples} of ${sc.pen.samples} sample points`;
    case 'failed':
      return `side-car failed: ${sc.error}`;
    default:
      return String(sc.state);
  }
}

/**
 * What the hand assembly is doing, in the HUD rather than in the console.
 *
 * Three things have to be on screen at all times while arranging, because all
 * three change with every button press: what is selected, what is being sewn,
 * and -- the whole point of the force-limited seam -- which seams will not
 * close and by how much.
 */
function assemblyRows(row0, cls0) {
  const a = assembling;
  const nSel = a.selected.size;
  const names = [...a.selected].slice(0, 6)
    .map((i) => a.pattern.panels[i].name).join(', ');
  const rows = sim.stitches.length
    ? sim.stitchReport({ closedCm: params.weldTolCm }) : [];
  const live = rows.filter((r) => r.sewing !== 'no');
  const open = live.filter((r) => r.maxGapCm > params.weldTolCm);
  const peak = Math.max(0, ...sim.stitches.filter((x) => x.active).map((x) => x.tensionGf));

  const togo = sim.remainingFeedCm ? sim.remainingFeedCm() : 0;
  const phaseLine = () => {
    if (a.phase === 'stitching') {
      return `sewing at ${params.sewSpeedCmPerSec} cm/s -- ${togo.toFixed(1)} cm to go,`
        + ` about ${(togo / Math.max(0.01, params.sewSpeedCmPerSec)).toFixed(0)} s.`
        + ' W stops it here.';
    }
    if (a.phase === 'falling') {
      // Say what is actually happening, not what phase we are nominally in.
      // Reporting 'falling' while paused is the same class of mistake as the
      // HUD reporting 0.00 cm inside the body while the figure was visibly
      // through the cloth: a label that cannot be falsified by the state.
      if (!playing) return 'sewn — paused. Space to run gravity.';
      return sidecar && sidecar.state === 'running'
        ? 'sewn, falling (preview) — the side-car is solving the real drape'
        : 'sewn, and falling';
    }
    if (!nSel) return 'arranging -- nothing selected. Click a piece, or A for all.';
    return togo > params.weldTolCm
      ? `arranging -- ${togo.toFixed(1)} cm of seam left to take up.`
        + ' W carries on, X welds and drops.'
      : `arranging ${nSel} piece(s) -- W sews the seams between them, X welds and drops`;
  };
  let out = row0('phase', phaseLine());
  if (a.phase !== 'falling') {
    out += row0('selected', nSel
      ? `${nSel} of ${a.pattern.panels.length}: ${names}${nSel > 6 ? ' …' : ''}`
      : 'none', cls0(nSel > 0));
  }
  out += row0('seams sewn', `${a.sewn.size} of ${new Set(a.laid.stitches.map(seamKeyOf)).size}`);
  if (live.length) {
    out += row0('thread tension', `${peak.toFixed(0)} of ${params.maxTensionGf} gf peak`,
      cls0(peak < params.maxTensionGf * 0.9));
    out += row0('widest seam gap', `${sim.maxStitchGap().toFixed(2)} cm`,
      cls0(sim.maxStitchGap() <= params.weldTolCm));
    // How far the cloth has fallen behind the feed. Small is the seam keeping
    // up; large means it is jammed and the thread is doing all it can.
    const lag = sim.maxStitchGap() - togo;
    out += row0('cloth behind the feed', `${Math.max(0, lag).toFixed(2)} cm`,
      cls0(lag < 0.5));
  }
  for (const r of open) {
    out += row0(`&nbsp;&nbsp;${r.seam}`, r.verdict, 'warn');
  }
  return out;
}

const fitReportOf = () => fitReport(garment, surface);

function updateHUD() {
  const el = document.getElementById('stats');
  if (table && table.visible) {
    const r = table.report();
    const row = (k, v, c = '') => `<tr><td>${k}</td><td class="${c}">${v}</td></tr>`;
    el.innerHTML = '<table>'
      + row('on the table', `${r.pieces} pieces, ${r.seams} seams, ${r.darts} darts`)
      + row('cloth', `${(r.clothCm2 / 10000).toFixed(3)} m2`)
      + row('tool', params.tool === 'dart'
        ? `dart, ${params.intakeDeg} deg intake`
        : (params.tool === 'spread' ? `spread, ${params.spreadDeg} deg` : 'select'))
      + row('will it sew?', r.ok ? 'yes' : r.problems.join('; '), r.ok ? 'ok' : 'warn')
      + row('worst seam mismatch', `${r.worstSeamMismatchCm} cm`,
        r.worstSeamMismatchCm < 0.1 ? 'ok' : 'warn')
      + '</table>'
      + '<div style="margin-top:6px;color:#9aa0aa;font-size:11px">'
      + 'drag from an apex outwards to place a dart or a spread &middot; '
      + 'U undoes &middot; J lifts the pieces onto the body</div>';
    return;
  }
  if (!asm || !asm.tiles.length) {
    const M = torso.M, u = torso.m.units;
    const k = u === 'in' ? 1 / INCH : 1;
    const f2 = (v) => (v * k).toFixed(1);
    el.innerHTML = '<table>'
      + `<tr><td>body</td><td>${params.source}</td></tr>`
      + `<tr><td>height</td><td>${f2(M.height)} ${u}</td></tr>`
      + `<tr><td>bust / underbust</td><td>${f2(M.bust)} / ${f2(M.underBust)} ${u}</td></tr>`
      + `<tr><td>waist / low hip</td><td>${f2(M.waist)} / ${f2(M.lowHip)} ${u}</td></tr>`
      + `<tr><td>back length</td><td>${f2(M.backLength)} ${u}</td></tr>`
      + `<tr><td>apex to apex</td><td>${f2(M.apexToApex)} ${u}</td></tr>`
      + `<tr><td>posture</td><td>${M.posture}</td></tr>`
      + `<tr><td>belly / seat</td><td>${M.bellyProtuberance} / ${M.buttocksShape}</td></tr>`
      + `<tr><td>shoulder slope</td><td>${M.shoulderSlope}</td></tr>`
      + `<tr><td>bust apex height</td><td>${f2(torso.heights.bust)} ${u} above waist</td></tr>`
      + `<tr><td>bust projection</td><td>${f2(torso.bustProjection)} ${u} (derived)</td></tr>`
      + `<tr><td>surface area</td><td>${(torso.surfaceArea() / 10000).toFixed(3)} m2</td></tr>`
      + '</table>'
      + '<div style="margin-top:6px;color:#9aa0aa;font-size:11px">'
      + 'step one: the body. turn on <b>shell</b> or press <b>T</b> to try a pattern on.</div>';
    return;
  }
  const cls0 = (ok) => (ok ? 'ok' : 'warn');
  const row0 = (k, v, c = '') => `<tr><td>${k}</td><td class="${c}">${v}</td></tr>`;
  if (sim) {
    const r = sim.report();
    const p0 = sim.pattern && sim.pattern.meta;
    el.innerHTML = '<table>'
      + row0('cloth', `${params.fabric}, ${r.weightG} g over ${(r.areaCm2 / 10000).toFixed(2)} m2`)
      + row0('hole / hem', p0 ? `${p0.holeCircumferenceCm} / ${p0.hemCircumferenceCm} cm` : '-')
      + row0('mesh', `${asm.tiles.length} triangles, ${r.vertices} vertices`)
      + (assembling ? assemblyRows(row0, cls0) : '')
      + row0('simulated', `${r.seconds.toFixed(2)} s`)
      + row0('still?', `${r.rmsSpeedCmPerSec} cm/s rms`, cls0(r.rmsSpeedCmPerSec < 0.3))
      + row0('touching the body', `${r.contactVerts} vertices (${r.contactPct} %)`)
      // Vertices AND edge midpoints. Reporting vertices alone said "0.00 cm"
      // while the dress form was plainly visible through a half-sewn skirt:
      // every vertex was outside and the triangles between them were not.
      //
      // The body is drawn inset by half the cloth's thickness, so penetration
      // shallower than that is not visible on screen. Both numbers are shown:
      // hiding the real one behind the rendered one is how the HUD came to
      // report 0.00 cm through a visibly broken drape in the first place.
      + row0('inside the body', (() => {
        const d = r.deepestPenetrationCm;
        const hidden = Math.min(params.bodyInsetCm, params.clothThicknessCm / 2);
        if (d <= hidden) {
          return `${d.toFixed(2)} cm -- within the cloth's own thickness,`
            + ' so nothing shows';
        }
        return `${d.toFixed(2)} cm, of which ${(d - hidden).toFixed(2)} cm shows`
          + (r.deepestEdgeCm > r.deepestVertexCm ? ' (between the vertices)' : '');
      })(), cls0(r.deepestPenetrationCm
        <= Math.min(params.bodyInsetCm, params.clothThicknessCm / 2)))
      + (sidecar ? row0('drape', sidecarLine(sidecar),
        cls0(sidecar.state !== 'failed')) : '')
      + row0('stretch mean / max', `${r.meanStrainPct} / ${r.maxStretchPct} %`,
        cls0(r.maxStretchPct < 10))
      + row0('seams stretched', `${r.stretchedSeamsPct} %`)
      + row0('hem height', `${r.bottomYcm.toFixed(1)} cm`)
      + (asm.meta && asm.meta.skirt ? (() => {
        const hp = hemProfile(asm);
        return row0('panels / seams', `${asm.meta.panels} / ${(sim.pattern.seams || []).length}`)
          + row0('waist ring', `${asm.meta.waistRingCm} cm`)
          + row0('folds in the hem', `${hp.folds}, ${hp.foldDepthCm} cm deep`)
          + row0('hem, cut vs hung', `${sim.pattern.meta.hemCm} vs ${hp.hemLengthCm} cm`)
          + row0('hem unevenness', `${hp.hemUnevennessCm} cm`,
            cls0(hp.hemUnevennessCm < 2));
      })() : '')
      + '</table>'
      + '<div style="margin-top:6px;color:#9aa0aa;font-size:11px">'
      + 'red = stretched &middot; blue = slack, it will fold here</div>';
    return;
  }
  const s = asm.stats(surface, params.ease);
  const fc = faceClearanceReport(asm, surface, 0);   // against the real body
  const hist = asm.tileHistogram();
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => `${k}x${v}`).join(' ');
  const cls = (ok) => (ok ? 'ok' : 'warn');
  const row = (k, v, c = '') => `<tr><td>${k}</td><td class="${c}">${v}</td></tr>`;
  if (garment && asm === garment) {
    const r = fitReportOf();
    el.innerHTML = '<table>'
      + row('source', params.source)
      + row('pattern', loadedName || '(drafted here)')
      + row('garment', `${garment.meta.panels} panels sewn`)
      + row('seams', (loadedPattern && loadedPattern.seams) ? loadedPattern.seams.length : '-')
      + row('gap min / median', `${r.minGapCm.toFixed(2)} / ${r.medianGapCm.toFixed(2)} cm`)
      + row('gap p10 / p90', `${r.p10GapCm.toFixed(2)} / ${r.p90GapCm.toFixed(2)} cm`)
      + row('tension mean', `${r.meanTensionPct.toFixed(2)} %`, cls(r.meanTensionPct < 1))
      + row('tension max', `${r.maxTensionPct.toFixed(1)} %`, cls(r.maxTensionPct < 10))
      + row('tight spots', r.tightSpots, cls(r.tightSpots === 0))
      + row('verdict', r.verdict, cls(r.verdict === 'good fit'))
      + '</table>'
      + '<div style="margin-top:6px;color:#9aa0aa;font-size:11px">'
      + 'red = stretched (too small) &middot; blue = stands off (too big)</div>';
    return;
  }
  el.innerHTML = '<table>'
    + row('source', params.source)
    + row('module u', `${params.module.toFixed(1)} cm`)
    + row('tiles', s.tiles)
    + row('vertices / edges', `${s.vertices} / ${s.edges}`)
    + row('DOF (3V-E-6)', s.dof, cls(s.dof < s.vertices * 0.3))
    + row('shell area', `${(s.areaCm2 / 10000).toFixed(3)} m2`)
    + row('seam length', `${(s.seamLengthCm / 100).toFixed(1)} m`)
    + row('fit rms / max', `${s.rmsFitCm.toFixed(2)} / ${s.maxFitCm.toFixed(2)} cm`,
      cls(s.rmsFitCm < 0.8))
    + row('corners inside body', `${s.deepestPenetrationCm.toFixed(2)} cm`, cls(s.deepestPenetrationCm < 0.2))
    + row('faces cutting in', `${fc.tilesCuttingIn} tiles, ${fc.deepestFaceCm.toFixed(2)} cm`,
      cls(fc.tilesCuttingIn === 0))
    + row('seam strain rms', `${(s.rmsStrain * 100).toFixed(1)} %`, cls(s.rmsStrain < 0.08))
    + row('seam strain max', `${(s.maxStrain * 100).toFixed(0)} %`, cls(s.maxStrain < 0.3))
    + row('edge conflicts', s.conflictEdges, cls(s.conflictEdges < 10))
    + row('mean |defect|', `${s.meanAbsDefectDeg.toFixed(1)} deg`)
    + row('total defect', `${s.totalDefectDeg.toFixed(0)} deg`)
    + row('interior verts', s.interiorVertices)
    + row('tiles used', top)
    + '</table>';
}

// -------------------------------------------------------------------- GUI

const gui = new GUI({ title: 'bodice', width: 430 });
const fBody = gui.addFolder('body');
fBody.add(params, 'source', ['parametric', 'makehuman']).onChange(async (v) => {
  busy.textContent = 'loading body…'; busy.style.display = 'grid';
  try {
    surface = v === 'parametric' ? torso : await loadMakeHuman();
    buildBodyMesh();
    if (params.showShell) rebuildShell(); else clearShell();
  } catch (err) {
    alert(err.message);
    params.source = 'parametric';
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  } finally {
    busy.style.display = 'none';
  }
});
fBody.add(params, 'showBody').onChange((v) => { if (bodyMesh) bodyMesh.visible = v; });

const sizeNames = SIZE_CHART.labels.eu.map((eu, i) =>
  `EU ${eu} / US ${SIZE_CHART.labels.us[i]} / UK ${SIZE_CHART.labels.uk[i]}`);
fBody.add(params, 'sizePreset', sizeNames).name('standard size').onChange((v) => {
  torso.applyStandardSize(sizeNames.indexOf(v));
  refreshBody();
  rebuildMeasurementGUI();
});

/**
 * The measurement form, mirroring what a made-to-measure service asks for.
 * Rebuilt on a unit change because the ranges and the stored values both move.
 */
const MEASUREMENTS = [
  ['height', 120, 215, 'total stature'],
  ['bust', 45, 170, 'fullest part'],
  ['underBust', 45, 160, 'directly under the bust'],
  ['waist', 30, 160, 'natural waist'],
  ['lowHip', 30, 200, 'fullest part of the seat'],
  ['neckCircumference', 22, 60, 'base of the neck'],
  ['neckHeight', 0, 20, 'how much neck to carry above the nape'],
  ['backLength', 25, 65, 'nape to waist, down the back'],
  ['bustHeightFromCBNP', 15, 60, 'nape over the shoulder to the apex'],
  ['frontLengthFromCBNP', 30, 95, 'nape over the shoulder and apex to the waist'],
  ['backWidth', 20, 65, 'across the back between the armholes'],
  ['apexToApex', 8, 40, 'bust point to bust point'],
  ['waistToHip', 10, 35, 'waist down to the low hip'],
  ['crotchDepth', 15, 45, 'waist down to the crotch (the rise)'],
  ['waistToKnee', 35, 90, 'waist down to the knee'],
  ['thighGirth', 25, 100, 'fullest part of the upper thigh'],
  ['kneeGirth', 20, 70, 'around the knee'],
];

/**
 * Breadth and depth. A girth alone does not say what SHAPE a cross section is:
 * 98 cm of hip can be wide and flat or narrow and deep, and those need
 * different patterns. Zero means "use the default proportion".
 */
const SHAPE_PAIRS = [
  ['hipWidth', 0, 60, 'low hip, side to side (bitrochanteric breadth)'],
  ['hipThickness', 0, 50, 'low hip, front to back (buttock depth)'],
  ['waistWidth', 0, 60, 'waist, side to side'],
  ['waistThickness', 0, 50, 'waist, front to back'],
];
let fMeas = null;
function rebuildMeasurementGUI() {
  if (fMeas) fMeas.destroy();
  fMeas = fBody.addFolder(`measurements (${torso.m.units})`);
  const k = torso.m.units === 'in' ? 1 / INCH : 1;
  for (const [key, lo, hi, hint] of MEASUREMENTS) {
    fMeas.add(torso.m, key, +(lo * k).toFixed(1), +(hi * k).toFixed(1), k < 1 ? 0.1 : 0.5)
      .name(key.replace(/([A-Z])/g, ' $1').toLowerCase())
      .onFinishChange(refreshBody);
  }
  const fPairs = fMeas.addFolder('breadth and depth (0 = default shape)').close();
  for (const [key, lo, hi] of SHAPE_PAIRS) {
    fPairs.add(torso.m, key, +(lo * k).toFixed(1), +(hi * k).toFixed(1), k < 1 ? 0.1 : 0.5)
      .name(key.replace(/([A-Z])/g, ' $1').toLowerCase())
      .onFinishChange(refreshBody);
  }
  fMeas.open();
}

fBody.add(torso.m, 'units', ['cm', 'in']).name('units').onChange((u) => {
  // convert what is stored, so the body does not change shape when the
  // units do -- which is the whole point of a unit toggle
  const f = u === 'in' ? 1 / INCH : INCH;
  for (const key of LENGTH_KEYS) {
    if (typeof torso.m[key] === 'number') torso.m[key] = +(torso.m[key] * f).toFixed(2);
  }
  refreshBody();
  rebuildMeasurementGUI();
});

const fShape = fBody.addFolder('shape');
fShape.add(torso.m, 'bellyProtuberance', Object.keys(BELLY)).name('belly protuberance')
  .onChange(refreshBody);
fShape.add(torso.m, 'buttocksShape', Object.keys(BUTTOCKS)).name('buttocks shape')
  .onChange(refreshBody);
fShape.add(torso.m, 'posture', Object.keys(POSTURE)).name('posture').onChange(refreshBody);
fShape.add(torso.m, 'shoulderSlope', Object.keys(SHOULDER_SLOPE)).name('shoulder slope')
  .onChange(refreshBody);

const fa = fBody.addFolder('asymmetry -- what no size chart offers').close();
for (const [k2, lo, hi] of [['shoulderDrop', 0, 8], ['lateralShift', -8, 8],
  ['bustAsym', -5, 5], ['rotation', -20, 20]]) {
  fa.add(torso.m, k2, lo, hi, 0.1).onFinishChange(refreshBody);
}

const fArms = fBody.addFolder('arms, legs and poses');
fArms.add(params, 'pose', Object.keys(POSES)).name('pose').onChange((v) => {
  torso.applyPose(v);
  refreshBody();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  if (loadedPattern) drapePattern(loadedPattern);
});
fArms.add(torso.m, 'upperArmGirth', 15, 60, 0.5).name('upper arm girth').onFinishChange(refreshBody);
fArms.add(torso.m, 'armRaise', 0, 110, 1).name('arm raise (abduction)').onChange(refreshBody);
fArms.add(torso.m, 'armForward', -40, 80, 1).name('arm forward (flexion)').onChange(refreshBody);
fArms.add(torso.m, 'legSpread', 0, 35, 1).name('legs apart (abduction)').onChange(refreshBody);
fArms.add(torso.m, 'legForward', -20, 95, 1).name('legs forward (sitting)').onChange(refreshBody);
fArms.add(torso.m, 'stride', 0, 45, 1).name('stride (one fore, one back)').onChange(refreshBody);
fArms.add(params, 'showArms').onChange((v) => { if (armMesh) armMesh.visible = v; });
fArms.add(params, 'showArmscye').name('show armscye').onChange((v) => {
  if (armscyeLines) armscyeLines.visible = v;
});
fArms.add(params, 'armsCollide').name('arms block the cloth').onChange(() => {
  surface.includeArms = params.armsCollide;
  if (params.showShell) rebuildShell();
});
fArms.add(params, 'showLegs').name('show legs (the body below the crotch)')
  .onChange((v) => { if (legMesh) legMesh.visible = v; });
fArms.add(params, 'legsCollide').name('legs block the cloth').onChange(() => {
  surface.includeLegs = params.legsCollide;
  if (params.showShell) rebuildShell();
});
fArms.add({ h: () => {
  // what a hem has to clear, at every height, in this pose
  const rows = [];
  for (const name of ['knee', 'midThigh', 'crotch', 'lowHip']) {
    const y = torso.heights[name];
    const sp = torso.legSpanAt(y);
    rows.push({ level: name, 'y cm': +y.toFixed(1),
      'hem needed cm': +sp.perimeterCm.toFixed(1),
      'width cm': +sp.widthCm.toFixed(1), 'depth cm': +sp.depthCm.toFixed(1) });
  }
  console.table(rows);
} }, 'h').name('hem clearance in this pose');
fArms.add({ a: () => {
  const r = [];
  for (const side of [-1, 1]) {
    const loop = torso.armscye(side);
    let per = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i].p, b = loop[(i + 1) % loop.length].p;
      per += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
    const ys = loop.map((q) => q.p[1]);
    r.push({ side: side < 0 ? 'left' : 'right', 'circumference cm': +per.toFixed(1),
      'top y': +Math.max(...ys).toFixed(1), 'bottom y': +Math.min(...ys).toFixed(1) });
  }
  console.table(r);
} }, 'a').name('measure the armscye');

fBody.add({ m: () => console.table(measureTable()) }, 'm').name('measure the model');
fBody.add({ f: () => frameScene(true) }, 'f').name('reframe the view');

const fShell = gui.addFolder('shell (step two)');
fShell.add(params, 'showShell').name('build a tiled shell').onChange((v) => {
  if (v) rebuildShell(); else clearShell();
});
fShell.add(params, 'module', 1.0, 4.0, 0.25).name('module u (cm)').onFinishChange(rebuildShell);
fShell.add(params, 'ease', 0, 6, 0.1).name('ease (cm)').onFinishChange(rebuildShell);
fShell.add(params, 'garment', ['bodice', 'skirt', 'dress', 'torso', 'full'])
  .name('covers').onChange(() => {
    // bands are named landmarks, not numbers: adding the legs moved every
    // numeric v, so nothing should hold a literal
    Object.assign(params, surface.band(params.garment));
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    if (params.showShell) rebuildShell();
    if (loadedPattern) loadedPattern = null;
  });
fShell.add(params, 'vLo', 0, 1, 0.005).onFinishChange(rebuildShell).listen();
fShell.add(params, 'vHi', 0, 1, 0.005).onFinishChange(rebuildShell).listen();
fShell.add(params, 'front').name('front panel only').onChange(rebuildShell);
fShell.add({ rebuild: rebuildShell }, 'rebuild').name('rebuild grid shell [R]');

const fFit = gui.addFolder('fit (static, no physics)');
fFit.add(params, 'iters', 1, 120, 1);
fFit.add(params, 'attract', 0, 1, 0.01).name('pull to body');
fFit.add(params, 'push', 0, 1, 0.01).name('push out of body');
fFit.add(params, 'gravity', 0, 0.2, 0.005).name('fall (cm/iter)');
fFit.add(params, 'tangentDrift', 0, 1, 1).name('allow sliding');
fFit.add(params, 'edgeStiffness', 0.1, 1, 0.05);
fFit.add(params, 'edgePasses', 1, 8, 1);
fFit.add(params, 'faceClearance', 0, 1, 0.05).name('lift tiles off body');
fFit.add({ relax: () => doRelax() }, 'relax').name('relax [space]');
fFit.add({ q: doQuantize }, 'q').name('requantise to library [Q]');
fFit.add({ s: doSettle }, 's').name('settle: relax+quantise loop [S]');

const fGrow = gui.addFolder('explicit joining').close();
fGrow.add(params, 'growMax', 10, 500, 10).name('max tiles');
fGrow.add({ g: doGrow }, 'g').name('grow from a seed tile [G]');
fGrow.add({ clear: () => { asm = new Assembly({ u: params.module }); buildTileMesh(); updateHUD(); } },
  'clear').name('clear shell');

const fPat = gui.addFolder('pattern');
fPat.add(params, 'gores', 4, 20, 1).name('gores (panels)');
fPat.add(params, 'patternRows', 12, 60, 2).name('vertical resolution');
fPat.add(params, 'seamAllowanceCm', 0, 2.5, 0.1).name('seam allowance cm');
fPat.add(params, 'fabricWidthCm', 90, 160, 5).name('fabric width cm');
fPat.add({ p: exportPattern }, 'p').name('export pattern SVG [P]');
fPat.add({ j: exportPatternJSONFile }, 'j').name('export pattern JSON');
fPat.add({ d: redraftForThisBody }, 'd').name('re-draft for this body');

const fTry = gui.addFolder('try a pattern on');
fTry.add({ i: importPatternFile }, 'i').name('import pattern JSON [I]');
fTry.add({ t: tryOnCurrent }, 't').name('try the current pattern on');
fTry.add(params, 'gravity', 0, 0.03, 0.001).name('gravity');
fTry.add(params, 'drapeIters', 40, 400, 20).name('drape iterations');

const fDrop = gui.addFolder('drop test -- real cloth physics');
fDrop.add(params, 'holeR', 3, 24, 0.5).name('hole radius cm');
fDrop.add(params, 'discR', 12, 60, 1).name('disc radius cm');
fDrop.add(params, 'discEdge', 1.2, 5, 0.1).name('triangle edge cm');
fDrop.add(params, 'dropCm', 0, 20, 1).name('release height cm');
fDrop.add(params, 'fabric', Object.keys(FABRICS)).name('fabric');
fDrop.add(params, 'friction', 0, 1, 0.05).name('friction mu');
fDrop.add(params, 'internalDamping', 0, 1, 0.05).name('internal damping (0 = fabric)');
fDrop.add(params, 'terminalCmPerSec', 0, 400, 10).name('air drag: terminal cm/s');
fDrop.add(params, 'substeps', 4, 24, 1).name('substeps / frame');
fDrop.add(params, 'selfCollision').name('self-collision');
fDrop.add(params, 'edgeCollision')
  .name('collide edge midpoints (body pokes through without it)');
fDrop.add(params, 'slowMo', 0.1, 1, 0.1).name('slow motion');
fDrop.add(params, 'clothColour', ['stretch', 'panel', 'selection', 'contact', 'gap', 'plain'])
  .name('colour by').onChange(updateClothMesh);
fDrop.add({ d: startDrop }, 'd').name('drop it [D]');
fDrop.add({ p: () => { playing = !playing; } }, 'p').name('pause / resume [space]');
fDrop.add({ s: () => { if (sim) { sim.step(1 / 60); updateClothMesh(); updateHUD(); } } }, 's')
  .name('one frame');
fDrop.add({ r: () => { if (sim) console.table(sim.report()); } }, 'r').name('report');
fDrop.add({ x: clearDrop }, 'x').name('clear');

const fSkirt = gui.addFolder('flare and gathers -- pattern pieces assembled');
fSkirt.add(params, 'skirtPanels', 2, 8, 1).name('panels (2, 4, 6, 8)');
fSkirt.add(params, 'skirtHemCm', 80, 320, 5).name('hem circumference cm');
fSkirt.add(params, 'skirtLengthCm', 20, 100, 1).name('length cm');
fSkirt.add(params, 'skirtGather', 1, 3, 0.1).name('gather (1 = flat, 2 = dirndl)');
fSkirt.add(params, 'skirtEaseCm', 0, 4, 0.5).name('waist ease cm');
fSkirt.add(params, 'skirtEdge', 2, 5, 0.25).name('triangle edge cm');
fSkirt.add({ k: startSkirt }, 'k').name('draft, sew and hang it [K]');
fSkirt.add({ j: startAssembly }, 'j').name('1. lay the pieces out [J]');
fSkirt.add({ w: toggleSewing }, 'w').name('2. sew / stop the seams [W]');
fSkirt.add(params, 'standoffCm', 2, 20, 1).name('arrange this far out, cm');
fSkirt.add(params, 'stitchSeconds', 0.5, 6, 0.5).name('seconds to sew the seams');
fSkirt.add(params, 'pinWaist').name('waistband (off = it slides off)');
fSkirt.add({ f: () => { if (sim && asm.meta && asm.meta.skirt) console.table(hemProfile(asm)); } },
  'f').name('count the folds');
fSkirt.add({ a: () => { if (loadedPattern) console.table(assemblyReport(loadedPattern)); } },
  'a').name('how it assembles');
fSkirt.add({ p: exportPattern }, 'p').name('print the pattern [P]');

// ------------------------------------------------- sewing by hand

/**
 * The manual assembly panel: select pieces, move them with buttons, sew only
 * those, and read the seam tension back. See docs/15-manual-sewing.md.
 *
 * The buttons are generated from arrange.TRANSFORMS rather than written out,
 * so a new transform is one line in one place and cannot disagree with the
 * gesture that does the same thing.
 */
const fHand = gui.addFolder('sewing by hand -- select, move, sew');

fHand.add({ j: startAssembly }, 'j').name('1. lay the pieces out [J]');

const fSel = fHand.addFolder('select');
fSel.add({ a: () => { if (assembling) setSelection(assembling.pattern.panels.map((_, i) => i)); } },
  'a').name('select all [A]');
fSel.add({ n: () => setSelection([]) }, 'n').name('select none');
fSel.add({ i: () => {
  if (!assembling) return;
  setSelection(assembling.pattern.panels
    .map((_, i) => i).filter((i) => !assembling.selected.has(i)));
} }, 'i').name('invert');
fSel.add({ g: selectAdjacent }, 'g').name('grow: add whatever shares a seam [G]');
fSel.add({ s: () => {
  if (!assembling) return;
  // the pieces that are not sewn to anything yet: what is left to do
  const done = new Set();
  for (const st of assembling.laid.stitches) {
    if (assembling.sewn.has(seamKeyOf(st))) { done.add(st.pa); done.add(st.pb); }
  }
  setSelection(assembling.pattern.panels.map((_, i) => i).filter((i) => !done.has(i)));
} }, 's').name('still unsewn');
fSel.add({ p: logPlacement }, 'p').name('where are they? (numbers)');

const fMove = fHand.addFolder('move the selection');
fMove.add(params, 'stepCm', 0.1, 10, 0.1).name('step, cm');
fMove.add(params, 'stepDeg', 1, 45, 1).name('step, degrees');
for (const t of arrange.TRANSFORMS) {
  const o = {
    minus: () => nudgeSelection(t.field, -1),
    plus: () => nudgeSelection(t.field, +1),
  };
  fMove.add(o, 'minus').name(`${t.label}  −`);
  fMove.add(o, 'plus').name(`${t.label}  +`);
}
fMove.add({ f: () => selectionAction(arrange.flip) }, 'f').name('flip (lay it face down)');
fMove.add({ m: () => selectionAction(arrange.mirror) }, 'm')
  .name('mirror across the centre front');
fMove.add({ d: () => selectionAction(arrange.distribute) }, 'd')
  .name('distribute evenly around the body');
fMove.add({ w: () => selectionAction((P, sel) => arrange.setWrap(P, sel, true)) }, 'w')
  .name('roll onto the body');
fMove.add({ v: () => selectionAction((P, sel) => arrange.setWrap(P, sel, false)) }, 'v')
  .name('lay flat (a tangent plane)');
fMove.add({ e: () => selectionAction(arrange.reroll) }, 'e')
  .name('re-roll to hug the body here');
fMove.add({ r: () => selectionAction(arrange.reset) }, 'r').name('reset to the placement hints');

const fSew = fHand.addFolder('sew');
fSew.add({ w: toggleSewing }, 'w').name('2. sew / stop the selection [W]');
fSew.add({ x: finishAssembly }, 'x').name('3. weld what closed, and drop [X]');
fSew.add(params, 'sewSpeedCmPerSec', 0.25, 20, 0.25).name('sewing speed, cm/s')
  .onChange((v) => { if (sim) sim.opts.sewSpeedCmPerSec = v; });
fSew.add(params, 'maxTensionGf', 5, 1000, 5).name('thread strength, gram-force')
  .onChange((v) => { if (sim) sim.maxTensionGf = v; });
fSew.add(params, 'stitchSoftness', 1, 400, 1)
  .name('stitch slacker than cloth, x')
  .onChange((v) => { if (sim) sim.alphaStitch = sim.alphaStretch * v; });
fSew.add(params, 'weldTolCm', 0.05, 2, 0.05).name('count a seam closed within, cm');
fSew.add(params, 'forceSeamsShut').name('force open seams shut (the old way)');
fSew.add(params, 'stitchColour', ['tension', 'seam']).name('colour the stitches by');
fSew.add({ r: () => { if (sim && sim.stitches.length) console.table(sim.stitchReport({ closedCm: params.weldTolCm })); } },
  'r').name('seam report: tension and gaps');

const telemetrySessionId = startTelemetry({
  url: params.sidecarUrl, enabled: params.telemetry,
});

// ------------------------------------------------- the drape side-car

/**
 * The real drape runs elsewhere. This project's solver keeps the cloth off the
 * body at its VERTICES and nowhere else, so the figure comes through the
 * triangles in between -- 0.47 cm at 130 sample points on a four-panel skirt,
 * against 0 cm at none for the side-car, which does triangle-against-triangle
 * contact. The local fall is a preview; this is the answer.
 */
const fSide = gui.addFolder('the drape side-car -- where the real contact happens');
fSide.add(params, 'useSidecar').name('send the drape to the side-car');
fSide.add(params, 'sidecarUrl').name('side-car url');
fSide.add(params, 'sidecarSeconds', 1, 20, 1).name('seconds of drape to solve');
fSide.add({ d: () => sendToSidecar() }, 'd').name('re-drape what is on screen now');
fSide.add({ h: async () => {
  const h = await sidecarHealth(params.sidecarUrl);
  if (h) console.table(h.backends);
  else console.warn(`no side-car at ${params.sidecarUrl}.`
    + '  Start it with:  python3 sim/server.py');
} }, 'h').name('is it running?');
fSide.add({ p: () => { if (sim) console.table(sim.penetration()); } }, 'p')
  .name('how much of the body is through the cloth?');
fSide.add(params, 'bodyInsetCm', 0, 0.2, 0.01)
  .name('draw the body inset by, cm (cloth half-thickness)')
  .onChange(buildBodyMesh);

const fTable = gui.addFolder('the cutting table -- edit the pieces');
fTable.add({ t: openTable }, 't').name('put the pieces on the table [T]');
fTable.add(params, 'tool', ['select', 'dart', 'spread']).name('tool')
  .onChange((v) => { if (table) table.tool = v; });
fTable.add(params, 'intakeDeg', 2, 45, 1).name('dart intake, degrees')
  .onChange((v) => { if (table) table.intakeDeg = v; });
fTable.add(params, 'spreadDeg', 2, 60, 1).name('spread, degrees')
  .onChange((v) => { if (table) table.spreadDeg = v; });
fTable.add({ u: () => { if (table && table.undo()) updateHUD(); } }, 'u').name('undo [U]');
fTable.add({ d: () => { if (table) table.topDown(); } }, 'd').name('look down at the table');
fTable.add({ r: () => { if (table) console.table(table.report()); } }, 'r').name('measure the pattern');
fTable.add({ x: () => { if (table) table.hide(); } }, 'x').name('clear the table');

const fView = gui.addFolder('view');
fView.add(params, 'colour', ['defect', 'strain', 'tile', 'gore', 'fit', 'plain']).name('colour by').onChange(buildTileMesh);
fView.add(params, 'showTiles').onChange((v) => {
  if (tileMesh) tileMesh.visible = v;
  if (clothMesh) clothMesh.visible = v;
});
fView.add(params, 'showSeams').onChange((v) => { if (seamLines) seamLines.visible = v; });
fView.add({ e: exportOBJ }, 'e').name('export OBJ [E]');
fView.add({ w: () => console.table(worstEdges(asm, 15)) }, 'w').name('log worst seams');

// ------------------------------------------------- the cutting table

/**
 * The 2D pattern editor, in the 3D scene: a table beside the body with the
 * pieces lying flat on it at true scale.
 *
 * Edit here, then press J to lift the pieces onto the body, arrange them by
 * hand, and W to sew. The table's pattern is the one that gets lifted, so
 * there is no import, export or round trip in between -- what you cut is what
 * gets sewn.
 */
let table = null;

function openTable() {
  const pattern = currentSkirtPattern();
  if (!table) {
    table = new PatternTable({
      scene, camera, controls, dom: renderer.domElement,
      onEdit: (pat, report) => {
        loadedPattern = pat;
        console.table(table.report());
        if (report && report.removedCm2 !== undefined) {
          console.log(`dart: ${report.removedCm2} cm2 taken out, legs `
            + `${report.legCm.join(' / ')} cm (${report.legMismatchCm} cm apart), `
            + `${report.pairs} pairs to sew`);
        } else if (report && report.addedCm2 !== undefined) {
          console.log(`let in ${report.addedCm2} cm2 of cloth on a ${report.legCm} cm cut`);
        }
        updateHUD();
      },
    });
  }
  table.intakeDeg = params.intakeDeg;
  table.spreadDeg = params.spreadDeg;
  table.tool = params.tool;
  table.show(pattern, { origin: [surface.yMax !== undefined ? 55 : 55, 0, 0] });
  table.topDown();
  loadedPattern = pattern;
  clearDrop();
  clearShell();
  console.log(`${pattern.panels.length} pieces on the table. `
    + 'Pick a tool, then drag from an apex outwards. U undoes. J lifts them onto the body.');
  updateHUD();
}

/**
 * The pattern to arrange by hand: whatever is in hand, whatever it is.
 *
 * The assembly used to call currentSkirtPattern() unconditionally, which threw
 * away any loaded pattern that was not a flared skirt and drafted a skirt in
 * its place -- so a bodice, or an imported file, could not be arranged by hand
 * at all. An arranged pattern only has to have seams annotated, which every
 * path through patternio gives it.
 */
function currentArrangePattern() {
  if (loadedPattern && loadedPattern.panels && loadedPattern.panels.length) {
    return loadedPattern;
  }
  return currentSkirtPattern();
}

/** The pattern the table and the assembly share. */
function currentSkirtPattern() {
  if (loadedPattern && loadedPattern.meta && loadedPattern.meta.test === 'flared-skirt') {
    return loadedPattern;
  }
  const waistV = surface.landmarkV('waist');
  const ring = waistRing(surface, { waistV, ease: params.skirtEaseCm });
  return flaredSkirtPattern({
    panels: params.skirtPanels,
    waistCm: ring.circumferenceCm,
    hemCm: Math.max(ring.circumferenceCm * params.skirtGather + 1, params.skirtHemCm),
    lengthCm: params.skirtLengthCm,
    gather: params.skirtGather,
    edge: params.skirtEdge,
    waistV,
  });
}

// ------------------------------------------------- arranging, by hand

/**
 * Arranging the pieces by hand, before anything is sewn.
 *
 * Every motion is RIGID, so a moved piece is still exactly the piece that was
 * cut and the garment still starts unstrained however it is arranged. That is
 * the whole reason the pieces may be moved freely: nothing about the
 * arrangement is a claim about the cloth.
 *
 * What changed: a gesture no longer moves vertices. It edits the piece's
 * stored PLACEMENT (arrange.js) and the vertices are recomputed from the
 * pattern. So the buttons and the mouse are the same operation, a piece can be
 * reset or mirrored, and composing a hundred small moves cannot drift.
 *
 *   click        select a piece (shift-click to add, ctrl-click to remove)
 *   drag         slide the selection around the body, and up and down
 *   shift-drag   spin each piece in its own surface
 *   alt-drag     push the selection away from the body or pull it in
 */
const dragState = {
  verts: null, axis: null, a0: 0, y0: 0, mode: null, moved: false,
  collapseTo: null,
};
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

const setNDC = (ev) => {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
};

/** Where the mouse ray meets a vertical cylinder of radius R about the axis. */
function rayOnCylinder(R, axis) {
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  const ox = o.x - axis[0], oz = o.z - axis[2];
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return null;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - R * R;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t = Math.min(...[(-b - sq) / (2 * a), (-b + sq) / (2 * a)].filter((x) => x > 0));
  if (!Number.isFinite(t)) return null;
  const p = [o.x + d.x * t, o.y + d.y * t, o.z + d.z * t];
  // the body's own convention: outward(a) = [-sin a, 0, cos a]
  return { angle: Math.atan2(-(p[0] - axis[0]), p[2] - axis[2]), y: p[1], point: p };
}

/** Can the pieces still be moved? Only before the garment is welded. */
const canArrange = () => !!assembling && assembling.phase !== 'falling';

/**
 * Recompute the selected pieces' vertices from their placements, and tell the
 * solver the cloth has been moved rather than having moved itself.
 *
 * Zeroing the velocities matters: a piece that was just picked up and put down
 * has no momentum, and leaving the old velocity in makes it lurch when the
 * simulation next steps.
 */
function reapplyPlacements(which = null) {
  if (!assembling) return;
  const { laid, pattern } = assembling;
  const ids = which || [...assembling.selected];
  arrange.applyPlacements(laid.asm, pattern, laid.placements, laid.axis, laid.offsets, ids);
  for (const pi of ids) {
    const base = laid.offsets[pi];
    for (let i = 0; i < pattern.panels[pi].pts.length; i++) {
      const v = sim.vel[base + i];
      v[0] = 0; v[1] = 0; v[2] = 0;
    }
  }
  // Moving a piece that has already been sewn pulls its seams open again, so
  // the threads on them are let out to where the cloth now is. Otherwise the
  // next press of W would meet a seam that is suddenly 20 cm open with a
  // thread tied for 0 cm, and snap it shut at the force limit.
  const moved = new Set(ids);
  const n = sim.retieStitches((st) => moved.has(st.pa) || moved.has(st.pb));
  if (n) assembling.retied = (assembling.retied || 0) + n;
  updateClothMesh();
  updateStitchLines();
  updateHUD();
}

/** The piece under the mouse, or null. */
function pieceUnderMouse(ev) {
  if (!clothMesh) return null;
  setNDC(ev);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(clothMesh, false)[0];
  if (!hit) return null;
  // the geometry is indexed as asm.tiles.flatMap(t => t.v), so face i is tile i
  return assembling.laid.panelOf[asm.tiles[hit.faceIndex].v[0]];
}

// ---- the transform buttons, which are the same operations as the gestures

/** One press of a button: move the selection by one step. */
function nudgeSelection(field, sign, mult = 1) {
  if (!canArrange() || !assembling.selected.size) return;
  const t = arrange.TRANSFORMS.find((x) => x.field === field);
  const step = (t.unit === 'cm' ? params.stepCm : params.stepDeg) * mult;
  arrange.nudge(assembling.laid.placements, assembling.selected, field, step * sign);
  reapplyPlacements();
}

function selectionAction(fn) {
  if (!canArrange() || !assembling.selected.size) return;
  fn(assembling.laid.placements, assembling.selected, assembling.laid.defaults);
  reapplyPlacements();
}

/** What the selected piece's placement is, in numbers. */
function logPlacement() {
  if (!assembling || !assembling.selected.size) return;
  const ids = [...assembling.selected];
  console.table(Object.fromEntries(ids.map((i) =>
    [assembling.pattern.panels[i].name, arrange.describe(assembling.laid.placements[i])])));
}

renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (!canArrange() || !clothMesh) return;
  const pi = pieceUnderMouse(ev);
  if (pi === null || pi === undefined) return;

  // Selection, and the one subtle case: a plain click on a piece that is
  // ALREADY selected.
  //
  // It cannot narrow the selection there and then, because a plain drag is how
  // a whole selection is moved and collapsing to one piece on pointerdown
  // would make a multi-piece drag impossible. But it must not do nothing
  // either -- everything is selected after J, so "click the piece you want"
  // would have no effect at all, which is the first thing anyone tries.
  //
  // So it is decided on the way up: a click that moved nothing collapses to
  // the piece under it, a click that dragged moves the selection it had.
  const sel = new Set(assembling.selected);
  dragState.collapseTo = null;
  if (ev.ctrlKey || ev.metaKey) sel.delete(pi);
  else if (ev.shiftKey) { if (!sel.has(pi)) sel.add(pi); }
  else if (!sel.has(pi)) { sel.clear(); sel.add(pi); }
  else if (sel.size > 1) dragState.collapseTo = pi;
  if (sel.size !== assembling.selected.size
    || ![...sel].every((x) => assembling.selected.has(x))) setSelection(sel);

  const axis = assembling.laid.axis;
  const R = assembling.laid.placements[pi].radius;
  const at = rayOnCylinder(R, axis);
  if (!at) return;
  dragState.axis = axis;
  dragState.R = R;
  dragState.a0 = at.angle;
  dragState.y0 = at.y;
  dragState.moved = false;
  dragState.mode = ev.shiftKey ? 'spin' : (ev.altKey ? 'radius' : 'move');
  controls.enabled = false;
  renderer.domElement.setPointerCapture(ev.pointerId);
});

renderer.domElement.addEventListener('pointermove', (ev) => {
  if (!dragState.mode || !canArrange()) return;
  setNDC(ev);
  raycaster.setFromCamera(ndc, camera);
  const at = rayOnCylinder(dragState.R, dragState.axis);
  if (!at) return;
  let dA = at.angle - dragState.a0;
  while (dA > Math.PI) dA -= 2 * Math.PI;
  while (dA < -Math.PI) dA += 2 * Math.PI;
  const dY = at.y - dragState.y0;
  const P = assembling.laid.placements;
  const sel = assembling.selected;

  // Each gesture is one field of the placement. The mouse and the buttons are
  // now literally the same operation on the same numbers.
  if (dragState.mode === 'move') {
    for (const i of sel) { P[i].station += dA; P[i].y += dY; }
  } else if (dragState.mode === 'spin') {
    for (const i of sel) P[i].spin += dA;
  } else {
    // vertical mouse travel reads as in/out
    for (const i of sel) P[i].radius = Math.max(1, P[i].radius + dY);
  }
  dragState.a0 = at.angle;
  dragState.y0 = at.y;
  dragState.moved = true;
  reapplyPlacements();
});

const endDrag = (ev) => {
  if (!dragState.mode) return;
  // a click, not a drag: take the piece that was clicked
  if (!dragState.moved && dragState.collapseTo !== null) {
    setSelection([dragState.collapseTo]);
  }
  dragState.collapseTo = null;
  dragState.mode = null;
  controls.enabled = true;
  if (ev && ev.pointerId !== undefined && renderer.domElement.hasPointerCapture(ev.pointerId)) {
    renderer.domElement.releasePointerCapture(ev.pointerId);
  }
};
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

// ---------------------------------------------------------------- keys

const COLOURS = ['defect', 'strain', 'tile', 'gore', 'fit', 'plain'];

/**
 * The keys that only mean something while the pieces are being arranged.
 *
 * They are handled first and separately rather than added to the global list,
 * because several of the letters the arranging needs are already spoken for --
 * G grows the shell, R rebuilds it -- and silently stealing them would break
 * the rest of the viewer. In this mode they mean the arranging thing; outside
 * it they mean what they always did.
 *
 * The arrow keys are the transform buttons under the fingers: a press is one
 * step, shift is five steps, alt is a fifth of one.
 */
function arrangeKey(ev) {
  if (!canArrange()) return false;
  const k = ev.key.toLowerCase();
  const all = () => assembling.pattern.panels.map((_, i) => i);
  const mult = ev.shiftKey ? 5 : (ev.altKey ? 0.2 : 1);
  switch (k) {
    case 'a': setSelection(all()); return true;
    case 'n': setSelection([]); return true;
    case 'g': selectAdjacent(); return true;
    case 'x': finishAssembly(); return true;
    case 'm': selectionAction(arrange.mirror); return true;
    case 'f': selectionAction(arrange.flip); return true;
    case '0': selectionAction(arrange.reset); return true;
    case 'arrowleft': nudgeSelection('station', -1, mult); return true;
    case 'arrowright': nudgeSelection('station', +1, mult); return true;
    case 'arrowup': nudgeSelection(ev.shiftKey ? 'radius' : 'y', +1, ev.shiftKey ? 1 : mult); return true;
    case 'arrowdown': nudgeSelection(ev.shiftKey ? 'radius' : 'y', -1, ev.shiftKey ? 1 : mult); return true;
    case '[': nudgeSelection('spin', -1, mult); return true;
    case ']': nudgeSelection('spin', +1, mult); return true;
    case ';': nudgeSelection('tilt', -1, mult); return true;
    case "'": nudgeSelection('tilt', +1, mult); return true;
    default: return false;
  }
}

addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT') return;
  if (arrangeKey(ev)) { ev.preventDefault(); return; }
  const k = ev.key.toLowerCase();
  if (k === 'r') { params.showShell = true; rebuildShell();
    gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
  else if (k === ' ') {
    ev.preventDefault();
    if (sim) playing = !playing; else doRelax(20);
  }
  else if (k === 'd') startDrop();
  else if (k === 'k') startSkirt();
  else if (k === 'j') startAssembly();
  else if (k === 'w') toggleSewing();
  else if (k === 'u') { if (table && table.undo()) updateHUD(); }
  else if (k === 'q') doQuantize();
  else if (k === 's') doSettle();
  else if (k === 'g') doGrow();
  else if (k === 'e') exportOBJ();
  else if (k === 'p') exportPattern();
  else if (k === 'i') importPatternFile();
  else if (k === 't') openTable();
  else if (k === 'c') {
    params.colour = COLOURS[(COLOURS.indexOf(params.colour) + 1) % COLOURS.length];
    buildTileMesh(); gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- start

// Step one is the body, on its own. Nothing is drawn on it until asked.
surface = torso;
Object.assign(params, surface.band(params.garment));
buildBodyMesh();
frameScene(true);
rebuildMeasurementGUI();
updateHUD();

(function loop() {
  requestAnimationFrame(loop);
  // The cloth is stepped here, in the render loop, because the point of the
  // test mode is to WATCH it fall. It stops itself once the cloth is still,
  // so a settled drape costs nothing.
  if (playing && sim) {
    // A sewing pass: ramp the thread tension, then stop and report.
    //
    // The ramp is on the FORCE LIMIT now, not on the correction -- the same
    // thread pulled progressively harder, which is what drawing a seam closed
    // by hand is. And the end of a pass returns to arranging rather than
    // welding the whole garment, so the next pieces can be chosen: that is
    // what makes the assembly progressive.
    // Sewing is a constant-rate feed now (cloth.js `_feedStitches`), so there
    // is no ramp to drive here. It stops itself once every seam being sewn has
    // had its whole gap taken up and the cloth has caught up with the feed --
    // or the moment W is pressed again, whichever comes first.
    if (assembling && assembling.phase === 'stitching') {
      if (!sim.isSewing() && sim.rmsSpeed() < 1.0) pauseSewing('sewn');
    }
    sim.step((1 / 60) * params.slowMo);
    updateClothMesh();
    updateStitchLines();
    if (!sim.healthy()) {
      playing = false;
      console.error('the cloth solver blew up; try more substeps or a smaller triangle');
    } else if (sim.rmsSpeed() < 0.3 && sim.time > 0.5
      && !(assembling && assembling.phase === 'stitching')) {
      if (assembling && assembling.phase === 'falling' && !assembling.previewLogged) {
        assembling.previewLogged = true;
        tlog('preview-settled', phaseMetrics({}));
      }
      // A sewing pass is quasi-static by design -- the cloth creeps along at
      // the feed rate, which is well under this threshold -- so the
      // settled-and-stop test has to leave it alone or it would pause the
      // sewing on its first frame.
      playing = false;
      console.table(sim.report());
      updateHUD();
    }
  }
  controls.update();
  renderer.render(scene, camera);
})();

// expose for console poking
Object.assign(globalThis, { THREE, scene, torso, get asm() { return asm; }, params, relax, quantize, settle, buildGridShell, LIBRARY });
// A one-line summary of the hand-assembly state, for headless checks of the
// viewer: what is selected, what is armed, and how far there is to go.
globalThis.__dbg = () => (assembling ? JSON.stringify({
  phase: assembling.phase,
  playing,
  simSeconds: +sim.time.toFixed(2),
  frames: sim.steps,
  selected: [...assembling.selected],
  armed: sim.stitches.filter((s) => s.active).length,
  feeding: sim.stitches.filter((s) => s.feeding).length,
  feedLeftCm: +sim.remainingFeedCm().toFixed(2),
  widestGapCm: +sim.maxStitchGap().toFixed(2),
}) : 'no assembly');
// A frame pump for headless checks: requestAnimationFrame does not fire in
// headless Chrome, so the render loop never runs there and the canvas stays
// blank. This drives the same work the loop does, so a screenshot taken after
// it shows what the viewer would show.
globalThis.__pump = (n = 1) => {
  for (let i = 0; i < n; i++) {
    if (playing && sim) {
      if (assembling && assembling.phase === 'stitching'
        && !sim.isSewing() && sim.rmsSpeed() < 1.0) pauseSewing('sewn');
      sim.step(1 / 60);
      updateClothMesh();
      updateStitchLines();
    }
    controls.update();
    renderer.render(scene, camera);
  }
};
Object.assign(globalThis, { renderer, camera, controls, frameScene });
globalThis.__sel = (ids) => setSelection(ids);
