import * as THREE from 'three';
import { seeded } from '../styles/shared.js';

export const POINT_COUNT = 150_000;

// Points on the model's surface (or its own points, for scanned point clouds),
// with colour, normal and a per-point random vec4 `aRandom` that animations use
// for scatter directions, delays and drift phases. Same seed, same points.
export function samplePoints(model, count = POINT_COUNT) {
  const cache = (model.userData.cache ??= {});
  const key = `points${count}`;
  if (cache[key]) return cache[key];
  const geo = model.userData.isPointCloud ? subsampleCloud(model, count) : sampleSurface(model, count);
  const rand = seeded(11);
  const r = new Float32Array(geo.attributes.position.count * 4);
  for (let i = 0; i < r.length; i++) r[i] = rand();
  geo.setAttribute('aRandom', new THREE.BufferAttribute(r, 4));
  return (cache[key] = geo);
}

// Area-weighted random points on every triangle, with a fixed seed.
function sampleSurface(model, count) {
  const rand = seeded(7);
  const tris = [];
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of model.children.filter(m => m.isMesh)) {
    const geo = mesh.geometry, pos = geo.attributes.position;
    const idx = geo.index?.array;
    const n = idx ? idx.length / 3 : pos.count / 3;
    const colorOf = colorSource(mesh);
    for (let t = 0; t < n; t++) {
      const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      if (area <= 0) continue;
      total += area;
      tris.push({ total, geo, i0, i1, i2, colorOf });
    }
  }

  if (!tris.length) count = 0; // nothing with area to sample
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  const n = new THREE.Vector3();
  const p = new THREE.Vector3(), col = new THREE.Color(), uv = new THREE.Vector2();
  const uvA = new THREE.Vector2(), uvB = new THREE.Vector2(), uvC = new THREE.Vector2();
  for (let k = 0; k < count; k++) {
    const tri = tris[findTri(tris, rand() * total)];
    let u = rand(), v = rand();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    const pos = tri.geo.attributes.position;
    a.fromBufferAttribute(pos, tri.i0); b.fromBufferAttribute(pos, tri.i1); c.fromBufferAttribute(pos, tri.i2);
    p.set(0, 0, 0).addScaledVector(a, w).addScaledVector(b, u).addScaledVector(c, v);
    positions.set([p.x, p.y, p.z], k * 3);
    n.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
    normals.set([n.x, n.y, n.z], k * 3);
    const uvAttr = tri.geo.attributes.uv;
    if (uvAttr) {
      uvA.fromBufferAttribute(uvAttr, tri.i0); uvB.fromBufferAttribute(uvAttr, tri.i1); uvC.fromBufferAttribute(uvAttr, tri.i2);
      uv.set(0, 0).addScaledVector(uvA, w).addScaledVector(uvB, u).addScaledVector(uvC, v);
    }
    tri.colorOf(col, uv, [tri.i0, tri.i1, tri.i2], [w, u, v]);
    colors.set([col.r, col.g, col.b], k * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geo;
}

function findTri(tris, x) {
  let lo = 0, hi = tris.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid].total < x) lo = mid + 1; else hi = mid; }
  return lo;
}

// Returns a function that writes the linear colour at a surface point:
// texture pixel if the material has one, else vertex colour, else material colour.
function colorSource(mesh) {
  const mat = mesh.material;
  const base = mat.color ?? new THREE.Color(0xcfcac2);
  const pixels = mat.map ? readPixels(mat.map) : null;
  const vcol = mat.vertexColors && mesh.geometry.attributes.color;
  const tmp = new THREE.Color();
  return (out, uv, ids, weights) => {
    out.copy(base);
    if (pixels) {
      const x = Math.floor(fract(uv.x) * pixels.width);
      const yUv = mat.map.flipY ? 1 - fract(uv.y) : fract(uv.y);
      const y = Math.min(pixels.height - 1, Math.floor(yUv * pixels.height));
      const o = (y * pixels.width + Math.min(pixels.width - 1, x)) * 4;
      out.multiply(tmp.setRGB(pixels.data[o] / 255, pixels.data[o + 1] / 255, pixels.data[o + 2] / 255, THREE.SRGBColorSpace));
    } else if (vcol) {
      let r = 0, g = 0, b = 0;
      ids.forEach((id, j) => { r += vcol.getX(id) * weights[j]; g += vcol.getY(id) * weights[j]; b += vcol.getZ(id) * weights[j]; });
      out.multiply(tmp.setRGB(r, g, b));
    }
  };
}

const fract = x => x - Math.floor(x);

function readPixels(texture) {
  const img = texture.image;
  if (!img?.width) return null;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

// A scanned point cloud is drawn as-is, thinned to the point budget.
function subsampleCloud(model, count) {
  const parts = model.children;
  const total = parts.reduce((n, p) => n + p.geometry.attributes.position.count, 0);
  const step = Math.max(1, total / count);
  const positions = [], colors = [];
  for (const part of parts) {
    const pos = part.geometry.attributes.position, col = part.geometry.attributes.color;
    for (let i = 0; i < pos.count; i += step) {
      const j = Math.floor(i);
      positions.push(pos.getX(j), pos.getY(j), pos.getZ(j));
      if (col) colors.push(col.getX(j), col.getY(j), col.getZ(j)); else colors.push(0.8, 0.79, 0.76);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}
