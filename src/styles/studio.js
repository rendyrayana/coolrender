import * as THREE from 'three';
import { pointsLike } from './shared.js';

// Textured, as scanned: the model's own materials, lit by the studio lights.
export default {
  id: 'studio',
  label: 'Studio',
  perPart: true,
  build(model) {
    const group = new THREE.Group();
    for (const part of model.children) {
      if (part.isPoints) { group.add(pointsLike(part, model)); continue; }
      const mesh = new THREE.Mesh(part.geometry, part.material);
      group.add(mesh);
    }
    return group;
  },
};
