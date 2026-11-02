import ps1, { renderPs1 } from './ps1.js';
import { progress, smooth } from './shared.js';

// PS1 look with the vertex wobble exaggerated at first, calming to normal.
let snapScale = 1;
export default {
  id: 'vertex_jitter',
  label: 'PS1 jitter',
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model, ctx) {
    const group = ps1.build(model, ctx);
    group.userData.update = (t, look) => { snapScale = 1 + 4 * (1 - smooth(0.15, 0.75, progress(t, look))); };
    return group;
  },
  render: stage => renderPs1(stage, { snapScale }),
};
