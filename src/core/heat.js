import * as THREE from 'three';
import { parseScalarCsv } from './scalar.js';

// Attaches per-vertex values (e.g. Hausdorff distances from a CSV) to a model
// as the `aHeat` attribute, which survives orientation fixes and simplifying.
// OBJ: values follow the file's `v` lines and are matched by position, because
// the loader splits and reorders vertices. Other formats: one value per vertex,
// in the mesh's own order. Returns how many vertices got a value.
export function attachHeat(model, text) {
  const values = parseScalarCsv(text);
  const meshes = model.children.filter(c => c.isMesh);
  const src = model.userData.sourcePositions;
  const total = meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
  let matched = 0;

  if (src && values.length === src.length / 3) {
    const size = model.userData.height + model.userData.radius;
    const q = 1e4 / size;
    const key = (x, y, z) => `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    const lookup = new Map();
    const p = new THREE.Vector3();
    for (let i = 0; i < values.length; i++) {
      p.fromArray(src, i * 3).applyMatrix4(model.userData.transform);
      lookup.set(key(p.x, p.y, p.z), values[i]);
    }
    for (const mesh of meshes) {
      const pos = mesh.geometry.attributes.position;
      const out = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const x = Math.round(pos.getX(i) * q), y = Math.round(pos.getY(i) * q), z = Math.round(pos.getZ(i) * q);
        let v = lookup.get(`${x},${y},${z}`);
        // Float rounding can land a vertex in the next cell; check the neighbours.
        for (let n = 0; v === undefined && n < 27; n++) v = lookup.get(`${x + (n % 3) - 1},${y + (((n / 3) | 0) % 3) - 1},${z + ((n / 9) | 0) - 1}`);
        if (v !== undefined) { out[i] = v; matched++; }
      }
      mesh.geometry.setAttribute('aHeat', new THREE.BufferAttribute(out, 1));
    }
  } else if (meshes.length === 1 && values.length === total) {
    meshes[0].geometry.setAttribute('aHeat', new THREE.BufferAttribute(Float32Array.from(values), 1));
    matched = total;
  }
  if (matched) model.userData.cache = {};
  return { matched, total, values: values.length };
}
