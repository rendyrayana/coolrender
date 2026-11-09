import * as THREE from 'three';
import { meshes, progress, ownMaterial } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';

const STEPS = [32, 64, 128, 256];

// The texture snaps 32 → 64 → 128 → 256 px over the shot, with a faint pixel grid.
export default {
  id: 'texel_step',
  label: 'Texel steps',
  needsMesh: true,
  perPart: true,
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model) {
    const updaters = [], disposables = [];
    const group = meshes(model, part => {
      const material = ownMaterial(part);
      if (!material.map?.image) return material;
      const levels = STEPS.map(size => downsample(material.map, size));
      disposables.push(...levels);
      const uRes = { value: STEPS[0] };
      material.map = levels[0];
      patchMaterial(material, {
        key: 'texel_step',
        uniforms: { uRes },
        // A 1-pixel line on texel borders, faded out when texels get small on screen.
        color: /* glsl */`
          vec2 crT = vMapUv * uRes;
          vec2 crF = fract(crT), crW = fwidth(crT);
          float crLine = 1.0 - clamp(min(min(crF.x, 1.0 - crF.x) / crW.x, min(crF.y, 1.0 - crF.y) / crW.y), 0.0, 1.0);
          diffuseColor.rgb *= 1.0 - 0.18 * crLine * smoothstep(0.35, 0.12, max(crW.x, crW.y));`,
      });
      updaters.push((t, look) => {
        const step = Math.min(STEPS.length - 1, Math.floor(progress(t, look) * STEPS.length));
        material.map = levels[step];
        uRes.value = STEPS[step];
      });
      return material;
    });
    group.userData.update = (t, look) => updaters.forEach(u => u(t, look));
    group.userData.disposables = disposables;
    return group;
  },
};

function downsample(texture, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(texture.image, 0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  Object.assign(t, { colorSpace: texture.colorSpace, flipY: texture.flipY, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, generateMipmaps: false });
  t.userData.disposable = true; // freed when the style is rebuilt
  return t;
}
