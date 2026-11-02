import * as THREE from 'three';
import { meshes, progress, smooth, ownMaterial, dissolving } from './shared.js';
import { cloud } from './cloud.js';

// Texture pixels fall from above and settle onto the surface, then the
// clean textured model takes over (the rebake moment).
export default {
  id: 'pixel_rain',
  label: 'Pixel rain',
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model) {
    const h = model.userData.height;
    const uFall = { value: 0 }, uDrop = { value: h * 1.4 }, uFade = { value: 1 };
    const points = cloud(model, {
      count: 70_000,
      sizeScale: 1.6,
      key: 'pixel_rain',
      extra: {
        uniforms: { uFall, uDrop, uFade },
        // Each pixel starts at its own time; ease-out landing.
        vertex: /* glsl */`
          float crK = clamp((uFall - aRandom.w * 0.7) / 0.3, 0.0, 1.0);
          crK = 1.0 - pow(1.0 - crK, 3.0);
          transformed.y += (1.0 - crK) * uDrop * (1.0 + aRandom.x * 0.5);`,
        discard: 'if (vRandom.z > uFade) discard;',
      },
    });
    points.material.map = null; // square pixels
    points.material.alphaTest = 0;
    const parts = [];
    const surface = meshes(model, part => { const d = dissolving(ownMaterial(part), 'pixel_rain'); parts.push(d.uReveal); return d.material; });
    const group = new THREE.Group().add(points, surface);
    group.userData.update = (t, look) => {
      const p = progress(t, look);
      uFall.value = smooth(0, 0.65, p);
      const reveal = smooth(0.68, 0.85, p);
      parts.forEach(u => { u.value = reveal; });
      uFade.value = 1 - smooth(0.8, 0.95, p);
    };
    return group;
  },
};
