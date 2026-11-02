import * as THREE from 'three';
import { meshes } from './shared.js';
import { lowPoly } from '../core/lod.js';
import { patchMaterial } from '../core/shaderPatch.js';

const BLUE = '#1e3a5f';

// White lines on slate blue: outline, feature edges, a floor grid and
// dimension lines with ticks (no numbers; labels belong in the edit).
export default {
  id: 'blueprint',
  label: 'Blueprint',
  extent: 1.45, // props reach beyond the object
  background: BLUE,
  shadow: false,
  build(model) {
    const { radius: r, height: h } = model.userData;
    const fill = new THREE.MeshBasicMaterial({ color: '#234570', polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    const outline = patchMaterial(new THREE.MeshBasicMaterial({ color: 0xf0f4ff, side: THREE.BackSide }), {
      key: 'blueprint-outline',
      uniforms: { uWidth: { value: h * 0.004 } },
      vertex: 'transformed += normalize(normal) * uWidth;',
    });
    const lines = new THREE.LineBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.55 });
    const group = meshes(model, () => fill);
    for (const mesh of [...group.children]) if (mesh.isMesh) mesh.add(new THREE.Mesh(mesh.geometry, outline));
    for (const m of lowPoly(model, 6000)) group.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 35), lines));

    // Grid and dimensions stay still while the object turns.
    const fixed = new THREE.Group();
    const grid = new THREE.GridHelper(r * 5, 20, 0x5d7fa8, 0x3d5f88);
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    fixed.add(grid, dimensionLine(new THREE.Vector3(r * 1.3, 0, 0), new THREE.Vector3(r * 1.3, h, 0), h * 0.03),
      dimensionLine(new THREE.Vector3(-r, 0, r * 1.3), new THREE.Vector3(r, 0, r * 1.3), h * 0.03));
    group.add(fixed);
    group.userData.update = () => { fixed.rotation.y = -group.parent.rotation.y; };
    return group;
  },
};

// A measuring line from a to b with end bars and ten small ticks.
function dimensionLine(a, b, tick) {
  const pts = [a, b];
  const dir = b.clone().sub(a);
  const side = Math.abs(dir.y) > 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= 10; i++) {
    const p = a.clone().addScaledVector(dir, i / 10);
    const len = i === 0 || i === 10 ? tick * 1.6 : tick * 0.6;
    pts.push(p.clone().addScaledVector(side, -len), p.clone().addScaledVector(side, len));
  }
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf0f4ff }));
}
