import * as THREE from 'three';

// Splits a model into parts for explode / assembly animations.
// 1. A model made of several meshes uses them as the parts.
// 2. A single mesh is split into its connected pieces (loose parts of a scan).
// 3. If that gives one piece, or hundreds of crumbs, it is cut into 8 blocks.
// Each part carries userData.center (its centre in model space).
export function splitParts(model) {
  const cache = (model.userData.cache ??= {});
  if (cache.parts) return cache.parts;
  const meshes = model.children.filter(c => c.isMesh);
  let parts;
  if (meshes.length > 1) parts = meshes.map(m => new THREE.Mesh(m.geometry, m.material));
  else if (meshes.length === 1) {
    parts = byComponents(meshes[0]);
    if (parts.length < 2 || parts.length > 64) parts = byOctants(meshes[0], model.userData.height);
  } else parts = [];
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    p.userData.center = p.geometry.boundingBox.getCenter(new THREE.Vector3());
  }
  return (cache.parts = parts);
}

function triangles(geo) {
  return geo.index ? geo.index.array : Uint32Array.from({ length: geo.attributes.position.count }, (_, i) => i);
}

// Connected pieces, with vertices welded by position so UV seams don't split pieces.
function byComponents(mesh) {
  const geo = mesh.geometry, pos = geo.attributes.position, idx = triangles(geo);
  const weld = new Map(), id = new Uint32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    if (!weld.has(key)) weld.set(key, weld.size);
    id[i] = weld.get(key);
  }
  const parent = new Uint32Array(weld.size).map((_, i) => i);
  const find = x => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(id[idx[t]]);
    parent[find(id[idx[t + 1]])] = a;
    parent[find(id[idx[t + 2]])] = a;
  }
  const groups = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const root = find(id[idx[t]]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  // Crumbs (under 0.5% of the triangles) join the biggest piece.
  const list = [...groups.values()].sort((a, b) => b.length - a.length);
  const big = list.filter(g => g.length >= idx.length * 0.005);
  for (const crumb of list.filter(g => g.length < idx.length * 0.005)) big[0].push(...crumb);
  return big.map(tris => subMesh(mesh, tris));
}

// Eight blocks around the model's centre, by triangle centre.
function byOctants(mesh, height) {
  const geo = mesh.geometry, pos = geo.attributes.position, idx = triangles(geo);
  const blocks = Array.from({ length: 8 }, () => []);
  const midY = height / 2;
  for (let t = 0; t < idx.length; t += 3) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { x += pos.getX(idx[t + k]); y += pos.getY(idx[t + k]); z += pos.getZ(idx[t + k]); }
    const b = (x > 0 ? 1 : 0) + (y / 3 > midY ? 2 : 0) + (z > 0 ? 4 : 0);
    blocks[b].push(idx[t], idx[t + 1], idx[t + 2]);
  }
  return blocks.filter(b => b.length).map(tris => subMesh(mesh, tris));
}

function subMesh(mesh, tris) {
  const geo = new THREE.BufferGeometry();
  for (const [k, attr] of Object.entries(mesh.geometry.attributes)) geo.setAttribute(k, attr);
  geo.setIndex(tris);
  return new THREE.Mesh(geo, mesh.material);
}
