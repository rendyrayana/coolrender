import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLook, DEFAULT_LOOK, eventDefaults, advancedDefaults, ADVANCED_KEYS, MOTION_ALIASES, STYLE_ALIASES, outputSize, frameCount } from '../../src/core/look.js';
import { ANIMS } from '../../src/anims/index.js';
import { STYLES } from '../../src/styles/index.js';

test('old motion names map to the new motions', () => {
  assert.deepEqual(cleanLook({ anim: 'turntable' }), { anim: 'turn', turnMode: 'full' });
  assert.deepEqual(cleanLook({ anim: 'swing_row' }), { anim: 'turn', turnMode: 'swing' });
  assert.deepEqual(cleanLook({ anim: 'hand_assembly' }), { anim: 'explode', explodeMode: 'lift' });
  assert.deepEqual(cleanLook({ anim: 'exploded_orbit' }), { anim: 'explode', explodeMode: 'radial' });
  assert.equal(cleanLook({ anim: 'explode_layout' }).anim, 'explode');
});

test('every alias points at something that exists', () => {
  for (const alias of Object.values(MOTION_ALIASES)) assert.ok(ANIMS[alias.anim], alias.anim);
  for (const alias of Object.values(STYLE_ALIASES)) assert.ok(STYLES[alias.style], alias.style);
});

test('old styles keep their settings and an explicit setting wins', () => {
  assert.deepEqual(cleanLook({ style: 'heatmap' }), { style: 'deviation', heatPulse: 'none', heatScale: 'auto' });
  assert.equal(cleanLook({ style: 'heatmap', heatPulse: 'sweep' }).heatPulse, 'sweep');
  assert.equal(cleanLook({ style: 'studio', styleB: 'ascii' }).styleB, 'studio');
});

test('the old single events list goes to the motion or the style', () => {
  assert.deepEqual(cleanLook({ anim: 'explode_layout', events: [1, 3, 5, 7] }).motionEvents, [1, 3, 5, 7]);
  assert.deepEqual(cleanLook({ style: 'deviation', events: [2, 4] }).styleEvents, [2, 4]);
});

test('bad values are clamped or dropped', () => {
  const look = cleanLook({ margin: 9, fov: 0, fps: '30', loop: 'false', swing: 'x', heatMin: 5, heatMax: 1, turnMode: 'spin', seconds: 1000, width: 641, height: 361 });
  assert.equal(look.margin, 0.4);
  assert.equal(look.fov, 5);
  assert.equal(look.fps, 30);
  assert.equal(look.loop, false);
  assert.equal('swing' in look, false);
  assert.equal('heatMin' in look || 'heatMax' in look, false);
  assert.equal('turnMode' in look, false);
  assert.equal(look.seconds, 120);
  assert.deepEqual([look.width, look.height], [642, 362]); // even sizes for H.264
});

test('event defaults follow the shot length', () => {
  const six = eventDefaults({ ...DEFAULT_LOOK, seconds: 6 }).motion;
  assert.deepEqual(six, [0.9, 2.4, 3.6, 5.1]);
  for (const seconds of [1, 2, 6, 20]) for (const t of eventDefaults({ ...DEFAULT_LOOK, seconds }).motion) assert.ok(t <= seconds);
});

test('presets reset the options that only shots set', () => {
  const reset = advancedDefaults();
  for (const k of ADVANCED_KEYS) assert.deepEqual(reset[k], DEFAULT_LOOK[k]);
});

test('output size and frame count', () => {
  assert.deepEqual(outputSize({ resolution: '1080p' }), { width: 1920, height: 1080 });
  assert.deepEqual(outputSize({ width: 640, height: 360, resolution: '4k' }), { width: 640, height: 360 });
  assert.equal(frameCount({ seconds: 6, fps: 30 }), 180);
});
