import * as THREE from 'three';
import { patchMaterial, GLSL_HASH } from '../core/shaderPatch.js';

// Round point sprite shared by every style that draws points.
let dotTexture;
export function dot() {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

// World-space point size that keeps a surface looking closed but airy.
export function pointSizeFor(model, count) {
  const { height, radius } = model.userData;
  const area = 2 * Math.PI * radius * height + 2 * Math.PI * radius * radius;
  return Math.sqrt(area / Math.max(1, count)) * 1.1;
}

export function pointsMaterial(size, color, vertexColors) {
  return new THREE.PointsMaterial({ size, color, vertexColors, map: dot(), alphaTest: 0.5, sizeAttenuation: true });
}

// Draws a scanned point cloud (e.g. a PLY without faces) as round points.
export function pointsLike(part, model, color) {
  const hasColor = !color && !!part.geometry.attributes.color;
  const size = pointSizeFor(model, part.geometry.attributes.position.count);
  return new THREE.Points(part.geometry, pointsMaterial(size, color ?? (hasColor ? 0xffffff : 0xcfcac2), hasColor));
}

// Small seeded random generator so renders are identical every run.
export function seeded(seed = 1) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shot progress 0..1 and a smoothstep, for styles that change over the shot.
export const progress = (t, look) => Math.min(1, Math.max(0, t / look.seconds));
export const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

export const CLAY_COLOR = 0xd8d6d2;
export const clayMaterial = (color = CLAY_COLOR) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });

// Builds one mesh per model part with a material made by `makeMaterial(part)`.
// Keeping parts 1:1 lets explode-style animations move them.
export function meshes(model, makeMaterial) {
  const group = new THREE.Group();
  for (const part of model.children) {
    group.add(part.isPoints ? pointsLike(part, model) : new THREE.Mesh(part.geometry, makeMaterial(part)));
  }
  return group;
}

// Material that fades in/out with a 4×4 dither (no transparency sorting
// problems). Set the returned uniform's value from 0 (hidden) to 1 (shown).
export function dissolving(material, key) {
  const uReveal = { value: 1 };
  patchMaterial(material, {
    key: `dissolve-${key}`,
    uniforms: { uReveal },
    head: GLSL_HASH,
    discard: 'if (crBayer4(gl_FragCoord.xy) > uReveal) discard;',
  });
  return { material, uReveal };
}

// A copy of a part's own material (so patches don't leak into other styles).
export const ownMaterial = part => (part.material ?? new THREE.MeshStandardMaterial({ color: 0xcfcac2 })).clone();
