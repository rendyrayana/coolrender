# Aligns rescans of one object to their own raw scan and measures how far each
# rescan drifts from it. Run with Blender (reads the sources, never writes them):
#   Blender -b -P scripts/align_scans.py -- <config.json>
#
# config.json:
#   { "raw": "LRAW.fbx", "rescans": ["L1.fbx", "L2.fbx"],
#     "out": { "raw": "models/lidar_raw.glb", "rescans": ["models/lidar_r1.glb", "models/lidar_r2.glb"] },
#     "report": "lidar_report.json", "maxTris": 300000, "maxTexture": 4096 }
#
# For each rescan:
#   1. Bake all object transforms, so the mesh is in world metres (the FBX
#      importer converts centimetres).
#   2. Simplify to maxTris (Blender collapse decimation, keeps UVs).
#   3. Find the similarity transform (scale, rotation, translation) onto the raw
#      with trimmed ICP. Starting poses come from the principal axes, upright
#      yaw steps and random rotations; the best coarse fit is refined.
#   4. Measure the distance from every rescan vertex to the raw surface
#      (full-resolution raw), in millimetres, and store it in the GLB as the
#      custom vertex attribute _deviation. The report holds mean, 95th percentile
#      and max, the transform and the symmetric Hausdorff distance.
# Raw and rescans are exported in one shared frame, so they overlay exactly.
import bpy, sys, os, json, math, tempfile
import numpy as np
from mathutils import Matrix, Vector, kdtree
from mathutils.bvhtree import BVHTree

cfg = json.load(open(sys.argv[sys.argv.index('--') + 1]))
MAX_TRIS = int(cfg.get('maxTris', 300_000))
MAX_TEX = int(cfg.get('maxTexture', 4096))
rng = np.random.default_rng(7)

bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    # FBX files often hang the mesh under a scaled parent (cm to m); bake that in too.
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def verts(o):
    co = np.empty(len(o.data.vertices) * 3)
    o.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def set_verts(o, co):
    o.data.vertices.foreach_set('co', co.reshape(-1))
    o.data.update()


def simplify(o, max_tris):
    n = tri_count(o)
    if n <= max_tris:
        return n, n
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new('decimate', 'DECIMATE')
    mod.ratio = max_tris / n * 0.98
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return n, tri_count(o)


def image_report(o):
    out = []
    for m in o.data.materials:
        if m and m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    out.append({'name': n.image.name, 'size': list(n.image.size), 'missing': n.image.size[0] == 0})
    return out


def fix_materials(o):
    """Textures that could not be found become a plain light-grey material (clay)."""
    if any(i['missing'] for i in image_report(o)):
        mat = bpy.data.materials.new('clay')
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (0.85, 0.84, 0.82, 1)
        bsdf.inputs['Roughness'].default_value = 0.9
        o.data.materials.clear()
        o.data.materials.append(mat)
        return 'no texture found in the FBX: exported as plain clay material'
    return None


def shrink_images():
    for img in bpy.data.images:
        if img.size[0] and max(img.size) > MAX_TEX:
            s = MAX_TEX / max(img.size)
            img.scale(int(img.size[0] * s), int(img.size[1] * s))


# ── Similarity transform: trimmed ICP ───────────────────────────────────────────
def umeyama(src, dst, scale=True):
    mu_s, mu_d = src.mean(0), dst.mean(0)
    xs, xd = src - mu_s, dst - mu_d
    u, d, vt = np.linalg.svd(xd.T @ xs / len(src))
    s_mat = np.eye(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        s_mat[2, 2] = -1
    r = u @ s_mat @ vt
    s = (d * np.diag(s_mat)).sum() / ((xs ** 2).sum() / len(src)) if scale else 1.0
    t = mu_d - s * r @ mu_s
    return s, r, t


def build_tree(pts):
    tree = kdtree.KDTree(len(pts))
    for i, p in enumerate(pts):
        tree.insert(p, i)
    tree.balance()
    return tree


def nearest(tree, pts, q):
    idx = np.empty(len(q), dtype=np.int64)
    dist = np.empty(len(q))
    for i, p in enumerate(q):
        _, j, dd = tree.find(p)
        idx[i], dist[i] = j, dd
    return pts[idx], dist


def icp(src, tree, dst_pts, s, r, t, iters, trim=0.9, scale=True):
    rms = math.inf
    for _ in range(iters):
        moved = (s * (r @ src.T)).T + t
        match, dist = nearest(tree, dst_pts, moved)
        keep = np.argsort(dist)[: max(10, int(len(dist) * trim))]
        ds, dr, dt = umeyama(src[keep], match[keep], scale)
        ds = float(np.clip(ds, 0.6, 1.6))
        s, r, t = ds, dr, match[keep].mean(0) - ds * dr @ src[keep].mean(0)
        new = float(np.sqrt((dist[keep] ** 2).mean()))
        if abs(rms - new) < 1e-9:
            rms = new
            break
        rms = new
    return s, r, t, rms


def rot_axis(axis, deg):
    return np.array(Matrix.Rotation(math.radians(deg), 3, Vector(axis)))


def random_rotation():  # uniform random rotation from a random quaternion
    w, x, y, z = (lambda v: v / np.linalg.norm(v))(rng.normal(size=4))
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def pca_frame(p):
    c = p - p.mean(0)
    w, v = np.linalg.eigh(c.T @ c / len(p))
    if np.linalg.det(v) < 0:
        v[:, 2] *= -1
    return v  # columns: smallest to largest extent


def register(rescan_pts, raw_pts):
    """Similarity transform (s, R, t) with raw ~ s R rescan + t, best of many starting poses."""
    raw_sub = raw_pts[rng.choice(len(raw_pts), min(len(raw_pts), 80_000), replace=False)]
    tree = build_tree(raw_sub)
    coarse_src = rescan_pts[rng.choice(len(rescan_pts), min(len(rescan_pts), 1500), replace=False)]
    cs, cd = coarse_src.mean(0), raw_pts.mean(0)
    rms_s = np.sqrt(((rescan_pts - rescan_pts.mean(0)) ** 2).sum(1).mean())
    rms_d = np.sqrt(((raw_pts - cd) ** 2).sum(1).mean())
    s0 = rms_d / rms_s
    a_r, a_q = pca_frame(rescan_pts), pca_frame(raw_pts)

    starts = [np.eye(3)]
    for yaw in range(0, 360, 15):                       # upright, any heading
        for flip in (np.eye(3), rot_axis((1, 0, 0), 180)):
            starts.append(rot_axis((0, 0, 1), yaw) @ flip)
    for sign in (np.eye(3), np.diag([-1, -1, 1]), np.diag([1, -1, -1]), np.diag([-1, 1, -1])):  # principal axes
        for yaw in range(0, 360, 30):
            starts.append(a_q @ rot_axis((0, 0, 1), yaw) @ sign @ a_r.T)
    starts += [random_rotation() for _ in range(80)]

    best = None
    for r0 in starts:
        s, r, t = s0, r0, cd - s0 * r0 @ cs
        s, r, t, rms = icp(coarse_src, tree, raw_sub, s, r, t, 8, trim=0.8)
        if best is None or rms < best[3]:
            best = (s, r, t, rms)
    s, r, t, _ = best
    fine_src = rescan_pts[rng.choice(len(rescan_pts), min(len(rescan_pts), 20_000), replace=False)]
    s, r, t, rms = icp(fine_src, tree, raw_sub, s, r, t, 60, trim=0.9)
    return s, r, t, rms, len(starts)


def stats(d_mm, diag_mm):
    return {'mean_mm': float(d_mm.mean()), 'median_mm': float(np.median(d_mm)), 'p95_mm': float(np.percentile(d_mm, 95)),
            'p98_mm': float(np.percentile(d_mm, 98)), 'p99_mm': float(np.percentile(d_mm, 99)), 'max_mm': float(d_mm.max()),
            'rms_mm': float(np.sqrt((d_mm ** 2).mean())),
            'mean_pct_of_diagonal': float(d_mm.mean() / diag_mm * 100), 'p95_pct_of_diagonal': float(np.percentile(d_mm, 95) / diag_mm * 100),
            'max_pct_of_diagonal': float(d_mm.max() / diag_mm * 100)}


def export(o, path):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_image_format='JPEG',
                              export_jpeg_quality=90, export_attributes=True, export_apply=False)
    return os.path.getsize(path) / 1e6


# ── Run ─────────────────────────────────────────────────────────────────────────
report = {'units': 'FBX centimetres converted to metres by the importer; deviations in millimetres', 'maxTris': MAX_TRIS}
raw = import_fbx(cfg['raw'])
raw_full = raw.copy()
raw_full.data = raw.data.copy()
bpy.context.scene.collection.objects.link(raw_full)
raw_full.hide_set(True)
raw_pts = verts(raw_full)
bbox = raw_pts.max(0) - raw_pts.min(0)
diag_mm = float(np.linalg.norm(bbox) * 1000)
report['raw'] = {'file': os.path.basename(cfg['raw']), 'bbox_mm': (bbox * 1000).round(2).tolist(), 'diagonal_mm': round(diag_mm, 2),
                 'images': image_report(raw)}
note = fix_materials(raw)
before, after = simplify(raw, MAX_TRIS)
report['raw'].update({'triangles_before': before, 'triangles_after': after, 'note': note})
shrink_images()
report['raw']['glb_mb'] = round(export(raw, cfg['out']['raw']), 1)

depsgraph = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(raw_full, depsgraph)
raw_kd_pts = raw_pts[rng.choice(len(raw_pts), min(len(raw_pts), 100_000), replace=False)]

report['rescans'] = []
for path, out in zip(cfg['rescans'], cfg['out']['rescans']):
    o = import_fbx(path)
    entry = {'file': os.path.basename(path), 'images': image_report(o)}
    entry['note'] = fix_materials(o)
    entry['triangles_before'], entry['triangles_after'] = simplify(o, MAX_TRIS)
    p = verts(o)
    s, r, t, rms, n_starts = register(p, raw_pts)
    aligned = (s * (r @ p.T)).T + t
    set_verts(o, aligned)
    euler = Matrix(r.tolist()).to_euler('XYZ')
    m4 = np.eye(4)
    m4[:3, :3] = s * r
    m4[:3, 3] = t
    entry['alignment'] = {'scale': round(float(s), 5), 'rotation_euler_xyz_deg': [round(math.degrees(a), 3) for a in euler],
                          'translation_m': t.round(6).tolist(), 'matrix_row_major': m4.round(7).tolist(),
                          'trimmed_icp_rms_mm': round(rms * 1000, 3), 'starting_poses_tried': n_starts}
    # Distance from every rescan vertex to the raw surface, in millimetres.
    dist = np.array([bvh.find_nearest(Vector(v))[3] for v in aligned]) * 1000
    entry['deviation_rescan_to_raw'] = stats(dist, diag_mm)
    # Symmetric Hausdorff: also raw -> rescan (sampled).
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh_rescan = BVHTree.FromObject(o, depsgraph)
    back = np.array([bvh_rescan.find_nearest(Vector(v))[3] for v in raw_kd_pts]) * 1000
    entry['hausdorff_symmetric_mm'] = float(max(dist.max(), back.max()))
    entry['deviation_raw_to_rescan_max_mm'] = float(back.max())
    o.data.attributes.new('_deviation', 'FLOAT', 'POINT').data.foreach_set('value', dist)
    shrink_images()
    entry['glb_mb'] = round(export(o, out), 1)
    report['rescans'].append(entry)

json.dump(report, open(cfg['report'], 'w'), indent=2)
print('REPORT_JSON ' + json.dumps(report))
