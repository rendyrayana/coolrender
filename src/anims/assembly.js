import * as THREE from 'three';
import { spinAngle } from './spin.js';

// Shared by explode, exploded_orbit and hand_assembly. Each item's built object
// has one child per part (see core/parts.js); parts move relative to where
// they belong in the assembled model.
export const ease = { out: x => 1 - (1 - x) ** 3, inOut: x => 0.5 - 0.5 * Math.cos(Math.PI * x) };
export const clamp01 = x => Math.min(1, Math.max(0, x));
export const span = (a, b, p) => clamp01((p - a) / (b - a));

// Unit direction from the model's centre to each part's centre, and how far it flies.
export function partInfo(item) {
  if (item.userData.partInfo) return item.userData.partInfo;
  const { model, height } = item.userData;
  const mid = new THREE.Vector3(0, model.userData.height / 2, 0);
  const info = model.children.map((part, i) => {
    const dir = part.userData.center.clone().sub(mid);
    if (dir.lengthSq() < 1e-8) dir.set(Math.cos(i * 2.4), 0.5, Math.sin(i * 2.4));
    return { dir: dir.normalize(), center: part.userData.center, dist: height * 0.55 };
  });
  return (item.userData.partInfo = info);
}

// Turntable spin limited to the last part of the shot (from `start` on).
export function spinAfter(item, t, look, start) {
  const p = t / look.seconds;
  const local = { ...look, seconds: look.seconds * (1 - start), loop: false };
  item.userData.spinner.rotation.y = p < start ? 0 : spinAngle(t - look.seconds * start, local);
}

export const singleLayout = items => items.forEach(item => item.position.set(0, 0, 0));
