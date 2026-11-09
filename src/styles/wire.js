import * as THREE from 'three';
import { clayMaterial } from './shared.js';
import { countTriangles } from '../core/model.js';
import { lowPoly } from '../core/lod.js';

const MAX_TRIS = 15_000; // denser scans become grey mush as a wireframe

// Clay with a thin wireframe on top, to show the mesh structure. Dense scans
// are shown simplified so the triangles stay readable.
export default {
  id: 'wire',
  label: 'Wireframe',
  needsMesh: true,
  build(model) {
    const clay = clayMaterial();
    // Push the surface back a little so the lines don't flicker against it.
    Object.assign(clay, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const lines = new THREE.LineBasicMaterial({ color: 0x3a3a3e, transparent: true, opacity: 0.45 });
    const parts = countTriangles(model) > MAX_TRIS ? lowPoly(model, MAX_TRIS) : model.children.filter(c => c.isMesh);
    const group = new THREE.Group();
    for (const part of parts) {
      const mesh = new THREE.Mesh(part.geometry, clay);
      mesh.add(new THREE.LineSegments(new THREE.WireframeGeometry(part.geometry), lines));
      group.add(mesh);
    }
    return group;
  },
};
