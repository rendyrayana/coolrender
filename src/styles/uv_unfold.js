import * as THREE from 'three';
import { meshes, progress, smooth, ownMaterial } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';

// The mesh flattens into its UV texture atlas, holds, and folds back.
// Models without UVs just turn.
export default {
  id: 'uv_unfold',
  label: 'UV unfold',
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model) {
    const h = model.userData.height;
    const uUnfold = { value: 0 }, uSize = { value: h * 1.05 };
    const group = meshes(model, part => {
      const m = ownMaterial(part);
      m.side = THREE.DoubleSide;
      if (!part.geometry.attributes.uv) return m;
      return patchMaterial(m, {
        key: 'uv_unfold',
        uniforms: { uUnfold, uSize },
        vertex: 'transformed = mix(transformed, vec3((uv.x - 0.5) * uSize, uv.y * uSize - uSize * 0.025, 0.0), uUnfold);',
      });
    });
    group.userData.update = (t, look) => {
      const p = progress(t, look);
      uUnfold.value = smooth(0.12, 0.4, p) * (1 - smooth(0.62, 0.9, p));
      // Face the flat atlas to the camera while unfolded.
      group.rotation.y = -group.parent.rotation.y * uUnfold.value;
    };
    return group;
  },
};
