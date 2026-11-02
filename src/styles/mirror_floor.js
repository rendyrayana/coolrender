import * as THREE from 'three';
import { meshes, ownMaterial } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';
import { BACKGROUNDS } from '../core/look.js';

// Glossy dark floor: a mirrored copy under the object that fades with depth,
// seen through a tinted floor plane.
export default {
  id: 'mirror_floor',
  label: 'Mirror floor',
  shadow: false,
  build(model, ctx) {
    const { radius: r, height: h } = model.userData;
    const body = meshes(model, ownMaterial);
    const reflection = meshes(model, part => patchMaterial(ownMaterial(part), {
      key: 'mirror_floor',
      uniforms: { uFadeH: { value: h * 0.55 } },
      fragment: 'gl_FragColor.rgb *= 0.55 * (1.0 - smoothstep(0.0, uFadeH, vCrObj.y));',
    }));
    reflection.scale.y = -1;
    const bg = BACKGROUNDS[ctx.look.bg];
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r * 4, 64), new THREE.MeshBasicMaterial({
      color: ctx.look.bg === 'transparent' ? '#000000' : bg.color, transparent: true, opacity: 0.6, depthWrite: false,
      alphaMap: edgeFade(),
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.renderOrder = 1;
    return new THREE.Group().add(body, reflection, floor);
  },
};

// Opaque centre fading to clear at the rim, so the floor has no visible edge.
function edgeFade() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.5, '#fff');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.userData.disposable = true; // freed when the style is rebuilt
  return t;
}
