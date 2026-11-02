import * as THREE from 'three';
import { meshes, ownMaterial } from './shared.js';
import { vertexScalar } from '../core/scalar.js';
import { patchMaterial } from '../core/shaderPatch.js';
import { referenceFor } from './heatmap.js';

// Original and rescan overlaid: the rescan is a slightly offset, shimmering
// slate ghost that glows where the two differ. Load two models (original
// first); with one model, the ghost is a copy of it.
export default {
  id: 'ghost_diff',
  label: 'Ghost diff',
  build(model, ctx) {
    const solid = meshes(model, ownMaterial);
    const other = referenceFor(model, ctx);
    const ghostModel = other ?? model;
    vertexScalar(ghostModel, { reference: other ? model : null, fallback: 'none' });
    const uShimmer = { value: 0 };
    const ghostMat = patchMaterial(new THREE.MeshBasicMaterial({ color: 0x7f9cc4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), {
      key: 'ghost_diff',
      uniforms: { uShimmer },
      varyings: 'varying float vScalar;',
      vertexHead: 'attribute float aScalar;',
      vertex: 'vScalar = aScalar;',
      fragment: 'gl_FragColor.rgb *= 0.04 + vScalar * (0.5 + 0.5 * uShimmer) + 0.08 * (1.0 - abs(normalize(vCrViewN).z));',
    });
    const ghost = new THREE.Group().add(...ghostModel.children.filter(c => c.isMesh).map(c => new THREE.Mesh(c.geometry, ghostMat)));
    const h = model.userData.height;
    const group = new THREE.Group().add(solid, ghost);
    group.userData.update = (t, look) => {
      const phase = (t / look.seconds) * Math.PI * 2 * 3; // three shimmers per shot, loop-safe
      uShimmer.value = Math.sin(phase);
      ghost.position.set(Math.sin(phase) * h * 0.006, h * 0.004, Math.cos(phase) * h * 0.006);
    };
    return group;
  },
};
