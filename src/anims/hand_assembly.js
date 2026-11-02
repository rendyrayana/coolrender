import { partInfo, spinAfter, singleLayout, ease, span } from './assembly.js';

// Parts arrive one by one from above, bottom part first (the build order),
// each settling into place; then the object turns.
export default {
  id: 'hand_assembly',
  label: 'Assembly',
  maxModels: 1,
  timed: true,
  needsParts: true,
  spread: 1.3,
  layout: singleLayout,
  update(items, t, look) {
    const p = t / look.seconds;
    for (const item of items) {
      const info = partInfo(item);
      const order = info.map((x, i) => i).sort((a, b) => info[a].center.y - info[b].center.y);
      const slot = 0.65 / order.length;
      order.forEach((partIndex, k) => {
        const part = item.userData.built.children[partIndex];
        if (!part) return;
        const s = span(0.05 + k * slot, 0.05 + (k + 0.85) * slot, p);
        part.visible = s > 0;
        part.position.set(0, (1 - ease.out(s)) * item.userData.height * 0.8, 0);
      });
      spinAfter(item, t, look, 0.75);
    }
  },
};
