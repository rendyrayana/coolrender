import * as THREE from 'three';

// The fixed studio camera: a little above the object, looking at the centre of
// everything on display. The distance makes the whole motion (a full turn is a
// cylinder per model) fit with the requested margin. Pure maths, so it is tested
// without a browser.
//
// items: objects with `position` and `userData` { radius, height, fit? }. An item
// may carry a measured frame in userData.fit (lowest and highest point, widest
// reach and optionally the corner points over its whole motion), so the camera
// fits the largest state and does not change during the shot.
// Rows (more than one item with `row`): with look.fillWidth the group is that share
// of the frame width seen from the front; items are moved sideways accordingly.
export function computeFit({ items, look, aspect, spread = 1, wide = 1, row = false, swings = false }) {
  const extentWide = Math.max(spread, wide);
  let minX = Infinity, maxX = -Infinity, yMin = Infinity, yMax = -Infinity, depth = 0;
  for (const item of items) {
    const fit = item.userData.fit;
    const radius = fit?.radius ?? item.userData.radius;
    const low = fit?.yMin ?? 0;
    const high = low + (fit ? fit.yMax - fit.yMin : item.userData.height) * (1 + (spread - 1) * 0.6);
    minX = Math.min(minX, item.position.x - radius * extentWide);
    maxX = Math.max(maxX, item.position.x + radius * extentWide);
    yMin = Math.min(yMin, low);
    yMax = Math.max(yMax, high);
    depth = Math.max(depth, radius * spread);
  }
  const height = yMax - yMin;
  const elev = THREE.MathUtils.degToRad(look.elevation);
  const center = new THREE.Vector3((minX + maxX) / 2, (yMin + yMax) / 2, 0);
  const halfH = (height / 2) * Math.cos(elev) + depth * Math.sin(elev);
  const halfW = (maxX - minX) / 2;
  const tanV = Math.tan(THREE.MathUtils.degToRad(look.fov) / 2);
  const tanH = tanV * aspect;
  const room = 1 / (1 - 2 * look.margin);
  let dist = Math.max((halfH * room) / tanV, (halfW * room) / tanH) + depth * 0.5;

  if (look.fillWidth && items.length > 1 && row) {
    const swing = swings ? THREE.MathUtils.degToRad(look.swing) : 0;
    const reaches = items.map(item => {
      const corners = item.userData.fit?.corners;
      const radius = item.userData.fit?.radius ?? item.userData.radius;
      if (!corners) return { front: radius, over: radius };
      let front = 0, over = 0;
      for (let a = -swing; a <= swing + 1e-9; a += Math.max(swing / 8, 0.01)) {
        const c = Math.cos(a), s = Math.sin(a);
        for (const v of corners) {
          const x = Math.abs(v.x * c + v.z * s);
          over = Math.max(over, x);
          if (Math.abs(a) < 1e-9) front = Math.max(front, x);
        }
      }
      return { front, over };
    });
    const gap = 0.05 * (reaches.reduce((sum, r) => sum + r.over, 0) / reaches.length);
    const spans = reaches.slice(1).map((r, k) => reaches[k].over + r.over + gap); // centre to centre
    const natural = spans.reduce((a, b) => a + b, 0) + reaches[0].front + reaches[reaches.length - 1].front;
    dist = (halfH * room) / tanV + depth * 0.5;
    const wanted = 2 * dist * tanH * look.fillWidth;
    let extra = 0;
    if (natural <= wanted) extra = (wanted - natural) / (items.length - 1);
    else dist = natural / (look.fillWidth * 2 * tanH);
    let x = -(natural + extra * (items.length - 1)) / 2 + reaches[0].front;
    items.forEach((item, k) => {
      if (k) x += spans[k - 1] + extra;
      item.position.setX(x);
    });
    center.x = 0;
  }
  return {
    position: new THREE.Vector3(center.x, center.y + Math.sin(elev) * dist, Math.cos(elev) * dist),
    target: center,
    near: dist / 100,
    far: dist * 10,
    distance: dist,
  };
}
