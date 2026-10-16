"""The repeatable workload: the circle skirt falling on its cone, headless.

    blender --background --factory-startup --python sim/fork/bench.py -- [frames] [edge_cm]

    SEWING_FORK_LOG=1  blender ... # per-frame phase timings from the fork
    SEWING_FORK_LOG=2  blender ... # per-substep as well

Every profiling run and every stock-vs-fork comparison uses this and nothing
else. The scene is the one from sim/blender_skirt.py -- a 78 cm waist, 55 cm,
full circle skirt cut flat above an apex-up cone, with the solver settings the
main program sends (quality 14, collision quality 12, self-collision on). It
is a fair workload precisely because it is not a toy: 3,887 cloth vertices
against a 1,600-triangle collider, the cloth catching, sliding and then
finding its flutes.

TWO THINGS IT GETS RIGHT THAT ARE EASY TO GET WRONG:

Frames are stepped ONE AT A TIME. Cloth only solves on a sequential step; jump
from frame 1 to frame 30 and Blender quietly reads an empty cache and leaves
the mesh where it was. That mistake produced a flat, confident, wrong timing
in this project once already.

The mesh is read back every frame. A solver whose result nobody looks at can
be optimised to nothing, and `to_mesh()` forces the depsgraph to actually
evaluate what was solved.
"""

import os
import struct
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # sim/

import blender_skirt as bs  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
FRAMES = int(argv[0]) if len(argv) > 0 else 120
EDGE_CM = float(argv[1]) if len(argv) > 1 else 2.5


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bs.register()

    # Explicit, not ambient: the operator has a solver property of its own and
    # an unspecified one used to win, so a run asking for the fork measured
    # stock. Say it out loud here and check it below.
    want_fork = os.environ.get("SEWING_CLOTH_FORK", "0") not in ("", "0")

    t_build = time.time()
    bpy.ops.mesh.circle_skirt_add(edge_cm=EDGE_CM,
                                  solver='FORK' if want_fork else 'STOCK')
    t_build = time.time() - t_build

    skirt = bpy.data.objects["Skirt"]
    cone = bpy.data.objects["Cone"]
    cloth = skirt.modifiers["Cloth"]
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, FRAMES
    scene.frame_set(1)

    print(f"[bench] {len(skirt.data.vertices)} cloth verts, "
          f"{len(cone.data.polygons)} collider quads, edge {EDGE_CM} cm, "
          f"quality {cloth.settings.quality}, "
          f"collision {cloth.collision_settings.collision_quality}, "
          f"self-collision {cloth.collision_settings.use_self_collision}, "
          f"built in {t_build * 1000:.0f} ms")
    print(f"[bench] fork log level: {os.environ.get('SEWING_FORK_LOG', '0')}")
    print(f"[bench] solver asked for: {'FORK' if want_fork else 'stock'}"
          f"  (the [simfork] line above says what was actually taken)")

    dg = bpy.context.evaluated_depsgraph_get()
    t0 = time.time()
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)       # one at a time, never a jump
        dg.update()
        ev = skirt.evaluated_get(dg)
        me = ev.to_mesh()        # force the evaluation to actually happen
        ev.to_mesh_clear()
    wall = time.time() - t0

    # Where it ended up, so a run that solved nothing is obvious at a glance.
    ev = skirt.evaluated_get(dg)
    me = ev.to_mesh()
    zs = [v.co.z for v in me.vertices]
    verts_flat = [c for v in me.vertices for c in (v.co.x, v.co.y, v.co.z)]
    ev.to_mesh_clear()

    print(f"[bench] {FRAMES} frames in {wall:.2f} s "
          f"= {wall / FRAMES * 1000:.1f} ms/frame, {FRAMES / wall:.2f} fps")
    print(f"[bench] settled z range {min(zs) * 100 + 100:.1f} .. "
          f"{max(zs) * 100 + 100:.1f} cm (world)")

    # A CHECKSUM OF EVERY COORDINATE, not a range to one decimal place.
    # "Same drape" and "same bits" are different claims, and only the second
    # one shows that a change to the solver changed nothing it should not.
    # FNV-1a over the raw float bytes: any single bit that differs changes it.
    h = 0xCBF29CE484222325
    for b in struct.pack(f"<{len(verts_flat)}f", *verts_flat):
        h = ((h ^ b) * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    print(f"[bench] vertex checksum {h:016x}")


main()
