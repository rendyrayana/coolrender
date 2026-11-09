import * as THREE from 'three';
import { meshes } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';

// Non-photorealistic ink drawing: paper-white body with black outlines
// (an inflated back-face shell), on a paper background.
export default {
  id: 'ink',
  label: 'Ink',
  needsMesh: true,
  perPart: true,
  background: '#f4f1ea',
  shadow: false,
  build(model) {
    const paper = new THREE.MeshToonMaterial({ color: 0xf4f1ea });
    const outline = patchMaterial(new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide }), {
      key: 'ink-outline',
      uniforms: { uWidth: { value: model.userData.height * 0.006 } },
      vertex: 'transformed += normalize(normal) * uWidth;',
    });
    const group = meshes(model, () => paper);
    for (const mesh of [...group.children]) if (mesh.isMesh) mesh.add(new THREE.Mesh(mesh.geometry, outline));
    return group;
  },
};
