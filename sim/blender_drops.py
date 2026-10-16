"""Three cloth drops, in Blender, with nothing of this project in them.

    blender --background --factory-startup --python sim/blender_drops.py  # -> out/drops.blend
    blender out/drops.blend --python sim/blender_play.py                  # watch it

Written to answer a question that came before trusting any of this project's
own numbers: what does Blender's cloth solver actually do, on shapes whose
answer is already known by eye? A sheet onto a cube should set and stay, a
sheet onto a sphere is marginal, and a sheet dropped off-centre onto a sphere
should slide off. It does all three.

Two mechanics worth keeping, both of which cost an attempt to learn:
a `--python` STARTUP script runs before the UI context exists, so
`bpy.context.active_object` -- what every tutorial uses to grab what was just
added -- raises AttributeError and the script dies silently with a half-built
scene; meshes are therefore built through `bpy.data` here and playback waits
for an `app.timers` callback. And Blender shows its splash screen over the
viewport whenever it starts with no file loaded, which is why the scene is
built headless, saved, and opened.
"""
# Three drops side by side:
#   x=0  sheet onto the cube
#   x=4  sheet centred on a sphere
#   x=8  sheet offset 1.2 m in BOTH x and y from its sphere -- does it slide off?
# No bpy.ops, no bpy.context: a --python startup script runs before the UI
# context exists, so meshes are built through bpy.data and playback waits for
# a timer.
import math

import bpy

scene = bpy.data.scenes[0]
scene.frame_start = 1
scene.frame_end = 250

CUBE_X, SPHERE_X, OFFSET_X = 0.0, 4.0, 8.0
OFFSET = 1.2  # how far the third sheet is shifted off its sphere, in x and y


def link(name, verts, faces, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def sheet(name, cx, cy=0.0, size=4.0, n=50, z=2.5):
    """A flat square of n x n quads, centred on (cx, cy), held z up."""
    step = size / n
    verts = [(cx - size / 2 + i * step, cy - size / 2 + j * step, z)
             for j in range(n + 1) for i in range(n + 1)]
    faces = [(j * (n + 1) + i, j * (n + 1) + i + 1,
              (j + 1) * (n + 1) + i + 1, (j + 1) * (n + 1) + i)
             for j in range(n) for i in range(n)]
    ob = link(name, verts, faces, smooth=True)
    m = ob.modifiers.new("Cloth", 'CLOTH')
    m.collision_settings.use_self_collision = True
    m.collision_settings.distance_min = 0.015
    return ob


def uv_sphere(name, cx, r=1.0, segs=32, rings=16):
    """Poles plus (rings-1) latitude bands, as quads with triangles at the caps."""
    verts = [(cx, 0.0, r)]
    for j in range(1, rings):
        phi = math.pi * j / rings
        for i in range(segs):
            th = 2 * math.pi * i / segs
            verts.append((cx + r * math.sin(phi) * math.cos(th),
                          r * math.sin(phi) * math.sin(th),
                          r * math.cos(phi)))
    verts.append((cx, 0.0, -r))
    last = len(verts) - 1

    faces = []
    for i in range(segs):
        faces.append((0, 1 + i, 1 + (i + 1) % segs))
    for j in range(rings - 2):
        a, b = 1 + j * segs, 1 + (j + 1) * segs
        for i in range(segs):
            i2 = (i + 1) % segs
            faces.append((a + i, b + i, b + i2, a + i2))
    a = 1 + (rings - 2) * segs
    for i in range(segs):
        faces.append((last, a + (i + 1) % segs, a + i))

    ob = link(name, verts, faces, smooth=True)
    ob.modifiers.new("Collision", 'COLLISION')
    return ob


# The floor, at z = -1: the cube's underside and the spheres' south poles, so
# everything is standing on it rather than hovering. Without it a sheet that
# slides off keeps falling forever.
floor = link("FLOOR",
             [(-10.0, -10.0, -1.0), (20.0, -10.0, -1.0),
              (20.0, 10.0, -1.0), (-10.0, 10.0, -1.0)],
             [(0, 1, 2, 3)])
floor.modifiers.new("Collision", 'COLLISION')

# The cube that factory startup already provides, as a collider.
cube = bpy.data.objects["Cube"]
cube.location = (CUBE_X, 0.0, 0.0)
if "Collision" not in cube.modifiers:
    cube.modifiers.new("Collision", 'COLLISION')

uv_sphere("SPHERE", SPHERE_X)
uv_sphere("SPHERE_OFFSET", OFFSET_X)

sheet("SHEET_CUBE", CUBE_X)
sheet("SHEET_SPHERE", SPHERE_X)
sheet("SHEET_OFFSET", OFFSET_X + OFFSET, OFFSET)

scene.frame_set(1)


def start():
    """Runs once the window exists; a startup script has no screen to play in."""
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != 'VIEW_3D':
                continue
            region = next((r for r in area.regions if r.type == 'WINDOW'), None)
            # Framed by hand rather than view_all(): the floor is far wider
            # than the drops, so framing everything pushes them to specks.
            r3d = area.spaces.active.region_3d
            r3d.view_location = (4.0, 0.0, 0.0)
            r3d.view_distance = 16.0
            with bpy.context.temp_override(window=window, area=area, region=region):
                bpy.ops.screen.animation_play()
            return None
    return None


bpy.app.timers.register(start, first_interval=1.0)
print("READY: cube, centred sphere, offset sphere")

# Saved so the window can be opened ON a file: Blender shows its splash only
# when it starts with nothing loaded.
import os
if bpy.app.background:
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "drops.blend"))
