import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';

export const TRI_BUDGET = 300_000;

// A prepared model: a flat Group of meshes (or points) whose geometry is baked
// into model space, standing on y = 0 and centred on the vertical axis.
// Styles build their look from it; it is never added to the scene directly.
export function prepareModel(loaded, name) {
  const root = new THREE.Group();
  root.name = name;
  loaded.object.updateMatrixWorld(true);
  loaded.object.traverse(o => {
    if (!(o.isMesh || o.isPoints) || !o.geometry?.attributes.position) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (o.isPoints) { root.add(new THREE.Points(geo, o.material)); return; }
    // A mirroring transform (scale -1) turns faces inside out; flip them back.
    if (o.matrixWorld.determinant() < 0) flipWinding(geo);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    for (const part of splitByMaterial(geo, o.material)) { part.name = o.name; root.add(part); } // names link parts to explode layouts
  });
  if (!root.children.length) throw new Error('This file contains no visible geometry.');
  root.userData.isPointCloud = root.children.every(c => c.isPoints);
  // Original vertex positions (OBJ `v` lines) and every transform applied since,
  // so per-vertex values from a CSV can be matched by position (core/heat.js).
  root.userData.sourcePositions = loaded.sourcePositions ?? null;
  root.userData.transform = new THREE.Matrix4();
  recenter(root);
  return root;
}

function flipWinding(geo) {
  if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
  const idx = geo.index.array;
  for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  geo.index.needsUpdate = true; // normals are already mirrored correctly by applyMatrix4
}

// One mesh per material keeps decimation and styles simple. Each part keeps
// only the vertices its triangles use.
function splitByMaterial(geo, material) {
  if (!Array.isArray(material) || !geo.groups.length) return [new THREE.Mesh(geo, [material].flat()[0])];
  if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
  const index = geo.index.array;
  return geo.groups.map(g => {
    const tris = index.subarray(g.start, g.start + g.count);
    const remap = new Map();
    const newIndex = new Uint32Array(tris.length);
    tris.forEach((v, i) => { if (!remap.has(v)) remap.set(v, remap.size); newIndex[i] = remap.get(v); });
    const used = [...remap.keys()];
    const part = new THREE.BufferGeometry();
    for (const [k, attr] of Object.entries(geo.attributes)) {
      const out = new attr.array.constructor(used.length * attr.itemSize);
      used.forEach((v, i) => { for (let c = 0; c < attr.itemSize; c++) out[i * attr.itemSize + c] = attr.getComponent(v, c); });
      part.setAttribute(k, new THREE.BufferAttribute(out, attr.itemSize, attr.normalized));
    }
    part.setIndex(new THREE.BufferAttribute(newIndex, 1));
    return new THREE.Mesh(part, material[g.materialIndex ?? 0]);
  });
}

export function countTriangles(root) {
  let n = 0;
  root.traverse(o => {
    if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return Math.round(n);
}

// Simplifies every mesh so the model has about `budget` triangles in total.
// UVs, colours and normals are kept because the simplifier only drops vertices.
// Texture seams (where vertices are split) are locked: letting them move tears
// the texture into visible cracks. Textured scans may therefore stay a little
// above the budget rather than break.
export async function decimateModel(root, budget = TRI_BUDGET) {
  await MeshoptSimplifier.ready;
  const total = countTriangles(root);
  if (total <= budget) return;
  const ratio = budget / total;
  for (const mesh of root.children.filter(c => c.isMesh)) {
    let geo = mesh.geometry;
    if (!geo.index) geo = mergeVertices(geo);
    const pos = geo.attributes.position;
    const positions = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) positions.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3);
    const indices = new Uint32Array(geo.index.array);
    const target = Math.max(3, Math.floor((indices.length / 3) * ratio) * 3);
    const textured = !!geo.attributes.uv;
    let [out] = MeshoptSimplifier.simplify(indices, positions, 3, target, 1.0, textured ? ['LockBorder'] : []);
    // Untextured scans with holes can stall well above the target; sloppy mode has no seams to break.
    if (!textured && out.length > target * 1.2) [out] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, 1.0);
    geo.setIndex(new THREE.BufferAttribute(out, 1));
    // Keep the scan's own smooth normals; recomputing them splits shading along seams.
    if (!geo.attributes.normal) geo.computeVertexNormals();
    mesh.geometry = geo;
  }
  root.userData.cache = {};
}

// Orientation fixes are baked into the geometry, then the model is re-centred.
export function rotateModel(root, axis, degrees) {
  const m = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(...{ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis]), THREE.MathUtils.degToRad(degrees));
  for (const c of root.children) c.geometry.applyMatrix4(m);
  root.userData.transform?.premultiply(m);
  recenter(root);
}

// Z-up files (common from CAD and photogrammetry tools) stand up after -90° on X.
export const setZUp = root => rotateModel(root, 'x', -90);
export const setYUp = root => rotateModel(root, 'x', 90);

// Puts the model on the floor (y = 0), centred on the turntable axis, and
// measures what the camera fit needs: height and turntable radius.
export function recenter(root) {
  const box = new THREE.Box3();
  for (const c of root.children) { c.geometry.computeBoundingBox(); box.union(c.geometry.boundingBox); }
  const center = box.getCenter(new THREE.Vector3());
  const shift = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
  root.userData.transform?.premultiply(shift);
  let radius = 0;
  for (const c of root.children) {
    c.geometry.applyMatrix4(shift);
    c.geometry.computeBoundingBox();
    c.geometry.computeBoundingSphere();
    const p = c.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) radius = Math.max(radius, Math.hypot(p.getX(i), p.getZ(i)));
  }
  root.userData.cache = {}; // derived data (points, parts, scalars) is stale now
  root.userData.height = box.max.y - box.min.y || 1;
  root.userData.radius = radius || 1;
}

// Frees the GPU buffers and textures of a model that is no longer shown, with the
// geometry and values derived from it (parts, simplified copies, point samples).
export function disposeModel(model) {
  const seen = new Set();
  const free = thing => { if (thing && !seen.has(thing)) { seen.add(thing); thing.dispose?.(); } };
  model.traverse(o => {
    free(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) {
      for (const v of Object.values(m)) if (v?.isTexture) free(v);
      free(m);
    }
  });
  const cache = model.userData.cache ?? {};
  for (const value of Object.values(cache)) {
    const list = Array.isArray(value) ? value : value?.children ?? [value];
    for (const part of list) free(part?.geometry ?? (part?.isBufferGeometry ? part : null));
  }
  model.userData.cache = {};
}
