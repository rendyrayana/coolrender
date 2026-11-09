import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { spinAngle } from '../../src/anims/spin.js';
import { swingAngle } from '../../src/anims/turn.js';
import { computeFit } from '../../src/core/fit.js';
import { attachLayout, layoutMatrices } from '../../src/core/layout.js';
import { parseShotList, shotLook } from '../../src/core/shots.js';
import { ANIMS } from '../../src/anims/index.js';
import { STYLES } from '../../src/styles/index.js';
import { STYLE_GROUPS, STYLE_BLURBS, ANIM_GROUPS, ANIM_BLURBS } from '../../src/ui/catalog.js';
import fs from 'node:fs';

const look = { seconds: 6, fps: 30, swing: 40, loop: false };

test('a full turn lands exactly on 360 degrees (and loops with Loop on)', () => {
  const frames = 180;
  assert.ok(Math.abs(spinAngle((frames - 1) / 30, look) - Math.PI * 2) < 1e-9);
  assert.equal(spinAngle(0, look), 0);
  // With Loop the frame after the last equals frame 0 modulo a full turn.
  const loop = { ...look, loop: true };
  assert.ok(Math.abs(spinAngle(6, loop) - Math.PI * 2) < 1e-9);
});

test('the swing faces the front at the start, the middle and the end, and stays within the limit', () => {
  for (const t of [0, 3, 6]) assert.ok(Math.abs(swingAngle(t, look)) < 1e-9);
  for (let t = 0; t <= 6; t += 0.05) assert.ok(Math.abs(swingAngle(t, look)) <= THREE.MathUtils.degToRad(40) + 1e-9);
  assert.ok(Math.abs(swingAngle(1.5, look) - THREE.MathUtils.degToRad(40)) < 1e-9);
});

const item = (x, radius, height) => ({ position: new THREE.Vector3(x, 0, 0), userData: { radius, height } });
const base = { elevation: 10, fov: 25, margin: 0.12, fillWidth: 0, swing: 40 };

test('the camera fit centres the object and keeps it inside the margin', () => {
  const r = computeFit({ items: [item(0, 0.5, 1)], look: base, aspect: 16 / 9 });
  assert.ok(Math.abs(r.target.x) < 1e-9);
  assert.ok(Math.abs(r.target.y - 0.5) < 1e-9);
  assert.ok(r.distance > 1 && r.position.z > 0);
});

test('a measured fit (exploded frame) is used instead of the model size', () => {
  const plain = computeFit({ items: [item(0, 0.5, 1)], look: base, aspect: 16 / 9 });
  const fitted = item(0, 0.5, 1);
  fitted.userData.fit = { yMin: -0.3, yMax: 1.6, radius: 0.9 };
  const big = computeFit({ items: [fitted], look: base, aspect: 16 / 9 });
  assert.ok(big.distance > plain.distance);
  assert.ok(Math.abs(big.target.y - 0.65) < 1e-9);
});

test('rows are spread to the wanted width without overlapping', () => {
  const items = [item(0, 0.5, 1), item(0, 0.2, 1), item(0, 0.5, 1)];
  const r = computeFit({ items, look: { ...base, fillWidth: 0.8 }, aspect: 16 / 9, row: true });
  const xs = items.map(i => i.position.x);
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2]);
  assert.ok(xs[1] - xs[0] >= 0.5 + 0.2 - 1e-9 && xs[2] - xs[1] >= 0.2 + 0.5 - 1e-9);
  assert.ok(Math.abs(xs[0] + xs[2]) < 0.3); // roughly centred
  assert.ok(r.distance > 0);
});

test('layout files survive reorientation of the model', () => {
  const model = new THREE.Group();
  const part = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  part.name = 'part_01';
  model.add(part);
  model.userData.transform = new THREE.Matrix4();
  const file = { parts: [{ name: 'part_01', matrix: new THREE.Matrix4().makeTranslation(0, 2, 0).transpose().toArray() }] };
  // THREE's Matrix4.set takes row-major; the file stores row-major.
  file.parts[0].matrix = [1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.deepEqual(attachLayout(model, file), { matched: 1, total: 1 });
  const before = layoutMatrices(model.children, model).get(0);
  assert.ok(Math.abs(new THREE.Vector3().setFromMatrixPosition(before).y - 2) < 1e-9);
  // The model is turned by 90 degrees about x afterwards: the displacement must turn with it.
  model.userData.transform = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const after = layoutMatrices(model.children, model).get(0);
  const p = new THREE.Vector3().setFromMatrixPosition(after);
  assert.ok(Math.abs(p.y) < 1e-9 && Math.abs(p.z - 2) < 1e-9, `got ${p.toArray()}`);
});

test('shot lists: defaults merge, ids are filled in, layout radial maps to the explode mode', () => {
  const shots = parseShotList({ defaults: { seconds: 5 }, shots: [{ style: 'clay' }, { id: 'a', layout: 'radial', anim: 'explode_layout' }] });
  assert.equal(shots[0].id, 'shot_1');
  assert.equal(shots[0].seconds, 5);
  assert.equal(shotLook(shots[1]).explodeMode, 'radial');
  assert.equal(shotLook(shots[1]).anim, 'explode');
});

test('the catalog, the style registry and the thumbnails agree', () => {
  const grouped = STYLE_GROUPS.flatMap(g => g.styles);
  assert.deepEqual([...grouped].sort(), Object.keys(STYLES).sort(), 'every style needs exactly one tab');
  for (const id of grouped) {
    assert.ok(STYLE_BLURBS[id], `missing tooltip for ${id}`);
    assert.ok(fs.existsSync(new URL(`../../public/thumbs/${id}.jpg`, import.meta.url)), `missing thumbnail for ${id}`);
  }
  assert.deepEqual(Object.keys(STYLE_BLURBS).sort(), Object.keys(STYLES).sort(), 'tooltips for styles that do not exist');
  const motions = ANIM_GROUPS.flatMap(g => g.anims);
  assert.deepEqual([...motions].sort(), Object.keys(ANIMS).sort());
  for (const id of motions) assert.ok(ANIM_BLURBS[id], `missing description for ${id}`);
});
