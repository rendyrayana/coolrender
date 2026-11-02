import * as THREE from 'three';
import { progress, clayMaterial } from './shared.js';
import { countTriangles } from '../core/model.js';
import { lowPoly } from '../core/lod.js';

// The triangle count drops step by step (full detail → 800) while the
// silhouette holds. Flat shading makes the facets visible.
export default {
  id: 'decimate_live',
  label: 'Live decimation',
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model) {
    const full = countTriangles(model);
    const targets = [100_000, 30_000, 10_000, 3_000, 800].filter(n => n < full);
    const levels = [lowPoly(model, full).map(m => m.geometry), ...targets.map(n => lowPoly(model, n).map(m => m.geometry))];
    const materials = model.children.filter(c => c.isMesh).map(() => Object.assign(clayMaterial(), { flatShading: true }));
    const group = new THREE.Group().add(...materials.map((mat, i) => new THREE.Mesh(levels[0][i], mat)));
    group.userData.update = (t, look) => {
      // Spread the steps over the first 80% of the shot.
      const level = Math.min(levels.length - 1, Math.floor((progress(t, look) / 0.8) * levels.length));
      group.children.forEach((mesh, i) => { mesh.geometry = levels[level][i]; });
    };
    return group;
  },
};
