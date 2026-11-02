import { cloud, drift } from './cloud.js';

// Point cloud sampled from the surface, coloured like the scan, drawn as small
// round dots that float slightly (Drift setting, loop-safe). Point count, size
// and brightness come from the look (pointCount, pointSize, pointBright).
export default {
  id: 'points',
  label: 'Point cloud',
  build(model, ctx) {
    const look = ctx?.look ?? {};
    const points = cloud(model, { count: look.pointCount ?? 150_000, sizeScale: 1.3 * (look.pointSize ?? 1) });
    points.material.color.setScalar(look.pointBright ?? 1); // multiplies the scan colours
    points.userData.update = (t, look) => drift(points, t, look);
    return points;
  },
};
