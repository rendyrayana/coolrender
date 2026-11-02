import { spinAngle } from './spin.js';

// 2 to 4 models side by side, evenly spaced, rotating in sync.
export default {
  id: 'lineup',
  label: 'Lineup',
  maxModels: 4,
  layout(items) {
    // Even spacing: every slot is as wide as the widest model plus a gap.
    const slot = Math.max(...items.map(i => i.userData.radius)) * 2 * 1.2;
    items.forEach((item, k) => item.position.set((k - (items.length - 1) / 2) * slot, 0, 0));
  },
  update(items, t, look) {
    const angle = spinAngle(t, look);
    items.forEach(item => { item.userData.spinner.rotation.y = angle; });
  },
};
