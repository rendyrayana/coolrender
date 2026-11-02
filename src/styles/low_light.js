import { meshes, ownMaterial } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';

// The object is almost black, revealed only by a rim light that circles it
// once per shot (loop-safe).
export default {
  id: 'low_light',
  label: 'Low light',
  shadow: false,
  build(model) {
    const uAngle = { value: 0 };
    const group = meshes(model, part => patchMaterial(ownMaterial(part), {
      key: 'low_light',
      uniforms: { uAngle },
      fragment: /* glsl */`
        vec3 crN = normalize(vCrViewN);
        vec3 crL = normalize(vec3(cos(uAngle), 0.35, sin(uAngle) - 0.6));
        float crRim = pow(1.0 - max(crN.z, 0.0), 2.2) * max(dot(crN, crL), 0.0);
        gl_FragColor.rgb = gl_FragColor.rgb * 0.05 + vec3(1.0, 0.93, 0.85) * crRim * 1.6 * (0.4 + 0.6 * gl_FragColor.rgb);`,
    }));
    group.userData.update = (t, look) => { uAngle.value = (t / look.seconds) * Math.PI * 2; };
    return group;
  },
};
