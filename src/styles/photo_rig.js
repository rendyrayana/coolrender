import * as THREE from 'three';
import { meshes, progress, smooth, ownMaterial, dissolving } from './shared.js';

const SHOTS = 50;

// Photogrammetry: 50 small cameras orbit the object and flash one by one,
// then the reconstructed mesh appears and the rig fades away.
export default {
  id: 'photo_rig',
  label: 'Photo rig',
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model) {
    const { radius, height: h } = model.userData;
    const reveals = [];
    const surface = meshes(model, part => { const d = dissolving(ownMaterial(part), 'photo_rig'); reveals.push(d.uReveal); return d.material; });

    // Camera frustums on a dome (Fibonacci spiral), each pointing at the object.
    const frustum = frustumGeometry(h * 0.07);
    const rig = new THREE.Group();
    const center = new THREE.Vector3(0, h * 0.45, 0);
    const dome = Math.max(radius, h * 0.6) * 1.15;
    for (let i = 0; i < SHOTS; i++) {
      const y = 0.05 + 0.75 * (i / SHOTS);
      const a = i * 2.39996;
      const r = Math.sqrt(1 - y * y);
      const cam = new THREE.LineSegments(frustum, new THREE.LineBasicMaterial({ color: 0x8a8f98, transparent: true }));
      cam.position.set(Math.cos(a) * r * dome, center.y + y * dome * 0.9, Math.sin(a) * r * dome);
      cam.lookAt(center);
      rig.add(cam);
    }
    const group = new THREE.Group().add(surface, rig);
    group.userData.update = (t, look) => {
      const p = progress(t, look);
      rig.children.forEach((cam, i) => {
        const at = 0.03 + (i / SHOTS) * 0.5;               // when this camera fires
        const flash = Math.max(0, 1 - Math.abs(p - at) / 0.02);
        cam.material.color.setRGB(0.54 + flash * 0.46, 0.56 + flash * 0.44, 0.6 + flash * 0.4);
        cam.material.opacity = smooth(at - 0.06, at - 0.02, p) * (1 - smooth(0.7, 0.85, p));
        cam.scale.setScalar(1 + flash * 0.4);
      });
      reveals.forEach(u => { u.value = smooth(0.5, 0.72, p); });
    };
    return group;
  },
};

// A small pyramid (camera frustum) pointing along -Z, as line segments.
function frustumGeometry(s) {
  const tip = [0, 0, 0], c = [[-1, -0.7], [1, -0.7], [1, 0.7], [-1, 0.7]].map(([x, y]) => [x * s * 0.6, y * s * 0.6, -s]);
  const pts = [];
  for (let i = 0; i < 4; i++) pts.push(tip, c[i], c[i], c[(i + 1) % 4]);
  return new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p)));
}
