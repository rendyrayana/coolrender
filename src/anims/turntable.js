import { spinAngle } from './spin.js';

// One model, one full rotation over the shot.
export default {
  id: 'turntable',
  label: 'Turntable',
  maxModels: 1,
  layout(items) {
    items.forEach(item => item.position.set(0, 0, 0));
  },
  update(items, t, look) {
    const angle = spinAngle(t, look);
    items.forEach(item => { item.userData.spinner.rotation.y = angle; });
  },
};
