// Runs inside the browser (served by Vite) for scripts/obj2glb.mjs.
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';

export async function objToGlb(objText, textureDataUrl, { maxTris = Infinity, maxTexture = 4096 } = {}) {
  const object = new OBJLoader().parse(objText);
  let geo = null;
  object.traverse(o => { if (o.isMesh && !geo) geo = o.geometry; });
  geo.deleteAttribute('color');
  geo = mergeVertices(geo, 1e-6);

  const tris = geo.index.count / 3;
  if (tris > maxTris) {
    await MeshoptSimplifier.ready;
    const positions = new Float32Array(geo.attributes.position.array);
    const indices = new Uint32Array(geo.index.array);
    // Lock texture seams: moving them tears the texture into cracks.
    const [out] = MeshoptSimplifier.simplify(indices, positions, 3, Math.floor(maxTris) * 3, 1.0, ['LockBorder']);
    geo.setIndex(new THREE.BufferAttribute(out, 1));
    geo = mergeVertices(geo.toNonIndexed(), 1e-6); // drop vertices nothing uses any more
  }

  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = textureDataUrl; });
  const size = Math.min(maxTexture, img.width);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.userData.mimeType = 'image/jpeg'; // GLTFExporter would otherwise embed a much larger PNG

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0 }));
  const glb = await new GLTFExporter().parseAsync(mesh, { binary: true, maxTextureSize: size });
  const bytes = new Uint8Array(glb);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(s), tris: geo.index.count / 3 };
}
