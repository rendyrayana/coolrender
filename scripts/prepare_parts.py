# Prepares an assembly model that comes as two FBX files with the same separate
# parts: one looking assembled, one hand-arranged into an exploded view.
# Run with Blender (reads the sources, never writes them):
#   Blender -b -P scripts/prepare_parts.py -- <config.json>
#
# config.json:
#   { "assembled": "Barong.fbx", "exploded": "Barong Exploded.fbx",
#     "out": "models/barong_parts.glb", "layout": "models/barong_parts.layout.json",
#     "report": "barong_report.json", "maxTris": 300000, "dryRun": false }
#
# 1. Every part stays a separate mesh (nothing is joined). Transforms are baked
#    into world space.
# 2. Each part of the assembled file is matched with a part of the exploded file:
#    by name and vertex count, then by vertex count, then by bounding box size
#    (optimal assignment over all of these).
# 3. For each pair the move from assembled to exploded is measured as a
#    similarity transform (vertex by vertex when the vertex order agrees, else
#    ICP). The exploded file is brought to the assembled scale, and, when the two
#    files do not share a frame, shifted so the part that moved least stays put.
# 4. Parts are simplified one by one (collapse decimation, so part boundaries
#    stay), and the scanned vertex colours are copied from the full-resolution
#    part to the nearest new vertex, so faces and marks stay whole.
# 5. The assembled parts are exported as GLB (names part_01, part_02, ...) with
#    vertex colours, and the per-part transforms as a layout JSON in glTF axes.
import bpy, sys, os, json, math, re
import numpy as np
from mathutils import Matrix, Vector, kdtree

cfg = json.load(open(sys.argv[sys.argv.index('--') + 1]))
MAX_TRIS = int(cfg.get('maxTris', 300_000))
rng = np.random.default_rng(3)
bpy.ops.wm.read_factory_settings(use_empty=True)


def import_parts(path, rename_prefix):
    """Import an FBX; return its meshes as separate objects with world transforms baked in."""
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    objs = [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH']
    parts = []
    for o in objs:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for i, o in enumerate(objs):
        original = o.name
        o.name = f'{rename_prefix}{i + 1:02d}'
        parts.append({'obj': o, 'source': original})
    return parts


def world_verts(o):
    co = np.empty(len(o.data.vertices) * 3)
    o.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def vertex_colors(o):
    """Per-vertex RGBA of the active colour attribute (corner colours are averaged), or None."""
    me = o.data
    attr = me.color_attributes.active_color or (me.color_attributes[0] if len(me.color_attributes) else None)
    if attr is None:
        return None
    n = len(me.vertices)
    if attr.domain == 'POINT':
        c = np.empty(n * 4)
        attr.data.foreach_get('color', c)
        return c.reshape(-1, 4)
    loops = np.empty(len(me.loops) * 4)
    attr.data.foreach_get('color', loops)
    loops = loops.reshape(-1, 4)
    vi = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get('vertex_index', vi)
    out = np.zeros((n, 4))
    cnt = np.zeros(n)
    np.add.at(out, vi, loops)
    np.add.at(cnt, vi, 1)
    return out / np.maximum(cnt, 1)[:, None]


def describe(p):
    o = p['obj']
    v = world_verts(o)
    p['v'] = v
    p['n'] = len(v)
    p['tris'] = sum(len(f.vertices) - 2 for f in o.data.polygons)
    p['min'], p['max'] = v.min(0), v.max(0)
    p['dims'] = p['max'] - p['min']
    p['center'] = v.mean(0)
    p['bbox_center'] = (p['min'] + p['max']) / 2
    p['colors'] = vertex_colors(o)


def norm_name(s):
    s = re.sub(r'\.\d{3}$', '', s)
    s = re.sub(r'(_Sep_\d+|_copy\d+)$', '', s)
    return s.lower()


# ── Assignment (Hungarian algorithm; at most a few dozen parts) ─────────────────
def hungarian(cost):
    n, m = cost.shape
    u, v, p, way = np.zeros(n + 1), np.zeros(m + 1), np.zeros(m + 1, dtype=int), np.zeros(m + 1, dtype=int)
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = np.full(m + 1, np.inf)
        used = np.zeros(m + 1, dtype=bool)
        while True:
            used[j0] = True
            i0, delta, j1 = p[j0], np.inf, 0
            for j in range(1, m + 1):
                if not used[j]:
                    cur = cost[i0 - 1, j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j], way[j] = cur, j0
                    if minv[j] < delta:
                        delta, j1 = minv[j], j
            for j in range(m + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    match = [-1] * n
    for j in range(1, m + 1):
        if p[j]:
            match[p[j] - 1] = j - 1
    return match


# ── Similarity transforms ───────────────────────────────────────────────────────
def umeyama(src, dst, scale=True):
    mu_s, mu_d = src.mean(0), dst.mean(0)
    xs, xd = src - mu_s, dst - mu_d
    u, d, vt = np.linalg.svd(xd.T @ xs / len(src))
    s_mat = np.eye(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        s_mat[2, 2] = -1
    r = u @ s_mat @ vt
    s = (d * np.diag(s_mat)).sum() / ((xs ** 2).sum() / len(src)) if scale else 1.0
    return s, r, mu_d - s * r @ mu_s


def icp_transform(src, dst, init_s):
    """Similarity ICP between two vertex sets with different vertex order; tries principal-axis starts."""
    sub_s = src[rng.choice(len(src), min(len(src), 3000), replace=False)]
    sub_d = dst[rng.choice(len(dst), min(len(dst), 20000), replace=False)]
    tree = kdtree.KDTree(len(sub_d))
    for i, q in enumerate(sub_d):
        tree.insert(q, i)
    tree.balance()

    def frame(p):
        c = p - p.mean(0)
        w, vv = np.linalg.eigh(c.T @ c / len(p))
        if np.linalg.det(vv) < 0:
            vv[:, 2] *= -1
        return vv

    fs, fd = frame(sub_s), frame(sub_d)
    best = None
    for sign in (np.eye(3), np.diag([-1, -1, 1]), np.diag([1, -1, -1]), np.diag([-1, 1, -1])):
        r0 = fd @ sign @ fs.T
        s, r, t = init_s, r0, sub_d.mean(0) - init_s * r0 @ sub_s.mean(0)
        for _ in range(30):
            moved = (s * (r @ sub_s.T)).T + t
            idx = np.array([tree.find(q)[1] for q in moved])
            dist = np.linalg.norm(moved - sub_d[idx], axis=1)
            keep = np.argsort(dist)[: int(len(dist) * 0.85)]
            s, r, t = umeyama(sub_s[keep], sub_d[idx][keep])
            s = float(np.clip(s, 0.5, 2.0))
            t = sub_d[idx][keep].mean(0) - s * r @ sub_s[keep].mean(0)
        rms = float(np.sqrt((dist[keep] ** 2).mean()))
        if best is None or rms < best[3]:
            best = (s, r, t, rms)
    return best


# ── Run ─────────────────────────────────────────────────────────────────────────
asm = import_parts(cfg['assembled'], 'part_')
for p in asm:
    describe(p)
exp = import_parts(cfg['exploded'], 'exploded_')
for p in exp:
    describe(p)

report = {'assembled_file': os.path.basename(cfg['assembled']), 'exploded_file': os.path.basename(cfg['exploded']),
          'parts_assembled': len(asm), 'parts_exploded': len(exp),
          'triangles_assembled': sum(p['tris'] for p in asm), 'triangles_exploded': sum(p['tris'] for p in exp)}
all_a, all_e = np.vstack([p['v'] for p in asm]), np.vstack([p['v'] for p in exp])
report['bbox_assembled_min'], report['bbox_assembled_max'] = all_a.min(0).round(5).tolist(), all_a.max(0).round(5).tolist()
report['bbox_exploded_min'], report['bbox_exploded_max'] = all_e.min(0).round(5).tolist(), all_e.max(0).round(5).tolist()
dims_a, dims_e = all_a.max(0) - all_a.min(0), all_e.max(0) - all_e.min(0)
report['dims_assembled'], report['dims_exploded'] = dims_a.round(5).tolist(), dims_e.round(5).tolist()

# Matching cost: vertex count, name, size.
n_a, n_e = len(asm), len(exp)
size = lambda p: float(np.cbrt(max(p['dims'].prod(), 1e-18)))
equal = [(i, j) for i in range(n_a) for j in range(n_e) if asm[i]['n'] == exp[j]['n']]
ratios = [size(exp[j]) / size(asm[i]) for i, j in equal if size(asm[i]) > 0]
scale_guess = float(np.median(ratios)) if ratios else float(np.cbrt(np.prod(dims_e) / np.prod(dims_a)))
cost = np.zeros((max(n_a, n_e), max(n_a, n_e))) + 50
for i in range(n_a):
    for j in range(n_e):
        c = 0.0 if asm[i]['n'] == exp[j]['n'] else 2.0 + abs(math.log(asm[i]['n'] / exp[j]['n']))
        c += abs(math.log(max(size(exp[j]), 1e-12) / max(size(asm[i]) * scale_guess, 1e-12)))
        if norm_name(asm[i]['source']) == norm_name(exp[j]['source']):
            c -= 0.5
        cost[i, j] = c
match = hungarian(cost)
report['matching'] = []
pairs = []
for i, j in enumerate(match):
    if j < 0 or j >= n_e:
        report['matching'].append({'part': asm[i]['obj'].name, 'source': asm[i]['source'], 'matched': None})
        continue
    a, e = asm[i], exp[j]
    how = 'name+vertex count' if (a['n'] == e['n'] and norm_name(a['source']) == norm_name(e['source'])) else \
          'vertex count' if a['n'] == e['n'] else 'bounding box size (vertex counts differ)'
    if a['n'] == e['n']:
        s, r, t = umeyama(a['v'], e['v'])
        resid = np.linalg.norm((s * (r @ a['v'].T)).T + t - e['v'], axis=1)
        method = 'vertex order'
        if resid.mean() > 0.01 * np.linalg.norm(a['dims']):
            s, r, t, rms = icp_transform(a['v'], e['v'], scale_guess)
            resid = np.array([rms])
            method = 'icp'
    else:
        s, r, t, rms = icp_transform(a['v'], e['v'], scale_guess)
        resid = np.array([rms])
        method = 'icp'
    pairs.append({'i': i, 'j': j, 's': s, 'r': r, 't': t})
    report['matching'].append({'part': a['obj'].name, 'source': a['source'], 'matched': e['source'], 'by': how,
                               'vertices': [a['n'], e['n']], 'transform_method': method,
                               'scale': round(float(s), 5), 'residual_rms': round(float(resid.mean()), 6),
                               'residual_pct_of_part_size': round(float(resid.mean() / np.linalg.norm(a['dims']) * 100), 3)})

scales = np.array([p['s'] for p in pairs])
G = float(np.median(scales))
report['scale_exploded_over_assembled'] = round(G, 5)
report['scale_spread_pct'] = round(float((scales.max() - scales.min()) / G * 100), 3)
height_axis = 2  # Blender is Z-up after import
height = float(dims_a[height_axis])

# Rigid part moves in assembled scale: e / G = R a + t / G.
for p in pairs:
    a = asm[p['i']]
    p['t_rigid'] = p['t'] / G
    p['disp'] = (p['r'] @ a['center'] + p['t_rigid']) - a['center']
disp_norm = np.array([np.linalg.norm(p['disp']) for p in pairs])
anchor = int(disp_norm.argmin())
report['shared_frame'] = {'smallest_part_move_pct_of_height': round(float(disp_norm[anchor] / height * 100), 2),
                          'smallest_move_part': asm[pairs[anchor]['i']]['obj'].name}
offset = np.zeros(3)
if disp_norm[anchor] > 0.03 * height:
    offset = pairs[anchor]['disp'].copy()
    report['shared_frame']['recentered'] = 'no part stays in place, so the exploded file was shifted by the smallest part move'
else:
    report['shared_frame']['recentered'] = 'not needed: parts share one coordinate frame'
for p in pairs:
    p['t_rigid'] = p['t_rigid'] - offset
    p['disp'] = p['disp'] - offset
report['shift_applied'] = offset.round(6).tolist()

# Bounding boxes of the exploded layout, in the assembled frame.
exploded_pts = np.vstack([(p['r'] @ asm[p['i']]['v'].T).T + p['t_rigid'] for p in pairs])
report['bbox_exploded_in_assembled_frame_min'] = exploded_pts.min(0).round(5).tolist()
report['bbox_exploded_in_assembled_frame_max'] = exploded_pts.max(0).round(5).tolist()
report['explode_height_ratio'] = round(float((exploded_pts.max(0)[2] - exploded_pts.min(0)[2]) / height), 3)
report['all_parts_matched'] = len(pairs) == n_a == n_e
report['max_residual_pct_of_part_size'] = max(m.get('residual_pct_of_part_size', 0) for m in report['matching'])

if cfg.get('dryRun'):
    json.dump(report, open(cfg['report'], 'w'), indent=2)
    print('REPORT_JSON ' + json.dumps(report))
    sys.exit(0)

# ── Simplify per part, keep vertex colours ──────────────────────────────────────
for p in exp:
    bpy.data.objects.remove(p['obj'], do_unlink=True)
total = sum(p['tris'] for p in asm)
ratio = min(1.0, MAX_TRIS / total * 0.99)
kept = 0
for p in asm:
    o = p['obj']
    if ratio < 1.0:
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    new_v = world_verts(o)
    if p['colors'] is not None:
        tree = kdtree.KDTree(p['n'])
        for i, q in enumerate(p['v']):
            tree.insert(q, i)
        tree.balance()
        idx = np.array([tree.find(q)[1] for q in new_v])
        col = p['colors'][idx]
        for name in [a.name for a in o.data.color_attributes]:
            o.data.color_attributes.remove(o.data.color_attributes[name])
        attr = o.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        attr.data.foreach_set('color', col.reshape(-1))
        o.data.color_attributes.active_color = attr
    p['tris_after'] = sum(len(f.vertices) - 2 for f in o.data.polygons)
    kept += p['tris_after']
report['triangles_after'] = kept
report['simplified_ratio'] = round(ratio, 4)

mat = bpy.data.materials.new('scan')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = 0.9
colnode = mat.node_tree.nodes.new('ShaderNodeVertexColor')
colnode.layer_name = 'Col'
mat.node_tree.links.new(colnode.outputs['Color'], bsdf.inputs['Base Color'])
for p in asm:
    p['obj'].data.materials.clear()
    p['obj'].data.materials.append(mat)

bpy.ops.object.select_all(action='DESELECT')
for p in asm:
    p['obj'].select_set(True)
bpy.context.view_layer.objects.active = asm[0]['obj']
bpy.ops.export_scene.gltf(filepath=cfg['out'], export_format='GLB', use_selection=True, export_vertex_color='ACTIVE')
report['glb_mb'] = round(os.path.getsize(cfg['out']) / 1e6, 1)

# Layout in glTF axes: (x, y, z) in Blender becomes (x, z, -y).
C = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
layout = {'coolrender': 'explode-layout', 'version': 1, 'frame': 'gltf-y-up, assembled scale',
          'parts': [], 'note': 'matrix maps each assembled part to its hand-arranged exploded position'}
for p in pairs:
    m = Matrix.Translation(Vector(p['t_rigid'])) @ Matrix(p['r'].tolist()).to_4x4()
    mg = C @ m @ C.inverted()
    layout['parts'].append({'name': asm[p['i']]['obj'].name, 'source': asm[p['i']]['source'],
                            'matrix': [round(x, 8) for row in mg for x in row]})
json.dump(layout, open(cfg['layout'], 'w'), indent=1)
json.dump(report, open(cfg['report'], 'w'), indent=2)
print('REPORT_JSON ' + json.dumps(report))
