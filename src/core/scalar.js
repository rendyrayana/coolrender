import * as THREE from 'three';

// One value per vertex, 0..1, stored as attribute `aScalar` on every mesh of
// the model. Used by anchor_glow. Sources, in order:
//   1. values loaded from a CSV (the aHeat attribute, see core/heat.js)
//   2. the model's vertex colours (brightness)
//   3. `fallback`: 'dark' = dark areas of the texture (carved marks), 'none' = 0, else height
// (Distances to a rescan are a different thing: see core/deviation.js.)
export function vertexScalar(model, { fallback = 'height' } = {}) {
  const cache = (model.userData.cache ??= {});
  const key = `scalar_${fallback}`;
  const meshes = model.children.filter(c => c.isMesh);
  if (cache[key]) {
    // Another style may have written different values since; put ours back.
    meshes.forEach((mesh, m) => mesh.geometry.setAttribute('aScalar', cache[key].attributes[m]));
    return cache[key];
  }

  const raw = meshes.map(mesh => {
    const geo = mesh.geometry, n = geo.attributes.position.count;
    if (geo.attributes.aHeat) return Float32Array.from(geo.attributes.aHeat.array);
    const col = geo.attributes.color;
    if (col) return Float32Array.from({ length: n }, (_, i) => 0.3 * col.getX(i) + 0.59 * col.getY(i) + 0.11 * col.getZ(i));
    if (fallback === 'dark' && mesh.material.map && geo.attributes.uv) return textureDarkness(mesh);
    if (fallback === 'none') return new Float32Array(n);
    const pos = geo.attributes.position;
    return Float32Array.from({ length: n }, (_, i) => pos.getY(i) / model.userData.height);
  });

  // Normalise to 0..1 using the 2nd and 98th percentiles, so outliers don't flatten the ramp.
  const all = raw.flatMap(a => Array.from(a)).sort((a, b) => a - b);
  const finite = all.filter(Number.isFinite);
  const lo = finite[Math.floor(finite.length * 0.02)] ?? 0, hi = finite[Math.floor(finite.length * 0.98)] ?? 1;
  let peak = null, peakValue = -Infinity;
  const attributes = meshes.map((mesh, m) => {
    const values = raw[m].map(v => (Number.isFinite(v) ? THREE.MathUtils.clamp((v - lo) / (hi - lo || 1), 0, 1) : 0));
    const attribute = new THREE.BufferAttribute(values, 1);
    mesh.geometry.setAttribute('aScalar', attribute);
    const pos = mesh.geometry.attributes.position;
    raw[m].forEach((v, i) => { if (v > peakValue) { peakValue = v; peak = new THREE.Vector3().fromBufferAttribute(pos, i); } });
    return attribute;
  });
  return (cache[key] = { peak: peak ?? new THREE.Vector3(), attributes }); // peak: where the value is highest
}

function textureDarkness(mesh) {
  const img = mesh.material.map.image, flipY = mesh.material.map.flipY;
  const c = document.createElement('canvas');
  c.width = Math.min(512, img.width); c.height = Math.min(512, img.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  const uv = mesh.geometry.attributes.uv;
  return Float32Array.from({ length: uv.count }, (_, i) => {
    const u = uv.getX(i) - Math.floor(uv.getX(i)), v = uv.getY(i) - Math.floor(uv.getY(i));
    const x = Math.min(c.width - 1, Math.floor(u * c.width)), y = Math.min(c.height - 1, Math.floor((flipY ? 1 - v : v) * c.height));
    const o = (y * c.width + x) * 4;
    return 1 - (0.3 * data[o] + 0.59 * data[o + 1] + 0.11 * data[o + 2]) / 255;
  });
}

// Reads one number per line (the last number on each line) from a CSV/TXT file.
export function parseScalarCsv(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const nums = line.match(/-?\d+(\.\d+)?([eE][-+]?\d+)?/g);
    if (nums) out.push(Number(nums[nums.length - 1]));
  }
  return out;
}
