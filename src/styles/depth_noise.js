import * as THREE from 'three';
import { meshes, progress, smooth, clayMaterial, dissolving, ownMaterial } from './shared.js';
import { cloud } from './cloud.js';
import { lowPoly } from '../core/lod.js';

// Kinect-style depth capture: jittery, noisy points that calm down, settle
// into a rough low-poly mesh, and end as the textured scan.
export default {
  id: 'depth_noise',
  label: 'Depth noise',
  needsMesh: true,
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model) {
    const h = model.userData.height;
    const uNoise = { value: 1 }, uTick = { value: 0 }, uFade = { value: 1 };
    const points = cloud(model, {
      count: 80_000,
      key: 'depth_noise',
      extra: {
        uniforms: { uNoise, uTick, uFade, uAmp: { value: h * 0.04 } },
        // New noise every frame (uTick), stronger along the camera axis like depth noise.
        vertex: 'transformed += uNoise * uAmp * (vec3(0.3, 0.3, 1.0) * (vec3(crHash(position + uTick), crHash(position.yzx - uTick), crHash(position.zxy + uTick * 1.7)) - 0.5));',
        discard: 'if (vRandom.w > uFade) discard;',
      },
    });
    const { material: rough, uReveal } = dissolving(Object.assign(clayMaterial(), { flatShading: true }), 'depth_noise');
    const mesh = new THREE.Group().add(...lowPoly(model, 4000).map(m => new THREE.Mesh(m.geometry, rough)));
    const reveals = [];
    const textured = meshes(model, part => { const d = dissolving(ownMaterial(part), 'depth_noise_tex'); reveals.push(d.uReveal); return d.material; });
    const group = new THREE.Group().add(points, mesh, textured);
    group.userData.update = (t, look) => {
      const p = progress(t, look);
      uNoise.value = 1 - smooth(0.05, 0.5, p);
      uTick.value = Math.round(t * look.fps) % 997;
      uReveal.value = smooth(0.4, 0.6, p) * (1 - smooth(0.72, 0.9, p));
      reveals.forEach(u => { u.value = smooth(0.72, 0.9, p); });
      uFade.value = 1 - smooth(0.5, 0.7, p);
    };
    return group;
  },
};
