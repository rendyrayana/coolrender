import * as THREE from 'three';
import { meshes } from './shared.js';
import { vertexScalar } from '../core/scalar.js';
import { patchMaterial } from '../core/shaderPatch.js';

// Grey-to-slate ramp for per-vertex values (e.g. Hausdorff distances):
// light grey = close / low, deep slate = far / high.
export const HEAT_RAMP = /* glsl */`
  vec3 crHeat(float v) {
    vec3 a = vec3(0.80, 0.79, 0.77), b = vec3(0.30, 0.38, 0.50), c = vec3(0.05, 0.10, 0.20);
    return v < 0.5 ? mix(a, b, v * 2.0) : mix(b, c, v * 2.0 - 1.0);
  }
`;

// Which model to measure against: another loaded model (by file name), if any.
// The first model is measured against the second; every other one against the first.
export function referenceFor(model, ctx) {
  const others = ctx.models.filter(m => m.name !== model.name);
  if (!others.length) return null;
  return ctx.models[0].name === model.name ? others[0] : ctx.models[0];
}

export function heatMaterial(key, extra = {}) {
  return patchMaterial(new THREE.MeshStandardMaterial({ roughness: 0.75 }), {
    key,
    uniforms: extra.uniforms,
    head: HEAT_RAMP + (extra.head ?? ''),
    varyings: 'varying float vScalar;',
    vertexHead: 'attribute float aScalar;',
    vertex: 'vScalar = aScalar;',
    color: 'diffuseColor.rgb = crHeat(vScalar);',
    fragment: extra.fragment ?? '',
  });
}

// Values come from a CSV dropped with the model (one number per vertex), the
// distance to another loaded model (original vs. rescan), or vertex colours.
export default {
  id: 'heatmap',
  label: 'Heatmap',
  build(model, ctx) {
    vertexScalar(model, { reference: referenceFor(model, ctx) });
    const material = heatMaterial('heatmap');
    return meshes(model, () => material);
  },
};
