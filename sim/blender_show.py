"""Open the drape job in Blender's own window, so the solve can be watched.

    blender --factory-startup --python sim/blender_show.py -- job.json [--play]

Note what is MISSING from that command line: `--background`. This is the same
scene `blender_drape.py` builds -- same body collider, same cloth modifier,
same thicknesses, same sewing springs -- but left on screen with its timeline
unplayed instead of baked to a file and thrown away. Scrubbing it is the only
way to see WHERE a drape goes wrong rather than what it scored.

It imports `blender_drape` rather than restating the setup, for the reason
CLAUDE.md rule 7 gives about the viewer and the headless path: a window that
showed slightly different cloth than the one the side-car solves would be
worse than no window at all. Everything physical lives there; this file only
decides what is on screen and whether playback starts.
"""

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blender_drape as bd  # noqa: E402


def view_3d():
    """The first 3D viewport, with its window and screen -- the context an
    operator needs when nothing was clicked to invoke it."""
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == 'VIEW_3D':
                region = next((r for r in area.regions if r.type == 'WINDOW'), None)
                return {"window": window, "area": area, "region": region}
    return None


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    job = json.load(open(argv[0]))
    play = "--play" in argv

    bd.clear()
    scene = bpy.context.scene
    scene.render.fps = int(job.get("fps", 30))
    scene.gravity = (0.0, 0.0, -9.81 if job.get("gravity", True) else 0.0)

    body = bd.add_body(job["body"]["verts"], job["body"]["tris"],
                       job.get("bodyThicknessCm", 0.2))
    cloth = bd.add_cloth(job["garment"]["verts"], job["garment"]["tris"],
                         job.get("pinned", []), job["cloth"],
                         job.get("sewEdges", []))

    scene.frame_start = 1
    scene.frame_end = int(job.get("frames", 60))
    scene.frame_set(1)

    # The body reads better as a cage than as a solid: the whole question this
    # window answers is what the cloth does AGAINST it, and an opaque collider
    # hides exactly the contact being judged.
    body.display_type = 'WIRE'
    cloth.select_set(True)
    bpy.context.view_layer.objects.active = cloth

    ctx = view_3d()
    if ctx:
        with bpy.context.temp_override(**ctx):
            bpy.ops.view3d.view_all()
            if play:
                bpy.ops.screen.animation_play()

    print(f"SHOW OK {len(job['garment']['verts'])} cloth vertices, "
          f"{len(job['body']['verts'])} body vertices, "
          f"{len(job.get('sewEdges', []))} seams, "
          f"{scene.frame_end} frames"
          + (", playing" if play and ctx else ", press Space to play"))


main()
