import * as THREE from 'three';
import { meshes } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';

// Translucent X-ray shell: edges glow, the inside and back walls show through.
export default {
  id: 'xray',
  label: 'X-ray',
  needsMesh: true,
  perPart: true,
  shadow: false,
  build(model) {
    const material = patchMaterial(new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), {
      key: 'xray',
      fragment: /* glsl */`
        float crF = 1.0 - abs(normalize(vCrViewN).z);
        gl_FragColor.rgb *= 0.04 + 0.5 * pow(crF, 2.5);`,
    });
    return meshes(model, () => material);
  },
};
