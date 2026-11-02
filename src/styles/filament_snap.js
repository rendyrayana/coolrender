import * as THREE from 'three';
import { meshes, progress, smooth, ownMaterial, seeded } from './shared.js';
import { patchMaterial } from '../core/shaderPatch.js';

const SWATCHES = 8;

// Colours snap to 8 filament swatches (picked from the texture with k-means),
// and swatch chips pop up beside the object.
export default {
  id: 'filament_snap',
  label: 'Filament colours',
  timed: true, // plays once over the shot, so it can't loop seamlessly
  extent: 1.5, // props reach beyond the object
  build(model) {
    const palette = paletteOf(model);
    const paletteTex = new THREE.DataTexture(new Uint8Array(palette.flatMap(c => [...c.clone().convertLinearToSRGB().toArray().map(v => Math.round(v * 255)), 255])), SWATCHES, 1);
    paletteTex.colorSpace = THREE.SRGBColorSpace;
    paletteTex.needsUpdate = true;
    paletteTex.userData.disposable = true;
    const uSnap = { value: 0 }, uPalette = { value: paletteTex };
    const group = meshes(model, part => patchMaterial(ownMaterial(part), {
      key: 'filament_snap',
      uniforms: { uSnap, uPalette },
      color: /* glsl */`
        vec3 crBest = diffuseColor.rgb; float crD = 1e9;
        for (int i = 0; i < ${SWATCHES}; i++) {
          vec3 c = texture2D(uPalette, vec2((float(i) + 0.5) / ${SWATCHES}.0, 0.5)).rgb;
          float d = distance(c, diffuseColor.rgb);
          if (d < crD) { crD = d; crBest = c; }
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, crBest, uSnap);`,
    }));

    // Chips stand in a column to the right and do not turn with the model.
    const h = model.userData.height, size = h * 0.075;
    const chips = new THREE.Group();
    const chipGeo = new THREE.BoxGeometry(size, size, size * 0.3);
    palette.forEach((color, i) => {
      const chip = new THREE.Mesh(chipGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
      chip.position.set(model.userData.radius * 1.25, h * 0.92 - i * size * 1.45, 0);
      chips.add(chip);
    });
    group.add(chips);
    group.userData.update = (t, look) => {
      const p = progress(t, look);
      uSnap.value = smooth(0.1, 0.35, p);
      chips.rotation.y = -group.parent.rotation.y;
      chips.children.forEach((chip, i) => chip.scale.setScalar(Math.max(1e-3, smooth(0.35 + i * 0.03, 0.42 + i * 0.03, p))));
    };
    return group;
  },
};

// k-means on texture pixels (or material colours), in linear RGB.
function paletteOf(model) {
  const samples = [];
  for (const part of model.children) {
    const img = part.material?.map?.image;
    if (img?.width) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 64, 64);
      const d = g.getImageData(0, 0, 64, 64).data;
      for (let i = 0; i < d.length; i += 4) samples.push(new THREE.Color().setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace));
    } else if (part.material?.color) samples.push(part.material.color.clone());
  }
  if (!samples.length) samples.push(new THREE.Color(0xcfcac2));
  const rand = seeded(3);
  let centers = Array.from({ length: SWATCHES }, () => samples[Math.floor(rand() * samples.length)].clone());
  for (let iter = 0; iter < 12; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      let best = 0, bd = Infinity;
      centers.forEach((c, k) => { const d = (c.r - s.r) ** 2 + (c.g - s.g) ** 2 + (c.b - s.b) ** 2; if (d < bd) { bd = d; best = k; } });
      const sum = sums[best]; sum[0] += s.r; sum[1] += s.g; sum[2] += s.b; sum[3]++;
    }
    centers = centers.map((c, k) => (sums[k][3] ? new THREE.Color(sums[k][0] / sums[k][3], sums[k][1] / sums[k][3], sums[k][2] / sums[k][3]) : c));
  }
  // Dark to light, so the chip column reads as a ramp.
  return centers.sort((a, b) => a.getHSL({}).l - b.getHSL({}).l).reverse();
}
