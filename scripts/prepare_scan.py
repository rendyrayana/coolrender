# Prepares a scan for coolrender with Blender (reads the source, never writes it):
#   Blender -b -P scripts/prepare_scan.py -- <in.fbx|glb|obj> <out.glb> [texture.png] [max_tris] [max_texture]
# Joins all meshes, applies the texture if given, simplifies to max_tris
# (default 300k), shrinks textures to max_texture px (default 4096, JPEG)
# and exports a GLB with the texture embedded. Prints a short report.
#
# Optional clean-up, set as environment variables:
#   ALIGN=1          stand the scan up along its longest axis
#   TRIM_BOTTOM=0.02 delete the lowest 2% of the height (scanner floor fused to the base)
#   MIN_PIECE=0.01   drop loose pieces smaller than 1% of the faces
# Example:  ALIGN=1 MIN_PIECE=0.01 Blender -b -P scripts/prepare_scan.py -- scan.obj scan.glb scan.jpg
import bpy, bmesh, sys, os, tempfile
import numpy as np

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
tex = args[2] if len(args) > 2 and args[2] not in ('', '-') else None
max_tris = int(args[3]) if len(args) > 3 else 300_000
max_tex = int(args[4]) if len(args) > 4 else 4096

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(src)[1].lower()
if ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=src)
elif ext in ('.glb', '.gltf'):
    bpy.ops.import_scene.gltf(filepath=src)
elif ext == '.obj':
    bpy.ops.wm.obj_import(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

# ALIGN: uses the principal axis, for tall objects scanned at a tilt or lying
# down. Head and feet may still be swapped; the shot list can fix that ("tip": 180).
if os.environ.get('ALIGN'):
    import mathutils
    pts = np.array([v.co[:] for v in obj.data.vertices])
    pts -= pts.mean(axis=0)
    w, vecs = np.linalg.eigh(np.cov(pts.T))
    axis = mathutils.Vector(vecs[:, np.argmax(w)])
    if axis.z < 0:
        axis = -axis
    rot = axis.rotation_difference(mathutils.Vector((0, 0, 1))).to_matrix().to_4x4()
    obj.data.transform(rot)
    print(f'REPORT_EXTRA aligned long axis {tuple(round(a, 3) for a in axis)} to up')

# Runs after ALIGN. Pieces are found on position-welded vertices.
def cleanup():
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6 * max(obj.dimensions))
    trim = float(os.environ.get('TRIM_BOTTOM', 0))
    if trim:
        zs = [v.co.z for v in bm.verts]
        cut = min(zs) + (max(zs) - min(zs)) * trim
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.co.z < cut for v in f.verts)], context='FACES')
    min_piece = float(os.environ.get('MIN_PIECE', 0))
    if min_piece:
        bm.faces.ensure_lookup_table()
        seen, pieces = set(), []
        for f in bm.faces:
            if f in seen:
                continue
            stack, part = [f], []
            seen.add(f)
            while stack:
                cur = stack.pop()
                part.append(cur)
                for e in cur.edges:
                    for nb in e.link_faces:
                        if nb not in seen:
                            seen.add(nb)
                            stack.append(nb)
            pieces.append(part)
        total = len(bm.faces)
        drop = [f for p in pieces if len(p) < total * min_piece for f in p]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        print(f'REPORT_EXTRA pieces {len(pieces)}, dropped {sum(1 for p in pieces if len(p) < total * min_piece)} small ones ({len(drop)} faces)')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()

if os.environ.get('TRIM_BOTTOM') or os.environ.get('MIN_PIECE'):
    cleanup()

def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

before = tri_count(obj)

if tex:
    img = bpy.data.images.load(tex)
    mat = bpy.data.materials.new('scan')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = img
    mat.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    obj.data.materials.clear()
    obj.data.materials.append(mat)

if before > max_tris:
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.ratio = max_tris / before * 0.98
    bpy.ops.object.modifier_apply(modifier=mod.name)
after = tri_count(obj)

# Shrink every texture to max_tex and store it as JPEG.
tmp = tempfile.mkdtemp()
for img in bpy.data.images:
    if img.size[0] == 0:
        continue
    w, h = img.size
    if max(w, h) > max_tex:
        s = max_tex / max(w, h)
        img.scale(int(w * s), int(h * s))
    path = os.path.join(tmp, f'{img.name}.jpg')
    img.filepath_raw = path
    img.file_format = 'JPEG'
    bpy.context.scene.render.image_settings.quality = 90
    img.save()

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_image_format='JPEG', export_jpeg_quality=90, export_apply=True)

bm = bmesh.new()
bm.from_mesh(obj.data)
border = sum(1 for e in bm.edges if e.is_boundary)  # open edges = hole rims and outer border
bm.free()
dims = obj.dimensions
print(f'REPORT_EXTRA boundary_edges {border}')
print(f'REPORT tris {before} -> {after}; textures {[(i.name, tuple(i.size)) for i in bpy.data.images if i.size[0]]}; '
      f'size {dims.x:.3f} x {dims.y:.3f} x {dims.z:.3f}; out {os.path.getsize(out) / 1e6:.1f} MB')
