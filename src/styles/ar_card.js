import * as THREE from 'three';
import { meshes, progress, smooth, ownMaterial, seeded } from './shared.js';

// An AR marker card lies on the floor and the model rises out of it.
export default {
  id: 'ar_card',
  label: 'AR card',
  timed: true, // plays once over the shot, so it can't loop seamlessly
  extent: 1.25, // props reach beyond the object
  shadow: false,
  build(model) {
    const { radius: r, height: h } = model.userData;
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // hide what is still below the card
    const body = meshes(model, part => Object.assign(ownMaterial(part), { clippingPlanes: [floor] }));
    const card = new THREE.Mesh(new THREE.BoxGeometry(r * 2.4, r * 0.012, r * 2.4), [
      ...Array(2).fill(new THREE.MeshStandardMaterial({ color: 0xeeeeee })),
      new THREE.MeshStandardMaterial({ map: markerTexture(), roughness: 0.7 }),
      ...Array(3).fill(new THREE.MeshStandardMaterial({ color: 0xeeeeee })),
    ]);
    card.position.y = -r * 0.006;
    const group = new THREE.Group().add(card, body);
    group.userData.update = (t, look) => {
      const p = progress(t, look);
      body.position.y = -h * 1.02 * (1 - smooth(0.08, 0.55, p));
      // The clip plane must stay on the world floor, wherever the item stands.
      group.updateWorldMatrix(true, false);
      floor.constant = -group.getWorldPosition(new THREE.Vector3()).y;
    };
    return group;
  },
};

// White card, thick black border, and a fixed random pattern inside.
function markerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#111'; g.fillRect(48, 48, 416, 416);
  g.fillStyle = '#f2f2f2'; g.fillRect(112, 112, 288, 288);
  const rand = seeded(5);
  g.fillStyle = '#111';
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (rand() > 0.55) g.fillRect(112 + x * 48, 112 + y * 48, 48, 48);
  const t = new THREE.CanvasTexture(c);
  t.userData.disposable = true; // freed when the style is rebuilt
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
