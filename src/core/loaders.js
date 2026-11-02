import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export const MODEL_EXTS = ['glb', 'gltf', 'obj', 'ply', 'stl'];
export const FriendlyError = class extends Error {};

const extOf = name => name.split('.').pop().toLowerCase();
const baseName = path => decodeURIComponent(path.split(/[\\/]/).pop().split('?')[0]).toLowerCase();

// Splits dropped files into models and the extra files they need (MTL, textures, .bin).
export function groupFiles(files) {
  const models = [], extras = new Map(), unsupported = [];
  for (const f of files) {
    const ext = extOf(f.name);
    if (MODEL_EXTS.includes(ext)) models.push(f);
    else if (['mtl', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tga', 'ktx2', 'csv', 'txt'].includes(ext)) extras.set(f.name.toLowerCase(), f);
    else unsupported.push(f.name);
  }
  return { models, extras, unsupported };
}

// Loads a dropped model. `extras` maps lowercase file names to sibling files.
export function loadModelFile(file, extras = new Map(), { useLoneImage = true } = {}) {
  const urls = [];
  const resolve = name => {
    const f = extras.get(baseName(name));
    if (!f) return null;
    const url = URL.createObjectURL(f);
    urls.push(url);
    return url;
  };
  const read = extOf(file.name) === 'obj' || extOf(file.name) === 'gltf' ? file.text() : file.arrayBuffer();
  return read
    .then(data => parseModel(file.name, data, resolve, name => extras.get(baseName(name))?.text()))
    .then(result => (useLoneImage ? applyLoneImage(result, extras) : result))
    .finally(() => urls.forEach(u => URL.revokeObjectURL(u)));
}

// Scans often come as just model.obj + texture.jpg. If the model has UVs but
// no texture and exactly one image was dropped with it, use that image.
async function applyLoneImage(result, extras) {
  const images = [...extras.values()].filter(f => /\.(png|jpe?g|webp|bmp)$/i.test(f.name));
  const meshes = [];
  result.object.traverse(o => { if (o.isMesh && o.geometry.attributes.uv) meshes.push(o); });
  const textured = meshes.some(m => [m.material].flat().some(mat => mat?.map));
  if (images.length !== 1 || !meshes.length || textured) return result;
  const url = URL.createObjectURL(images[0]);
  try {
    const map = await new THREE.TextureLoader().loadAsync(url);
    map.colorSpace = THREE.SRGBColorSpace;
    for (const m of meshes) m.material = new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
  } finally {
    URL.revokeObjectURL(url);
  }
  result.warnings = result.warnings.filter(w => !w.includes('material file'));
  return result;
}

// Loads a model served over HTTP (batch mode), with siblings next to it.
export async function loadModelUrl(url) {
  const name = baseName(url);
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  const res = await fetch(url);
  if (!res.ok) throw new FriendlyError(`Model not found: ${url}`);
  const data = ['obj', 'gltf'].includes(extOf(name)) ? await res.text() : await res.arrayBuffer();
  const resolve = n => dir + n.split(/[\\/]/).pop();
  const readText = n => fetch(dir + n).then(r => (r.ok ? r.text() : undefined));
  return parseModel(name, data, resolve, readText);
}

// Shared by both paths. Returns { object, warnings, isPointCloud }.
async function parseModel(name, data, resolveUrl, readText) {
  const ext = extOf(name);
  const warnings = [];
  const missing = new Set();

  // Every texture/buffer request goes through this manager, so we can report
  // files that were referenced but not supplied.
  const manager = new THREE.LoadingManager();
  let started = 0;
  const allDone = new Promise(r => { manager.onLoad = r; });
  const itemStart = manager.itemStart.bind(manager);
  manager.itemStart = url => { started++; itemStart(url); };
  manager.setURLModifier(url => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    return resolveUrl(url) ?? `missing:${url}`;
  });
  manager.onError = url => missing.add(baseName(url.replace(/^missing:/, '')));

  let object, isPointCloud = false, sourcePositions = null;
  try {
    if (ext === 'glb' || ext === 'gltf') {
      const gltf = await new GLTFLoader(manager).parseAsync(data, '');
      object = gltf.scene;
    } else if (ext === 'obj') {
      const loader = new OBJLoader(manager);
      const mtlName = data.match(/^mtllib\s+(.+)$/m)?.[1]?.trim();
      if (mtlName) {
        const mtlText = await Promise.resolve().then(() => readText(mtlName)).catch(() => undefined);
        if (mtlText) {
          const materials = new MTLLoader(manager).parse(mtlText, '');
          materials.preload();
          loader.setMaterials(materials);
        } else {
          warnings.push(`The material file "${mtlName}" is missing, so the model has no texture. Drop it together with the .obj and its images, or use the Clay style.`);
        }
      }
      object = loader.parse(data);
      sourcePositions = objPositions(data);
    } else if (ext === 'ply') {
      const geo = new PLYLoader().parse(data);
      isPointCloud = !geo.index;
      object = wrapGeometry(geo, isPointCloud);
    } else if (ext === 'stl') {
      object = wrapGeometry(new STLLoader().parse(data), false);
    } else {
      throw new FriendlyError(`".${ext}" files are not supported. Use GLB, GLTF, OBJ, PLY or STL.`);
    }
  } catch (e) {
    if (e instanceof FriendlyError) throw e;
    console.error(e); // keep the technical detail for bug reports
    const what = [...missing].join(', ');
    throw new FriendlyError(what
      ? `This model needs files that weren't included: ${what}. Drop them together with the model.`
      : `Couldn't read "${name}". The file may be damaged or not a valid ${ext.toUpperCase()} file.`);
  }

  if (started > 0) await Promise.race([allDone, new Promise(r => setTimeout(r, 15000))]);

  // A texture that failed to load would render black; drop it so the model shows its base colour.
  object.traverse(o => {
    for (const m of [o.material].flat().filter(Boolean)) {
      const img = m.map?.image;
      if (m.map && (!img || (img instanceof HTMLImageElement && !img.naturalWidth))) { m.map = null; m.needsUpdate = true; }
    }
  });
  if (missing.size) warnings.push(`Missing texture: ${[...missing].join(', ')}. The model is shown without it. Drop the image together with the model to fix this.`);

  return { object, warnings, isPointCloud, sourcePositions };
}

function wrapGeometry(geo, asPoints) {
  const hasColor = !!geo.attributes.color;
  if (asPoints) return new THREE.Points(geo, new THREE.PointsMaterial({ size: 1, vertexColors: hasColor, color: hasColor ? 0xffffff : 0xcfcac2 }));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: hasColor, color: hasColor ? 0xffffff : 0xcfcac2, roughness: 0.8 }));
}

// The `v` lines of an OBJ, in file order (what per-vertex CSV files refer to).
function objPositions(text) {
  const out = [];
  for (const m of text.matchAll(/^v\s+(\S+)\s+(\S+)\s+(\S+)/gm)) out.push(+m[1], +m[2], +m[3]);
  return new Float32Array(out);
}
