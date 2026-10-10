#!/usr/bin/env python3
"""Extract a bodice-region torso mesh from the MakeHuman CC0 base mesh.

    python3 tools/prep_bodice.py [in.obj] [out.obj]

The base mesh has ~139 groups but only `body` is skin; the rest are helper
proxies (skirt, tights, hair, teeth) and joint marker cubes sitting near the
axis, which is why they must be excluded before measuring anything. Units are
decimetres, y up, figure centred on the origin.

Output: centimetres, y = 0 at the natural waist, arms and head removed.
"""
import sys, math

SRC = sys.argv[1] if len(sys.argv) > 1 else 'app/models/makehuman-base.obj'
DST = sys.argv[2] if len(sys.argv) > 2 else 'app/models/bodice.obj'
SCALE = 10.0            # decimetres -> centimetres
BAND_BELOW = 22.0       # cm kept below the waist (to the high hip)
ARM_CUT = 19.0           # |x| beyond this is arm, not trunk


def hull(pts):
    """Monotone chain convex hull of 2D points."""
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts
    def half(ps):
        out = []
        for p in ps:
            while len(out) >= 2:
                (x1, y1), (x2, y2) = out[-2], out[-1]
                if (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1) > 0:
                    break
                out.pop()
            out.append(p)
        return out
    return half(pts)[:-1] + half(pts[::-1])[:-1]


def hull_area_perim(pts):
    h = hull(pts)
    if len(h) < 3:
        return 0.0, 0.0
    a = p = 0.0
    for i in range(len(h)):
        x1, y1 = h[i]; x2, y2 = h[(i + 1) % len(h)]
        a += x1 * y2 - x2 * y1
        p += math.hypot(x2 - x1, y2 - y1)
    return abs(a) / 2, p


# ---------------------------------------------------------------- parse
verts, faces, group = [], [], None
for line in open(SRC):
    if line.startswith('v '):
        q = line.split()
        verts.append([float(q[1]) * SCALE, float(q[2]) * SCALE, float(q[3]) * SCALE])
    elif line.startswith('g '):
        group = line.split(None, 1)[1].strip()
    elif line.startswith('f ') and group == 'body':
        idx = [int(t.split('/')[0]) - 1 for t in line.split()[1:]]
        for k in range(1, len(idx) - 1):
            faces.append((idx[0], idx[k], idx[k + 1]))

skin = sorted({i for f in faces for i in f})
print(f'body group: {len(faces)} triangles over {len(skin)} skin vertices')

# ------------------------------------------------- landmarks from the skin only
slices = {}
for i in skin:
    v = verts[i]
    if abs(v[0]) > ARM_CUT:
        continue
    slices.setdefault(int(round(v[1])), []).append((v[0], v[2]))

measured = {}
for y, pts in slices.items():
    if len(pts) < 24:
        continue
    a, p = hull_area_perim(pts)
    measured[y] = (a, p, max(abs(x) for x, _ in pts))

band = [y for y in measured if 10 <= y <= 40]
waist_y = min(band, key=lambda y: measured[y][0])
bust_y = max((y for y in measured if waist_y + 8 <= y <= waist_y + 26),
             key=lambda y: measured[y][1])
# base of neck: first slice above the bust where the trunk narrows sharply
neck_y = None
for y in sorted(y for y in measured if y > bust_y):
    if measured[y][2] < 9.0:
        neck_y = y
        break
neck_y = neck_y or bust_y + 30
print(f'waist y={waist_y}  girth={measured[waist_y][1]:.1f} cm   (hull perimeter)')
print(f'bust  y={bust_y}  girth={measured[bust_y][1]:.1f} cm')
print(f'neck base y={neck_y}  -> keeping {neck_y - waist_y} cm above the waist')

band_above = neck_y - waist_y - 1

# --------------------------------------------------------------- crop + shift
remap, keep_v = {}, []
for i in skin:
    x, y, z = verts[i]
    yy = y - waist_y
    if -BAND_BELOW <= yy <= band_above and abs(x) <= ARM_CUT:
        remap[i] = len(keep_v)
        keep_v.append((x, yy, z))
keep_f = [tuple(remap[i] for i in f) for f in faces if all(i in remap for i in f)]
print(f'bodice band: {len(keep_v)} vertices, {len(keep_f)} triangles')
xs = [v[0] for v in keep_v]; ys = [v[1] for v in keep_v]; zs = [v[2] for v in keep_v]
print(f'bbox x[{min(xs):.1f},{max(xs):.1f}] y[{min(ys):.1f},{max(ys):.1f}] z[{min(zs):.1f},{max(zs):.1f}] cm')

with open(DST, 'w') as f:
    f.write('# Bodice region extracted from the MakeHuman base mesh.\n'
            '# Source: makehumancommunity/makehuman  data/3dobjs/base.obj\n'
            '# Licence: CC0, explicitly released September 2020.\n'
            '# Units: centimetres, y up, y = 0 at the natural waist.\n'
            f'# waist girth {measured[waist_y][1]:.1f} cm, bust girth {measured[bust_y][1]:.1f} cm,'
            f' bust at y = +{bust_y - waist_y} cm.\n')
    for v in keep_v:
        f.write(f'v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n')
    f.write('g bodice\n')
    for a, b, c in keep_f:
        f.write(f'f {a+1} {b+1} {c+1}\n')
print('wrote', DST)
