"""Frame the drops and press play, for a .blend opened in the GUI.

    blender out/drops.blend --python sim/blender_play.py

Separate from the scene it plays because opening a FILE is what suppresses
Blender's splash screen, and because an operator needs a window: this runs
from a timer, once one exists.
"""
import bpy


def start():
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != 'VIEW_3D':
                continue
            region = next((r for r in area.regions if r.type == 'WINDOW'), None)
            r3d = area.spaces.active.region_3d
            r3d.view_location = (4.0, 0.0, 0.0)
            r3d.view_distance = 16.0
            with bpy.context.temp_override(window=window, area=area, region=region):
                bpy.ops.screen.animation_play()
            return None
    return None

bpy.app.timers.register(start, first_interval=0.5)
