# Converts a single-mesh ASCII FBX (e.g. from scanner software) to OBJ, keeping
# vertices, faces and UVs. Blender can't import ASCII FBX; it can import the OBJ.
#   python3 scripts/fbx_ascii_to_obj.py <in.fbx> <out.obj>
# Streams the file, so very large exports (hundreds of MB) are fine.
import re
import sys

src, out = sys.argv[1], sys.argv[2]
wanted = {'Vertices', 'PolygonVertexIndex', 'UV', 'UVIndex'}
arrays, current, buf = {}, None, []

with open(src, 'r', errors='replace') as f:
    for line in f:
        s = line.strip()
        if current is None:
            m = re.match(r'(\w+): \*\d+ \{', s)
            if m and m.group(1) in wanted and m.group(1) not in arrays:
                current, buf = m.group(1), []
            continue
        if s.startswith('}'):
            text = ''.join(buf)
            arrays[current] = text[text.index(':') + 1:].replace('\n', '').split(',')
            current = None
        else:
            buf.append(s)

v = [float(x) for x in arrays['Vertices']]
idx = [int(x) for x in arrays['PolygonVertexIndex']]
uv = [float(x) for x in arrays.get('UV', [])]
uvi = [int(x) for x in arrays.get('UVIndex', [])]

with open(out, 'w') as o:
    o.write('# converted from ASCII FBX by coolrender\n')
    for i in range(0, len(v), 3):
        o.write(f'v {v[i]} {v[i + 1]} {v[i + 2]}\n')
    for i in range(0, len(uv), 2):
        o.write(f'vt {uv[i]} {uv[i + 1]}\n')
    face, corner = [], 0
    faces = 0
    for k in idx:
        last = k < 0
        vi = (~k if last else k) + 1
        face.append(f'{vi}/{uvi[corner] + 1}' if uvi else f'{vi}')
        corner += 1
        if last:
            o.write('f ' + ' '.join(face) + '\n')
            faces += 1
            face = []
print(f'{out}: {len(v) // 3} vertices, {len(uv) // 2} uvs, {faces} faces')
