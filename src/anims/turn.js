import * as THREE from 'three';
import { spinAngle } from './spin.js';

// A gentle swing from the front view: the model turns by +/- look.swing degrees
// (default 40) in one smooth sine cycle over the shot, so the front stays in view.
// At the start, the middle and the end of the shot the front faces the camera
// exactly, and the clip loops seamlessly.
export const swingAngle = (t, look) => THREE.MathUtils.degToRad(look.swing) * Math.sin((2 * Math.PI * t) / look.seconds);

// Items stand in a row, spaced by their reach, whenever more than one is shown.
export const rowLayout = items => {
  const slot = Math.max(...items.map(i => i.userData.fit?.radius ?? i.userData.radius)) * 2 * 1.2;
  items.forEach((item, k) => item.position.set((k - (items.length - 1) / 2) * slot, 0, 0));
};

// The basic motion. look.turnMode 'full': one 360 degree turn (ease in and out, or
// constant speed with Loop). 'swing': plus and minus look.swing degrees from the front.
// One model or up to four side by side, turning in sync.
export default {
  id: 'turn',
  label: 'Turn',
  maxModels: 4,
  row: true,
  swings: look => look.turnMode === 'swing',
  layout: rowLayout,
  update(items, t, look) {
    const angle = look.turnMode === 'swing' ? swingAngle(t, look) : spinAngle(t, look);
    items.forEach(item => { item.userData.spinner.rotation.y = angle; });
  },
};
