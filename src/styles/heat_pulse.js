import { meshes } from './shared.js';
import { vertexScalar } from '../core/scalar.js';
import { heatMaterial, referenceFor } from './heatmap.js';

// Heatmap with pulses rippling outward from the area of largest distance.
export default {
  id: 'heat_pulse',
  label: 'Heat pulse',
  build(model, ctx) {
    const { peak } = vertexScalar(model, { reference: referenceFor(model, ctx) });
    const uPeak = { value: peak }, uPhase = { value: 0 }, uWave = { value: model.userData.height * 0.18 };
    const material = heatMaterial('heat_pulse', {
      uniforms: { uPeak, uPhase, uWave },
      fragment: /* glsl */`
        float crD = distance(vCrObj, uPeak) / uWave - uPhase * 3.0;
        float crRing = pow(0.5 + 0.5 * cos(crD * 6.2831853), 8.0);
        gl_FragColor.rgb += vec3(0.45, 0.6, 0.85) * crRing * (0.25 + 0.75 * vScalar);`,
    });
    const group = meshes(model, () => material);
    group.userData.update = (t, look) => { uPhase.value = t / look.seconds; };
    return group;
  },
};
