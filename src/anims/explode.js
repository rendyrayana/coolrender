import { partInfo, spinAfter, singleLayout, ease, span } from './assembly.js';

// Parts start apart, assemble (ease-out), hold, then the object turns once.
// Models made of separate meshes use those; a single scan is split into its
// loose pieces, or into 8 blocks.
export default {
  id: 'explode',
  label: 'Explode',
  maxModels: 1,
  timed: true,
  needsParts: true,
  spread: 1.5,
  layout: singleLayout,
  update(items, t, look) {
    const p = t / look.seconds;
    for (const item of items) {
      const apart = 1 - ease.out(span(0.1, 0.5, p));
      partInfo(item).forEach((info, i) => {
        item.userData.built.children[i]?.position.copy(info.dir).multiplyScalar(info.dist * apart);
      });
      spinAfter(item, t, look, 0.6);
    }
  },
};
