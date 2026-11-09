import { spinAngle } from './spin.js';

// Points start scattered, converge into the object, then drift slowly while
// it turns (for intros and outros). Always uses the point cloud style.
export default {
  id: 'gather',
  label: 'Gather',
  maxModels: 4,
  row: true,
  timed: true,
  forceStyle: 'points',
  layout(items) {
    const slot = Math.max(...items.map(i => i.userData.radius)) * 2 * 1.2;
    items.forEach((item, k) => item.position.set((k - (items.length - 1) / 2) * slot, 0, 0));
  },
  update(items, t, look) {
    const p = t / look.seconds;
    const angle = spinAngle(t, { ...look, loop: true }) * 0.25; // a slow quarter turn
    for (const item of items) {
      item.userData.spinner.rotation.y = angle;
      const u = item.userData.built.userData.uniforms;
      if (u) u.uGather.value = Math.min(1, p / 0.6);
    }
  },
};
