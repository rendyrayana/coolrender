import * as THREE from 'three';
import { partInfo, spinAfter, singleLayout, ease, span } from './assembly.js';

const q = new THREE.Quaternion(), axis = new THREE.Vector3(), tmp = new THREE.Vector3();

// Parts hover apart and slowly spin around their own centres, then assemble
// and the object turns.
export default {
  id: 'exploded_orbit',
  label: 'Orbit',
  maxModels: 1,
  timed: true,
  needsParts: true,
  spread: 1.5,
  layout: singleLayout,
  update(items, t, look) {
    const p = t / look.seconds;
    for (const item of items) {
      const join = ease.out(span(0.45, 0.72, p));
      partInfo(item).forEach((info, i) => {
        const part = item.userData.built.children[i];
        if (!part) return;
        // Spin about the part's own centre: rotate, then shift so the centre stays put.
        axis.set(Math.sin(i * 1.7), 1, Math.cos(i * 2.3)).normalize();
        q.setFromAxisAngle(axis, (1 - join) * p * Math.PI * 1.5);
        part.quaternion.copy(q);
        tmp.copy(info.center).applyQuaternion(q);
        part.position.copy(info.center).sub(tmp).addScaledVector(info.dir, info.dist * (1 - join));
      });
      spinAfter(item, t, look, 0.75);
    }
  },
};
