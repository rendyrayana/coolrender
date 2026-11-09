import * as THREE from 'three';
import { meshes, ownMaterial } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';
import { prepareDeviation } from '../core/deviation.js';
import { eventDefaults } from '../core/look.js';

// Cool and warm tints for the first and second rescan.
const TINTS = [new THREE.Color('#7fb2ff'), new THREE.Color('#ffb067')];
const FADE_SECONDS = 1;

// The raw model solid, as scanned. The next loaded models (rescans) fade in one
// after the other as translucent ghosts registered on top of it, so drift shows:
// a ghost is only seen where it lies in front of the raw surface, and it is more
// opaque where its deviation (_deviation, millimetres) is larger. Models must share a frame, as the
// ones from scripts/align_scans.py do. look.styleEvents = [first ghost, second ghost]
// fade-in start times in seconds.
export default {
  id: 'ghost_overlay',
  label: 'Ghost overlay',
  perPart: false,
  needsMesh: true,
  timed: true, // the ghosts appear once over the shot
  usesOtherModels: () => true,
  build(model, ctx) {
    const group = new THREE.Group().add(meshes(model, ownMaterial));
    const fades = [];
    ctx.models.filter(m => m !== model).slice(0, TINTS.length).forEach((ghost, k) => {
      prepareDeviation(ghost, { ...ctx, look: { ...ctx.look, heatReference: false } });
      // Both models were recentred separately; map the ghost into the raw model's frame.
      const toRaw = model.userData.transform.clone().multiply(ghost.userData.transform.clone().invert());
      const uFade = { value: 0 }, uMax = { value: ctx.look.heatMax };
      const material = patchMaterial(new THREE.MeshStandardMaterial({
        color: TINTS[k], roughness: 0.6, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }), {
        key: 'ghost_overlay',
        uniforms: { uFade, uMax },
        varyings: 'varying float vDev;',
        vertexHead: 'attribute float aDeviation;',
        vertex: 'vDev = aDeviation;',
        color: 'diffuseColor.a = uFade * mix(0.1, 0.75, smoothstep(0.0, 1.0, vDev / uMax));',
        fragment: /* glsl */`
          float crRim = pow(1.0 - abs(normalize(vCrViewN).z), 2.0);
          gl_FragColor.a = clamp(gl_FragColor.a + crRim * 0.2 * uFade, 0.0, 1.0);
          gl_FragColor.rgb += crRim * 0.2 * uFade;`,
      });
      const layer = new THREE.Group();
      for (const part of ghost.children.filter(c => c.isMesh)) {
        const mesh = new THREE.Mesh(part.geometry.clone().applyMatrix4(toRaw), material);
        mesh.renderOrder = 2;
        layer.add(mesh);
      }
      layer.visible = false;
      group.add(layer);
      fades.push({ uFade, uMax, layer });
    });
    group.userData.update = (t, look) => {
      fades.forEach(({ uFade, uMax, layer }, k) => {
        const start = look.styleEvents[k] ?? eventDefaults(look).ghost[k];
        const p = Math.min(1, Math.max(0, (t - start) / FADE_SECONDS));
        uFade.value = 0.5 - 0.5 * Math.cos(Math.PI * p);
        uMax.value = look.heatMax;
        layer.visible = p > 0;
      });
    };
    return group;
  },
};
