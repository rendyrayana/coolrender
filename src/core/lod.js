import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';

// lowPoly() is synchronous; the app awaits this once at start-up.
export const lodReady = MeshoptSimplifier.ready;

// Simplified copies of a model's meshes with about `tris` triangles in total.
// Vertices are welded by position (UVs dropped) so UV seams can't stop the
// simplifier or open holes; use these with untextured materials. Cached.
export function lowPoly(model, tris) {
  const cache = (model.userData.cache ??= {});
  const key = `lod${tris}`;
  if (cache[key]) return cache[key];
  const meshes = model.children.filter(c => c.isMesh);
  const total = meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
  const out = meshes.map(m => {
    let geo = new THREE.BufferGeometry().setAttribute('position', m.geometry.attributes.position.clone());
    if (m.geometry.index) geo.setIndex(m.geometry.index.clone());
    geo = mergeVertices(geo, 1e-5);
    const pos = geo.attributes.position;
    const positions = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) positions.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3);
    const indices = new Uint32Array(geo.index.array);
    const target = Math.max(3, Math.floor((indices.length / 3) * Math.min(1, tris / total)) * 3);
    let [idx] = MeshoptSimplifier.simplify(indices, positions, 3, target, 1.0);
    if (idx.length > target * 1.5) [idx] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, 1.0);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo = geo.toNonIndexed(); // flat facets, so the drop in detail is visible
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, m.material);
  });
  return (cache[key] = out);
}
