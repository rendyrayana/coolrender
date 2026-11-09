import * as THREE from 'three';
import { meshes, progress, smooth, ownMaterial, dissolving } from './shared.js';
import { cloud } from './cloud.js';
import { lowPoly } from '../core/lod.js';

// From data to model: points connect into triangles, then fill into a shaded surface.
export default {
  id: 'point_to_mesh',
  label: 'Points to mesh',
  needsMesh: true,
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model) {
    const uFade = { value: 1 };
    const points = cloud(model, { key: 'point_to_mesh', extra: { uniforms: { uFade }, discard: 'if (vRandom.w > uFade) discard;' } });
    const lines = new THREE.LineBasicMaterial({ color: 0xc8d4e6, transparent: true, opacity: 0, depthWrite: false });
    const wire = new THREE.Group().add(...lowPoly(model, 20_000).map(m => new THREE.LineSegments(new THREE.WireframeGeometry(m.geometry), lines)));
    const reveals = [];
    const surface = meshes(model, part => { const d = dissolving(ownMaterial(part), 'point_to_mesh'); reveals.push(d.uReveal); return d.material; });
    const group = new THREE.Group().add(points, wire, surface);
    group.userData.update = (t, look) => {
      const p = progress(t, look);
      uFade.value = 1 - smooth(0.3, 0.5, p);
      lines.opacity = 0.6 * smooth(0.2, 0.4, p) * (1 - smooth(0.65, 0.85, p));
      reveals.forEach(u => { u.value = smooth(0.5, 0.75, p); });
    };
    return group;
  },
};
