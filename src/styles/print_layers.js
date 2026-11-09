import * as THREE from 'three';
import { meshes, progress, smooth, ownMaterial } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';

const LAYERS = 140;

// The object grows bottom-up in visible FDM layers, like a 3D printer.
export default {
  id: 'print_layers',
  label: 'Print layers',
  needsMesh: true,
  perPart: true,
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model) {
    const h = model.userData.height;
    const uLevel = { value: 0 }, uLayer = { value: h / LAYERS }, uTop = { value: h * 0.999 };
    const group = meshes(model, part => {
      const m = patchMaterial(ownMaterial(part), {
        key: 'print_layers',
        uniforms: { uLevel, uLayer, uTop },
        // Whole layers only: the top edge steps up one layer at a time.
        discard: 'if (vCrObj.y > floor(uLevel / uLayer) * uLayer) discard;',
        color: /* glsl */`
          float crL = fract(vCrObj.y / uLayer);
          diffuseColor.rgb *= 0.86 + 0.14 * sin(crL * 3.14159);`,
        fragment: /* glsl */`
          float crHot = 1.0 - smoothstep(0.0, uLayer * 2.0, floor(uLevel / uLayer) * uLayer - vCrObj.y);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.75, 0.45), crHot * step(uLevel, uTop) * 0.8);`,
      });
      m.side = THREE.DoubleSide; // the open top shows the inside walls
      return m;
    });
    group.userData.update = (t, look) => { uLevel.value = h * 1.001 * smooth(0, 0.8, progress(t, look)); };
    return group;
  },
};
