import * as THREE from 'three';
import { meshes } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';
import { prepareDeviation, peakPosition } from '../core/deviation.js';
import { eventDefaults } from '../core/look.js';
import { VIRIDIS_GLSL } from './colormap.js';

// Colours the surface by its distance to the raw scan (viridis, dark = low, bright =
// high), with an optional pulse. Values come from scripts/align_scans.py (millimetres),
// from a CSV dropped with the model, or, with "Measure against the second model", from the
// registered distance to that model (see core/deviation.js).
//   look.heatScale  'fixed': look.heatMin to look.heatMax (stored millimetres only), or
//                   'auto': the 2nd to 98th percentile of the values
//   look.heatPulse  'sweep': a bright band from the base to the top between look.styleEvents
//                   [start, end] (default 33% to 66% of the shot); 'ripple': rings spreading
//                   from the largest value; 'none'
export default {
  id: 'deviation',
  label: 'Deviation',
  perPart: true,
  needsMesh: true,
  timed: true, // the sweep plays once over the shot
  usesOtherModels: look => !!look.heatReference,
  build(model, ctx) {
    const { source, range } = prepareDeviation(model, ctx);
    const height = model.userData.height;
    const uMin = { value: 0 }, uMax = { value: 1 };
    const uPulse = { value: -1e6 }, uWidth = { value: height * 0.07 };
    const uMode = { value: 0 }, uPhase = { value: 0 };
    const uPeak = { value: source === 'height' ? new THREE.Vector3() : peakPosition(model) }, uWave = { value: height * 0.18 };
    const material = patchMaterial(new THREE.MeshStandardMaterial({ roughness: 0.75 }), {
      key: 'deviation',
      uniforms: { uMin, uMax, uPulse, uWidth, uMode, uPhase, uPeak, uWave },
      head: VIRIDIS_GLSL,
      varyings: 'varying float vDev;',
      vertexHead: 'attribute float aDeviation;',
      vertex: 'vDev = aDeviation;',
      color: 'diffuseColor.rgb = crViridis((vDev - uMin) / (uMax - uMin));',
      fragment: /* glsl */`
        float crP = 0.0;
        if (uMode > 1.5) {
          float crD = distance(vCrObj, uPeak) / uWave - uPhase * 3.0;
          crP = pow(0.5 + 0.5 * cos(crD * 6.2831853), 8.0) * (0.3 + 0.7 * clamp((vDev - uMin) / (uMax - uMin), 0.0, 1.0));
        } else if (uMode > 0.5) {
          crP = exp(-pow((vCrObj.y - uPulse) / uWidth, 2.0));
        }
        gl_FragColor.rgb = mix(gl_FragColor.rgb * (1.0 + crP * 1.1), vec3(1.0, 0.97, 0.9), crP * 0.28);`,
    });
    const group = meshes(model, () => material);
    group.userData.update = (t, look) => {
      const fixed = source === 'stored' && look.heatScale === 'fixed';
      [uMin.value, uMax.value] = fixed ? [look.heatMin, look.heatMax] : range ?? [0, 1];
      uMode.value = look.heatPulse === 'sweep' ? 1 : look.heatPulse === 'ripple' ? 2 : 0;
      uPhase.value = t / look.seconds;
      const [dStart, dEnd] = eventDefaults(look).deviation;
      const start = look.styleEvents[0] ?? dStart, end = look.styleEvents[1] ?? dEnd;
      const p = Math.min(1, Math.max(0, (t - start) / (end - start)));
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * p);
      // Off the model before and after the sweep.
      uPulse.value = t < start || t > end ? -1e6 : -uWidth.value * 2 + eased * (height + uWidth.value * 4);
    };
    return group;
  },
};
