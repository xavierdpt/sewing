"""A circle-skirt dialog inside Blender.

    blender --python sim/blender_skirt.py

Adds `Add > Mesh > Circle Skirt`, a button in the 3D view's sidebar (N) under
a `Skirt` tab, and the operator `mesh.circle_skirt_add` for scripting. The
button opens a dialog of the same measurements the main program takes.

The geometry is `app/js/skirt.js`'s, restated in Python rather than reinvented.
A flared panel is an ANNULAR SECTOR, and the whole skirt is the sector of
angle `Theta = (hem - waist) / length` with inner radius `r0 = waist / Theta`.
Wrapped into a cone, a point at radial distance `r` from the apex sits on a
ring of radius `k*r` where `k = Theta / 2pi` is the trade's `circleFraction`,
at depth `sqrt(1 - k^2) * (r - r0)` below the waist. k = 1 is a full circle
skirt and lies flat; k -> 0 is a straight tube. That is exact, not fitted: the
sector is developable, so the cloth is unstrained before anything is solved.

WHAT THIS IS NOT. It cuts one seamless cone. The main program's reason for
existing is the part left out -- panels cut flat, laid out, sewn edge to edge
at a constant feed rate, and welded (app/js/assemble.js) -- and the seam
closure numbers in todos/18-validation.md are about that, not this. This is the
shape those panels are trying to become, which makes it a useful control:
anything the solver does to this is the fabric and the body talking, with no
sewing in between.

Centimetres in the dialog, metres in the scene, because Blender's gravity is
9.81 m/s^2 and a garment measured in centimetre-units falls like treacle --
the same conversion, and the same reason, as sim/blender_drape.py.
"""

import math
import os

import bpy
from bpy.props import BoolProperty, EnumProperty, FloatProperty, IntProperty

# The forked build (sim/fork/) carries both cloth paths in one binary and
# picks between them on this environment variable, read fresh on every solve.
# Setting it here therefore takes effect on the next drop, with no reload --
# which is the whole reason the switch is an env var and not a compile flag.
FORK_ENV = "SEWING_CLOTH_FORK"


def running_forked_blender():
    """Is this the build that has the fork in it?

    Decided by where the binary came from, not by asking it: the stock
    Blender would silently ignore the switch and report stock timings, and a
    comparison that cannot tell which solver ran is worth nothing.
    """
    return "blender-fork-build" in bpy.app.binary_path


def set_solver(use_fork):
    """Ask for a solver. Takes effect at the NEXT solver init, not at once.

    The forked build reads this when it builds a cloth object's solver state
    and then holds that answer for as long as the state lives -- otherwise a
    switch mid-fall would hand one solver the other's data. In practice:
    change it, press Reset, drop again.
    """
    os.environ[FORK_ENV] = "1" if use_fork else "0"

bl_info = {
    "name": "Circle Skirt",
    "blender": (4, 0, 0),
    "category": "Add Mesh",
}

CM = 0.01


def skirt_mesh(waist_cm, length_cm, circle_fraction, gather, edge_cm):
    """Vertices and quads of the assembled skirt, in Blender metres.

    Returns (verts, faces, waist_indices, hem_cm).
    """
    pattern_waist = waist_cm * gather
    hem_cm = pattern_waist + 2 * math.pi * circle_fraction * length_cm

    k = circle_fraction
    r0 = pattern_waist / (2 * math.pi * k)       # apex to waist, along the cloth
    drop = math.sqrt(max(0.0, 1.0 - k * k))      # depth per unit of cloth

    cols = max(8, int(round(hem_cm / edge_cm)))
    rows = max(2, int(round(length_cm / edge_cm)))

    verts, waist = [], []
    for j in range(rows + 1):
        r = r0 + length_cm * j / rows
        ring, z = k * r, -drop * (r - r0)
        for i in range(cols):
            a = 2 * math.pi * i / cols
            verts.append((ring * math.cos(a) * CM,
                          ring * math.sin(a) * CM,
                          z * CM))
            if j == 0:
                waist.append(len(verts) - 1)

    faces = []
    for j in range(rows):
        for i in range(cols):
            i2 = (i + 1) % cols
            a, b = j * cols, (j + 1) * cols
            faces.append((a + i, b + i, b + i2, a + i2))

    return verts, faces, waist, hem_cm


def cone_mesh(base_r_cm, height_cm, segs=64, rings=24):
    """A cone standing apex-up, in Blender metres, open at the bottom.

    The stand-in for a body: it is the shape a skirt is *supposed* to fall
    into, so what the cloth does on it is the fabric answering rather than the
    body's bumps. The waist hole drops over the apex, and the cloth has to
    find its own folds on the way down.
    """
    verts, faces = [], []
    for j in range(rings + 1):
        t = j / rings
        r = base_r_cm * t          # 0 at the apex, base_r at the floor
        z = height_cm * (1.0 - t)
        for i in range(segs):
            a = 2 * math.pi * i / segs
            verts.append((r * math.cos(a) * CM, r * math.sin(a) * CM, z * CM))
    for j in range(rings):
        for i in range(segs):
            i2 = (i + 1) % segs
            a, b = j * segs, (j + 1) * segs
            faces.append((a + i, b + i, b + i2, a + i2))
    return verts, faces


class MESH_OT_circle_skirt_add(bpy.types.Operator):
    """Add a circle skirt, cut to a waist measurement"""
    bl_idname = "mesh.circle_skirt_add"
    bl_label = "Circle Skirt"
    bl_options = {'REGISTER', 'UNDO'}

    waist_cm: FloatProperty(name="Waist", default=78.0, min=20.0, max=200.0,
                            unit='NONE', description="Finished waist, cm")
    length_cm: FloatProperty(name="Length", default=55.0, min=5.0, max=200.0,
                             description="Waist to hem, cm")
    circle_fraction: FloatProperty(
        name="Circle", default=1.0, min=0.05, max=1.0,
        description="How much of a circle the skirt makes. 1 = full circle, "
                    "0.5 = half, 0.25 = quarter")
    gather: FloatProperty(
        name="Gather", default=1.0, min=1.0, max=4.0,
        description="Fullness at the waist. 1 = smooth, 2 = twice the cloth "
                    "gathered into the same waistband")
    edge_cm: FloatProperty(name="Edge", default=2.5, min=0.5, max=20.0,
                           description="Target quad edge, cm")
    waist_z_cm: FloatProperty(name="Waist height", default=100.0, min=0.0,
                              max=300.0, description="Where the waist sits, cm")
    add_cone: BoolProperty(
        name="Cone to fall on", default=True,
        description="A cone collider under the waist, apex up, for the skirt "
                    "to drape over")
    cone_base_cm: FloatProperty(name="Cone radius", default=34.0, min=1.0,
                                max=200.0, description="At the floor, cm")
    cone_height_cm: FloatProperty(name="Cone height", default=112.0, min=5.0,
                                  max=300.0)
    add_cloth: BoolProperty(name="Cloth modifier", default=True)
    # Off by default, and the default is the point: a pinned waist hangs where
    # it was cut and never touches the cone. Pin it to hold the skirt on a
    # waistband; leave it free to watch it fall and find the cone itself.
    pin_waist: BoolProperty(name="Pin the waist", default=False)
    # THE FABRIC ITSELF. These are Blender's own cloth settings, named as
    # Blender names them; the defaults are Blender's defaults, so leaving
    # them alone reproduces what the solver does untouched.
    #
    # They were missing until now, and their absence was not harmless: every
    # skirt dropped so far used tension 15, which is soft enough that the
    # waist ring stretches 26 % at p95 over the cone. A fabric parameter you
    # cannot see is one you cannot blame.
    mass_kg: FloatProperty(
        name="Vertex mass", default=0.3, min=0.001, max=10.0,
        description="Blender's cloth mass, per vertex, kg")
    tension: FloatProperty(
        name="Tension", default=15.0, min=0.0, max=10000.0,
        description="Resistance to stretching. Blender's default is 15")
    compression: FloatProperty(
        name="Compression", default=15.0, min=0.0, max=10000.0,
        description="Resistance to being squashed along the cloth")
    shear: FloatProperty(
        name="Shear", default=5.0, min=0.0, max=10000.0,
        description="Resistance to the warp and weft scissoring past each "
                    "other. Low shear is what lets a bias-cut skirt hang "
                    "differently from a straight-grain one")
    bending: FloatProperty(
        name="Bending", default=0.5, min=0.0, max=10000.0,
        description="Resistance to folding. Sets how large the folds are")
    air_damping: FloatProperty(
        name="Air damping", default=1.0, min=0.0, max=10.0,
        description="Drag against the air; how quickly it stops swinging")

    # The three knobs that decide what a drape costs. Blender's own defaults
    # are 5 and 2; the main program sends 14 and 12 (app/js/drapejob.js), and
    # that is most of why a real drape is slower to watch than a tutorial one.
    quality: IntProperty(
        name="Quality", default=14, min=1, max=30,
        description="Solver steps per frame. Blender's default is 5; the main "
                    "program sends 14")
    collision_quality: IntProperty(
        name="Collision quality", default=12, min=1, max=30,
        description="Collision passes per step. Blender's default is 2; the "
                    "main program sends 12")
    solver: EnumProperty(
        name="Solver",
        description="Which cloth solver this skirt is built with. Needs the "
                    "forked build (sim/fork/build.sh); the stock Blender "
                    "ignores it",
        items=[
            ('STOCK', "Blender stock", "Blender 4.0.2's cloth solver as shipped"),
            ('FORK', "Our fork", "The SIMFORK_ copy in src/blender-fork"),
        ],
        default='STOCK')
    self_collision: BoolProperty(
        name="Self-collision", default=True,
        description="Stop the cloth passing through itself. A circle skirt's "
                    "flutes fold onto each other, so turning this off is "
                    "visible, not just faster")

    def invoke(self, context, event):
        # Show the solver that is actually in force, not a hardcoded default.
        if not self.properties.is_property_set("solver"):
            self.solver = ('FORK' if os.environ.get(FORK_ENV, "0") not in ("", "0")
                           else 'STOCK')
        return context.window_manager.invoke_props_dialog(self, width=320)

    def draw(self, context):
        lay = self.layout
        col = lay.column(align=True)
        col.prop(self, "waist_cm")
        col.prop(self, "length_cm")
        col.prop(self, "circle_fraction")
        col.prop(self, "gather")

        # The number that surprises people cutting their first one, so it is
        # shown before the cut rather than discovered after it.
        hem = self.waist_cm * self.gather \
            + 2 * math.pi * self.circle_fraction * self.length_cm
        box = lay.box()
        box.label(text=f"Hem: {hem:.0f} cm", icon='INFO')
        box.label(text=f"({hem / 100:.2f} m of cloth round the bottom)")

        col = lay.column(align=True)
        col.prop(self, "edge_cm")
        col.prop(self, "waist_z_cm")
        lay.separator()
        col = lay.column(align=True)
        col.label(text="Fabric")
        col.prop(self, "mass_kg")
        col.prop(self, "tension")
        col.prop(self, "compression")
        col.prop(self, "shear")
        col.prop(self, "bending")
        col.prop(self, "air_damping")

        lay.separator()
        col = lay.column(align=True)
        col.prop(self, "add_cone")
        sub = col.column(align=True)
        sub.enabled = self.add_cone
        sub.prop(self, "cone_base_cm")
        sub.prop(self, "cone_height_cm")
        lay.separator()
        col = lay.column(align=True)
        col.prop(self, "add_cloth")
        sub = col.column(align=True)
        sub.enabled = self.add_cloth
        sub.prop(self, "pin_waist")
        sub.prop(self, "self_collision")
        sub.prop(self, "quality")
        sub.prop(self, "collision_quality")

        lay.separator()
        col = lay.column(align=True)
        col.prop(self, "solver")
        if not running_forked_blender():
            box = col.box()
            box.label(text="Stock Blender: solver choice ignored", icon='ERROR')
            box.label(text="run sim/fork/run_skirt.sh")
        if self.add_cloth and (self.quality > 5 or self.collision_quality > 2):
            sub.label(text="Blender's defaults are 5 and 2", icon='TIME')

    def execute(self, context):
        if self.add_cone:
            cv, cf = cone_mesh(self.cone_base_cm, self.cone_height_cm)
            cme = bpy.data.meshes.new("Cone")
            cme.from_pydata(cv, [], cf)
            cme.update()
            for p in cme.polygons:
                p.use_smooth = True
            cone = bpy.data.objects.new("Cone", cme)
            context.collection.objects.link(cone)
            col = cone.modifiers.new("Collision", 'COLLISION')
            # Both surfaces carry an epsilon and Blender adds them, so this is
            # half of the separation the cloth will keep -- sim/blender_drape.py.
            col.settings.thickness_outer = 0.35 * CM
            col.settings.thickness_inner = 0.1 * CM
            col.settings.cloth_friction = 5.0

        verts, faces, waist, hem_cm = skirt_mesh(
            self.waist_cm, self.length_cm, self.circle_fraction,
            self.gather, self.edge_cm)

        me = bpy.data.meshes.new("Skirt")
        me.from_pydata(verts, [], faces)
        me.update()
        for p in me.polygons:
            p.use_smooth = True

        ob = bpy.data.objects.new("Skirt", me)
        ob.location = (0.0, 0.0, self.waist_z_cm * CM)
        context.collection.objects.link(ob)

        if self.pin_waist:
            ob.vertex_groups.new(name="waist").add(waist, 1.0, 'REPLACE')

        # Only when someone actually set it. An operator property always HAS a
        # value, so applying it unconditionally made every scripted
        # `circle_skirt_add()` silently reset the solver to this default --
        # which is how a profiling run asking for the fork measured stock
        # instead, and said "fork" in its own header while doing it.
        if self.properties.is_property_set("solver"):
            set_solver(self.solver == 'FORK')

        if self.add_cloth:
            m = ob.modifiers.new("Cloth", 'CLOTH')
            m.settings.mass = self.mass_kg
            m.settings.tension_stiffness = self.tension
            m.settings.compression_stiffness = self.compression
            m.settings.shear_stiffness = self.shear
            m.settings.bending_stiffness = self.bending
            m.settings.air_damping = self.air_damping
            m.settings.quality = self.quality
            m.collision_settings.collision_quality = self.collision_quality
            m.collision_settings.distance_min = 0.35 * CM
            m.collision_settings.use_self_collision = self.self_collision
            m.collision_settings.self_distance_min = 0.2 * CM
            if self.pin_waist:
                m.settings.vertex_group_mass = "waist"

        for o in context.selected_objects:
            o.select_set(False)
        ob.select_set(True)
        context.view_layer.objects.active = ob

        # Frame what was just made. A skirt is ~1 m in a scene whose default
        # view is set up for a 2 m cube, so without this it arrives as a speck.
        for window in context.window_manager.windows:
            for area in window.screen.areas:
                if area.type != 'VIEW_3D':
                    continue
                region = next((r for r in area.regions if r.type == 'WINDOW'), None)
                with context.temp_override(window=window, area=area, region=region):
                    bpy.ops.view3d.view_selected()
                break

        self.report({'INFO'},
                    f"{len(verts)} vertices, hem {hem_cm:.0f} cm")
        return {'FINISHED'}


class SKIRT_OT_drop(bpy.types.Operator):
    """Let it fall: rewind to frame 1 and play, solving as it goes"""
    bl_idname = "skirt.drop"
    bl_label = "Drop it"

    def execute(self, context):
        scene = context.scene
        scene.frame_set(scene.frame_start)
        if not context.screen.is_animation_playing:
            bpy.ops.screen.animation_play()
        return {'FINISHED'}


class SKIRT_OT_rest(bpy.types.Operator):
    """Stop, and put the cloth back where it was cut"""
    bl_idname = "skirt.rest"
    bl_label = "Reset"

    def execute(self, context):
        if context.screen.is_animation_playing:
            bpy.ops.screen.animation_cancel(restore_frame=False)
        context.scene.frame_set(context.scene.frame_start)
        return {'FINISHED'}


class SKIRT_OT_solver_stock(bpy.types.Operator):
    """Use Blender's own cloth solver for the next drop"""
    bl_idname = "skirt.solver_stock"
    bl_label = "Stock"

    def execute(self, context):
        set_solver(False)
        self.report({'INFO'}, "stock solver on the next Reset")
        return {'FINISHED'}


class SKIRT_OT_solver_fork(bpy.types.Operator):
    """Use the forked cloth solver for the next drop"""
    bl_idname = "skirt.solver_fork"
    bl_label = "Fork"

    def execute(self, context):
        set_solver(True)
        if not running_forked_blender():
            self.report({'WARNING'}, "this is stock Blender; the fork is not in it")
        else:
            self.report({'INFO'}, "forked solver on the next Reset")
        return {'FINISHED'}


class VIEW3D_PT_circle_skirt(bpy.types.Panel):
    bl_label = "Circle Skirt"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Skirt"

    def draw(self, context):
        lay = self.layout
        lay.operator("mesh.circle_skirt_add", icon='MESH_CIRCLE')
        lay.label(text="Opens a dialog of measurements")

        lay.separator()
        row = lay.row(align=True)
        row.scale_y = 1.6
        row.operator("skirt.drop", icon='PLAY')
        row.operator("skirt.rest", icon='LOOP_BACK')

        sc = context.scene
        lay.label(text=f"Frame {sc.frame_current} of {sc.frame_end}")
        lay.prop(sc, "frame_end", text="Frames")

        lay.separator()
        box = lay.box()
        if running_forked_blender():
            box.label(text="Forked build", icon='CHECKMARK')
            asked = os.environ.get(FORK_ENV, "0") not in ("", "0")
            box.label(text=f"Next drop: {'FORK' if asked else 'stock'} solver")
            row = box.row(align=True)
            row.operator("skirt.solver_stock", depress=not asked)
            row.operator("skirt.solver_fork", depress=asked)
            box.label(text="Takes effect on Reset", icon='INFO')
        else:
            box.label(text="Stock Blender", icon='ERROR')
            box.label(text="no fork in this binary")


def menu(self, context):
    self.layout.operator("mesh.circle_skirt_add", icon='MESH_CIRCLE')


CLASSES = (MESH_OT_circle_skirt_add, SKIRT_OT_drop, SKIRT_OT_rest,
           SKIRT_OT_solver_stock, SKIRT_OT_solver_fork,
           VIEW3D_PT_circle_skirt)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    bpy.types.VIEW3D_MT_mesh_add.append(menu)


def unregister():
    bpy.types.VIEW3D_MT_mesh_add.remove(menu)
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)


if __name__ == "__main__":
    register()

    def open_sidebar(_state={"tries": 0}):
        """Open the sidebar ON the Skirt tab, and build the scene, no clicking.

        `active_panel_category` is the tab strip as a property. It is not
        writable until the region has been drawn once and knows its
        categories, so this retries rather than assuming -- the first attempt
        silently did nothing and left the sidebar on Item.

        Driving this by synthetic mouse clicks was worse in every way: slower,
        dependent on pixel positions that move with the layout, and it stole
        focus from whatever the person was doing.
        """
        _state["tries"] += 1
        done = False
        for window in bpy.context.window_manager.windows:
            for area in window.screen.areas:
                if area.type != 'VIEW_3D':
                    continue
                area.spaces.active.show_region_ui = True
                for region in area.regions:
                    if region.type != 'UI':
                        continue
                    try:
                        region.active_panel_category = "Skirt"
                        done = region.active_panel_category == "Skirt"
                    except (AttributeError, TypeError):
                        pass
                area.tag_redraw()

        if not done and _state["tries"] < 20:
            return 0.25  # not drawn yet; ask again shortly

        if os.environ.get("SEWING_SKIRT_AUTOBUILD") not in (None, "", "0"):
            if "Skirt" not in bpy.data.objects:
                for ob in list(bpy.data.objects):
                    bpy.data.objects.remove(ob)
                solver = ('FORK' if os.environ.get(FORK_ENV, "0") not in ("", "0")
                          else 'STOCK')
                bpy.ops.mesh.circle_skirt_add(solver=solver)
        return None

    if not bpy.app.background:
        bpy.app.timers.register(open_sidebar, first_interval=0.5)
