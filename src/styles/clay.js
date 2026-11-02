import * as THREE from 'three';
import { pointsLike } from './shared.js';

const CLAY = new THREE.MeshStandardMaterial({ color: 0xd8d6d2, roughness: 0.85, metalness: 0 });

// Untextured light-grey material, for showing geometry only.
export default {
  id: 'clay',
  label: 'Clay',
  build(model) {
    const group = new THREE.Group();
    for (const part of model.children) {
      group.add(part.isPoints ? pointsLike(part, model, 0xd8d6d2) : new THREE.Mesh(part.geometry, CLAY));
    }
    return group;
  },
};
