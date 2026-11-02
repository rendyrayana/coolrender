import * as THREE from 'three';
import { meshes, progress, ownMaterial } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';
import { BACKGROUNDS } from '../core/look.js';

// Structured-light scanning: a stripe pattern sweeps across the object from
// the left; the scanned surface appears behind it. Ahead of the sweep the
// object is a faint (20%) ghost, so the frame is never empty.
export default {
  id: 'stripes',
  label: 'Structured light',
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model, ctx) {
    const r = model.userData.radius;
    const band = r * 0.35;
    const uSweep = { value: -r + band }, uBand = { value: band }, uFreq = { value: 60 / model.userData.height };
    const bg = ctx.look.bg === 'transparent' ? null : new THREE.Color(BACKGROUNDS[ctx.look.bg].color);
    const uBg = { value: bg ?? new THREE.Color(0, 0, 0) };
    const group = meshes(model, part => patchMaterial(ownMaterial(part), {
      key: `stripes-${bg ? 'bg' : 'clear'}`,
      uniforms: { uSweep, uBand, uFreq, uBg },
      fragment: /* glsl */`
        float crIn = smoothstep(uSweep - uBand, uSweep, vCrLocal.x);
        float crStripe = step(0.5, fract(vCrLocal.y * uFreq));
        vec3 crLit = mix(gl_FragColor.rgb, mix(vec3(0.02, 0.03, 0.06), vec3(0.75, 0.85, 1.0), crStripe), crIn);
        // Not yet scanned: 20% ghost of the object over the background.
        float crAhead = step(uSweep, vCrLocal.x);
        ${bg ? 'gl_FragColor.rgb = mix(crLit, mix(uBg, gl_FragColor.rgb, 0.2), crAhead);' : 'gl_FragColor.rgb = crLit; gl_FragColor *= mix(1.0, 0.2, crAhead);'}`,
    }));
    group.userData.update = (t, look) => {
      // Stripes are on the object from the first frame; the sweep ends at 70% of the shot.
      const p = Math.min(1, progress(t, look) / 0.7);
      uSweep.value = THREE.MathUtils.lerp(-r + band, r + band * 1.05, p);
    };
    return group;
  },
};
