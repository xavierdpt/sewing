"""Drape a garment on a body using Blender's cloth solver.

Run by `drape_server.py`, and standalone for debugging:

    blender --background --factory-startup --python sim/blender_drape.py -- job.json out.json

Why this exists, in one paragraph. The in-repo solver (app/js/cloth.js) resolves
contact as a POINT QUERY PER VERTEX against a signed distance field. It keeps
every vertex outside the body and says nothing about the triangle between them,
so a facet spanning a convex bulge dips below it -- measured on a half-sewn
skirt, 40 edge midpoints up to 0.42 cm inside the body with every vertex
correctly outside, and about a centimetre on a draped disc. Sampling more
points on the cloth narrows that without bounding it. Blender does the real
thing: triangle-against-triangle closest point, a BVH broad phase, a collision
epsilon on BOTH surfaces, and a response distributed over the three vertices by
the barycentric coordinates of the actual contact point
(source/blender/blenkernel/intern/collision.cc, `cloth_collision`). It also has
edge-edge self-collision, which this project's own docs/11-cloth.md lists as a
known gap.

UNITS. Everything in this project is centimetres; Blender's physics is metres
with g = 9.81 m/s^2. Feeding centimetres straight in would simulate a garment
thirty metres tall in Earth gravity, which falls like treacle. So the mesh is
scaled by 1/100 on the way in and back by 100 on the way out, and every length
in the job (thickness, margins) goes through the same conversion.
"""

import json
import sys

import bpy
import bmesh  # noqa: F401  (imported for availability inside Blender)

CM = 0.01  # one centimetre, in Blender metres


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_object(name, verts, tris):
    """A Blender object from arrays of cm-space vertices and triangle indices."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([(v[0] * CM, v[1] * CM, v[2] * CM) for v in verts], [], tris)
    me.validate(verbose=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def add_body(verts, tris, thickness_cm):
    ob = mesh_object("body", verts, tris)
    col = ob.modifiers.new("Collision", 'COLLISION')
    s = col.settings
    # The collider's own epsilon. Blender adds this to the cloth's, so the two
    # surfaces are kept (cloth thickness + body thickness) apart -- which is why
    # the cloth does not need the body mesh to be dense to stay outside it.
    s.thickness_outer = max(0.001, thickness_cm * CM)
    s.thickness_inner = 0.001
    s.cloth_friction = 5.0
    return ob


def add_cloth(verts, tris, pinned, opts):
    ob = mesh_object("garment", verts, tris)

    if pinned:
        vg = ob.vertex_groups.new(name="pinned")
        vg.add(list(pinned), 1.0, 'REPLACE')

    m = ob.modifiers.new("Cloth", 'CLOTH')
    s = m.settings
    c = m.collision_settings

    s.quality = int(opts.get("quality", 10))
    # Blender's `mass` is PER VERTEX, in kg. The project knows areal density in
    # g/m^2, so the honest conversion is total weight over the vertex count.
    s.mass = float(opts["vertexMassKg"])
    s.tension_stiffness = float(opts.get("tension", 15.0))
    s.compression_stiffness = float(opts.get("compression", 15.0))
    s.shear_stiffness = float(opts.get("shear", 5.0))
    s.bending_stiffness = float(opts.get("bending", 0.5))
    s.air_damping = float(opts.get("airDamping", 1.0))
    s.tension_damping = float(opts.get("damping", 5.0))
    s.compression_damping = float(opts.get("damping", 5.0))
    s.shear_damping = float(opts.get("damping", 5.0))
    if pinned:
        s.vertex_group_mass = "pinned"
        s.pin_stiffness = float(opts.get("pinStiffness", 1.0))

    c.use_collision = True
    c.collision_quality = int(opts.get("collisionQuality", 5))
    c.distance_min = max(0.001, float(opts["clothThicknessCm"]) * CM)
    c.use_self_collision = bool(opts.get("selfCollision", True))
    c.self_distance_min = max(0.001, float(opts.get("selfDistanceCm", 0.2)) * CM)
    c.self_friction = 5.0
    return ob


def bake(ob, frames):
    """Step the scene and read the evaluated cloth back, in centimetres."""
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = frames
    dg = bpy.context.evaluated_depsgraph_get()
    for f in range(1, frames + 1):
        scene.frame_set(f)
        dg.update()
    evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = evaluated.to_mesh()
    out = [[v.co.x / CM, v.co.y / CM, v.co.z / CM] for v in me.vertices]
    evaluated.to_mesh_clear()
    return out


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    job = json.load(open(argv[0]))
    out_path = argv[1]

    clear()
    scene = bpy.context.scene
    scene.render.fps = int(job.get("fps", 30))
    scene.gravity = (0.0, 0.0, -9.81 if job.get("gravity", True) else 0.0)

    add_body(job["body"]["verts"], job["body"]["tris"],
             job.get("bodyThicknessCm", 0.2))
    cloth = add_cloth(job["garment"]["verts"], job["garment"]["tris"],
                      job.get("pinned", []), job["cloth"])

    frames = int(job.get("frames", 60))
    verts = bake(cloth, frames)

    json.dump({"verts": verts, "frames": frames}, open(out_path, "w"))
    print(f"DRAPE OK {len(verts)} vertices, {frames} frames")


main()
