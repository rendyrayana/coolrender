import * as THREE from 'three';
import { meshes, ownMaterial } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';

const INK = new THREE.Color('#1d2b3a'), PAPER = new THREE.Color('#f2efe8');

// Print-style dot shading in one ink colour on paper.
const uCell = { value: 8 };
export default {
  id: 'halftone',
  label: 'Halftone',
  background: '#f2efe8',
  shadow: false,
  build(model) {
    return meshes(model, part => patchMaterial(ownMaterial(part), {
      key: 'halftone',
      uniforms: { uCell, uInk: { value: INK }, uPaper: { value: PAPER } },
      fragment: /* glsl */`
        float crLum = clamp(pow(dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)), 0.45) * 1.15, 0.0, 1.0);
        vec2 crP = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / uCell;
        float crDist = length(fract(crP) - 0.5);
        float crR = sqrt(1.0 - crLum) * 0.62;
        float crAa = fwidth(crDist);
        gl_FragColor.rgb = mix(uPaper, uInk, 1.0 - smoothstep(crR - crAa, crR + crAa, crDist));`,
    }));
  },
  // Dot size follows the output height, so 720p and 4K look the same.
  render(stage) {
    uCell.value = Math.max(4, stage.renderer.getDrawingBufferSize(new THREE.Vector2()).y / 140);
    stage.renderScene();
  },
};
