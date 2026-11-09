import * as THREE from 'three';
import { swingAngle, rowLayout } from './turn.js';
import { layoutMatrices } from '../core/layout.js';
import { eventDefaults } from '../core/look.js';

const STAGGER = 0.06; // seconds between neighbouring parts
const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
const q = new THREE.Quaternion(), identity = new THREE.Quaternion();

// Parts move from where they are assembled to an exploded position, hold, and
// come back. Where they go (look.explodeMode):
//   layout  the exact positions of a layout file made by scripts/prepare_parts.py
//           (your own hand-arranged exploded view); without one it falls back to radial
//   radial  straight away from the model centre, by 0.6 of the model height
//   lift    the parts rise above each other like a stack, the bottom one staying put
// Each part eases in and out with a small stagger in order of distance from the
// centre (bottom first for lift), so the first part starts and the last part ends
// exactly on the event times. look.motionEvents = [explode start, explode end,
// reassemble start, reassemble end] in seconds (default 15, 40, 60 and 85% of the
// shot). The camera swings from the front like the Turn motion. Models made of
// separate meshes use those as parts; a single scan is split into its loose pieces
// or into blocks. Needs a style that draws one mesh per part.
export default {
  id: 'explode',
  label: 'Explode',
  maxModels: 4,
  row: true,
  swings: true,
  needsPerPart: true,
  needsParts: true,
  timed: true,
  layout(items, look, stage) {
    for (const item of items) {
      const model = item.userData.model;
      const base = model.userData.source ?? model;
      const scale = item.userData.spinner.scale.x;
      const parts = model.children;
      const box = new THREE.Box3();
      parts.forEach(p => { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); });
      const centre = box.getCenter(new THREE.Vector3());
      const height = model.userData.height;

      let mode = look.explodeMode;
      const fromFile = mode === 'layout' ? layoutMatrices(parts, base) : new Map();
      if (mode === 'layout' && !base.userData.layoutFile) {
        stage?.warn?.(`${base.name}: no layout file loaded, so the parts explode away from the centre. Load a .layout.json with the model, or pick another Explode mode.`);
        mode = 'radial';
      } else if (mode === 'layout' && fromFile.size < parts.length) {
        stage?.warn?.(`${base.name}: the layout file matches ${fromFile.size} of ${parts.length} parts. The others stay in place.`);
      }
      const byY = [...parts.keys()].sort((a, b) => parts[a].geometry.boundingBox.getCenter(new THREE.Vector3()).y - parts[b].geometry.boundingBox.getCenter(new THREE.Vector3()).y);

      const state = parts.map((part, i) => {
        const c = part.geometry.boundingBox.getCenter(new THREE.Vector3());
        let m = fromFile.get(i);
        if (mode === 'radial') {
          const dir = c.clone().sub(centre);
          if (dir.lengthSq() < 1e-12) dir.set(Math.cos(i * 2.4), 0.3, Math.sin(i * 2.4));
          m = new THREE.Matrix4().makeTranslation(...dir.normalize().multiplyScalar(height * 0.6));
        } else if (mode === 'lift') {
          m = new THREE.Matrix4().makeTranslation(0, (byY.indexOf(i) / Math.max(1, parts.length - 1)) * height * 0.9, 0);
        }
        m = m ?? new THREE.Matrix4();
        const rot = new THREE.Quaternion(), pos = new THREE.Vector3(), s = new THREE.Vector3();
        m.decompose(pos, rot, s);
        return { m, rot, c, shift: c.clone().applyMatrix4(m).sub(c), order: mode === 'lift' ? byY.indexOf(i) : c.distanceTo(centre) };
      });
      // Rank 0 starts first when exploding.
      [...state.keys()].sort((a, b) => state[a].order - state[b].order).forEach((idx, rank) => { state[idx].rank = rank; });
      item.userData.state = state;

      // The camera fits the largest state, so nothing changes size during the shot.
      const exploded = new THREE.Box3(), corners = [];
      let radius = 0;
      parts.forEach((part, i) => {
        const b = part.geometry.boundingBox;
        for (let k = 0; k < 8; k++) {
          const v = new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z);
          corners.push(v.clone());
          const e = v.applyMatrix4(state[i].m);
          corners.push(e.clone());
          exploded.expandByPoint(e);
          radius = Math.max(radius, Math.hypot(e.x, e.z));
        }
      });
      const all = exploded.clone().union(box);
      radius = Math.max(radius, Math.hypot(Math.max(Math.abs(box.min.x), box.max.x), Math.max(Math.abs(box.min.z), box.max.z)));
      item.userData.fit = {
        yMin: Math.min(0, all.min.y) * scale, yMax: all.max.y * scale, radius: radius * scale,
        corners: corners.map(v => v.multiplyScalar(scale)),
      };
    }
    rowLayout(items);
  },
  update(items, t, look) {
    const defaults = eventDefaults(look).motion;
    const [e0, e1, r0, r1] = [0, 1, 2, 3].map(i => Math.min(look.seconds, look.motionEvents[i] ?? defaults[i]));
    const angle = swingAngle(t, look);
    for (const item of items) {
      item.userData.spinner.rotation.y = angle;
      const state = item.userData.state;
      if (!state) continue;
      const n = state.length;
      const outLen = Math.max(0.2, e1 - e0 - (n - 1) * STAGGER);
      const backLen = Math.max(0.2, r1 - r0 - (n - 1) * STAGGER);
      const built = item.userData.built.children;
      state.forEach((s, i) => {
        // Exploding: first rank first. Reassembling: the last rank first (the explode order in reverse).
        const out = ease((t - (e0 + s.rank * STAGGER)) / outLen);
        const back = ease((t - (r0 + (n - 1 - s.rank) * STAGGER)) / backLen);
        const a = t < r0 ? out : 1 - back;
        const mesh = built[i];
        if (!mesh) return;
        q.copy(identity).slerp(s.rot, a);
        // Turn about the part's own centre while it travels along its displacement.
        mesh.quaternion.copy(q);
        mesh.position.copy(s.c).sub(s.c.clone().applyQuaternion(q)).addScaledVector(s.shift, a);
      });
    }
  },
};
