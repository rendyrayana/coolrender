import { meshes, clayMaterial } from './shared.js';
import { vertexScalar } from '../core/scalar.js';
import { patchMaterial } from '../core/shaderPatch.js';

// Clay model with recognition anchors (faces, ritual marks: no-cut zones)
// softly glowing in slate. Anchors come from a CSV of per-vertex values, vertex
// colours, or else the dark carved marks in the scan's texture.
export default {
  id: 'anchor_glow',
  label: 'Anchor glow',
  build(model) {
    vertexScalar(model, { fallback: 'dark' });
    const uPulse = { value: 0 };
    const material = patchMaterial(clayMaterial(), {
      key: 'anchor_glow',
      uniforms: { uPulse },
      varyings: 'varying float vScalar;',
      vertexHead: 'attribute float aScalar;',
      vertex: 'vScalar = aScalar;',
      color: 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.45, 0.6), smoothstep(0.55, 0.8, vScalar));',
      fragment: 'gl_FragColor.rgb += vec3(0.25, 0.4, 0.65) * smoothstep(0.55, 0.85, vScalar) * uPulse;',
    });
    const group = meshes(model, () => material);
    // Two slow pulses per shot, so loops close.
    group.userData.update = (t, look) => { uPulse.value = 0.35 + 0.35 * Math.sin((t / look.seconds) * Math.PI * 4); };
    return group;
  },
};
