import { meshes, clayMaterial } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';

// Topographic slice lines over clay; the lines drift slowly upward (loop-safe).
export default {
  id: 'contour',
  label: 'Contour',
  needsMesh: true,
  perPart: true,
  build(model) {
    const uSpacing = { value: model.userData.height / 36 }, uPhase = { value: 0 };
    const material = patchMaterial(clayMaterial(), {
      key: 'contour',
      uniforms: { uSpacing, uPhase },
      color: /* glsl */`
        float crY = vCrObj.y / uSpacing - uPhase;
        float crF = fract(crY), crW = fwidth(crY) * 1.2;
        float crLine = 1.0 - smoothstep(0.0, crW, min(crF, 1.0 - crF));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.24, 0.32), crLine);`,
    });
    const group = meshes(model, () => material);
    group.userData.update = (t, look) => { uPhase.value = t / look.seconds; };
    return group;
  },
};
