import * as THREE from 'three';
import { meshes, progress, smooth, ownMaterial } from './shared.js';

// A clipping plane slides in from the front right, shows a clean cross-section
// (solid slate cap) while the object turns, then slides out again. The plane is
// angled 45° toward the camera so the cut face is visible, not edge-on.
export default {
  id: 'section_cut',
  label: 'Section cut',
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model) {
    const r = model.userData.radius;
    const plane = new THREE.Plane(new THREE.Vector3(-1, 0, -1).normalize(), r);
    const cap = new THREE.MeshBasicMaterial({ color: 0x3d5068, side: THREE.BackSide, clippingPlanes: [plane] });
    const group = meshes(model, part => Object.assign(ownMaterial(part), { clippingPlanes: [plane], side: THREE.FrontSide }));
    // Back faces seen through the cut are painted flat: that reads as a solid cap.
    for (const mesh of [...group.children]) if (mesh.isMesh) mesh.add(new THREE.Mesh(mesh.geometry, cap));
    const origin = new THREE.Vector3();
    group.userData.update = (t, look) => {
      const p = progress(t, look);
      const depth = smooth(0.05, 0.35, p) * (1 - smooth(0.7, 0.95, p));
      group.updateWorldMatrix(true, false);
      group.getWorldPosition(origin);
      // Keeps points where dot(normal, p) + constant >= 0; depth 1 cuts through the axis.
      plane.constant = -plane.normal.dot(origin) + r * 1.05 * (1 - depth);
    };
    return group;
  },
};
