import * as THREE from 'three';
import { meshes, ownMaterial } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';

const COLORS = 16;
// Palettes as [hue, saturation] start/end pairs; each becomes a 16-colour ramp.
const PALETTES = [[0.06, 0.55, 0.1, 0.3], [0.58, 0.45, 0.5, 0.2], [0.33, 0.5, 0.2, 0.4], [0.85, 0.5, 0.95, 0.35], [0.12, 0.65, 0.02, 0.6]];

// Colour lookup table (CLUT) cycling: the image is reduced to 16 brightness
// levels, and the 16-colour palette shifts through several palettes. Loop-safe.
export default {
  id: 'palette_cycle',
  label: 'Palette cycle',
  build(model) {
    const data = new Uint8Array(COLORS * PALETTES.length * 4);
    PALETTES.forEach(([h0, s0, h1, s1], row) => {
      for (let i = 0; i < COLORS; i++) {
        const k = i / (COLORS - 1);
        const c = new THREE.Color().setHSL(THREE.MathUtils.lerp(h0, h1, k), THREE.MathUtils.lerp(s0, s1, k), 0.06 + 0.86 * k);
        data.set([c.r * 255, c.g * 255, c.b * 255, 255], (row * COLORS + i) * 4);
      }
    });
    const clut = new THREE.DataTexture(data, COLORS, PALETTES.length);
    Object.assign(clut, { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, needsUpdate: true });
    clut.userData.disposable = true;
    const uClut = { value: clut }, uRow = { value: 0 };
    const group = meshes(model, part => {
      const m = patchMaterial(ownMaterial(part), {
        key: 'palette_cycle',
        uniforms: { uClut, uRow },
        color: /* glsl */`
          float crL = pow(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)), 0.6);
          float crI = (floor(crL * ${COLORS}.0 - 0.001) + 0.5) / ${COLORS}.0;
          float crR = uRow * ${PALETTES.length}.0;
          vec3 crA = texture2D(uClut, vec2(crI, (floor(crR) + 0.5) / ${PALETTES.length}.0)).rgb;
          vec3 crB = texture2D(uClut, vec2(crI, (mod(floor(crR) + 1.0, ${PALETTES.length}.0) + 0.5) / ${PALETTES.length}.0)).rgb;
          diffuseColor.rgb = mix(crA, crB, smoothstep(0.7, 1.0, fract(crR)));`,
      });
      return m;
    });
    group.userData.update = (t, look) => { uRow.value = (t / look.seconds) % 1; };
    return group;
  },
};
