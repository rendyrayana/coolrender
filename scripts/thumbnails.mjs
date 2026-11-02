// Renders the style gallery thumbnails (public/thumbs/<style>.jpg) from the
// bundled sample model, using the same renderer as the exports.
//   node scripts/thumbnails.mjs            all styles
//   node scripts/thumbnails.mjs ps1 crt    only these
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { openPage, ROOT } from './lib/browser.mjs';
import { STYLE_GROUPS } from '../src/ui/catalog.js';

const SECONDS = 2, FPS = 30;
// Where in the shot each style looks most like itself (0..1); everything else uses the middle.
const AT = {
  texel_step: 0.1, photo_rig: 0.42, stripes: 0.4, depth_noise: 0.12, lidar_sweep: 0.45, point_to_mesh: 0.38,
  pixel_rain: 0.5, print_layers: 0.5, decimate_live: 0.9, uv_unfold: 0.3, filament_snap: 0.7, section_cut: 0.38,
  ar_card: 0.6, museum_vitrine: 0.15, vertex_jitter: 0.1, palette_cycle: 0.45, heat_pulse: 0.3, anchor_glow: 0.5,
};
const VIEW_DEGREES = -32; // a flattering three-quarter view of the teapot

const out = path.join(ROOT, 'public/thumbs');
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(ROOT, 'renders', '.thumb-'));

const { page, close } = await openPage('?batch');
try {
  const ids = await page.evaluate(() => window.coolrender.styleIds());
  const only = process.argv.slice(2);
  for (const id of ids.filter(i => !only.length || only.includes(i))) {
    const at = AT[id] ?? 0.5;
    const frame = Math.round(at * SECONDS * FPS);
    // The turntable has turned by this much at `frame`; start the model rotated so it ends at VIEW_DEGREES.
    const turned = await page.evaluate(([f, s, fps]) => window.coolrender.turnDegrees(f, s, fps), [frame, SECONDS, FPS]);
    await page.evaluate(shot => window.coolrender.loadShot(shot), {
      id, models: ['/sample/teapot.glb'], style: id, seconds: SECONDS, fps: FPS, width: 640, height: 400,
      margin: 0.1, key: 1.15, rim: 1, drift: 0.5, rotate: VIEW_DEGREES - turned,
    });
    const dataUrl = await page.evaluate(f => window.coolrender.frame(f), frame);
    const png = path.join(tmp, `${id}.png`);
    fs.writeFileSync(png, Buffer.from(dataUrl.split(',')[1], 'base64'));
    const r = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', png, '-vf', 'scale=320:200:flags=lanczos', '-q:v', '5', path.join(out, `${id}.jpg`)]);
    if (r.status !== 0) throw new Error(`ffmpeg failed for ${id}`);
    console.log(`${id.padEnd(16)} frame ${frame}`);
  }
  // README gallery: every thumbnail in panel order, 7 per row.
  if (!only.length) {
    const order = STYLE_GROUPS.flatMap(g => g.styles);
    const cols = 7, rows = Math.ceil(order.length / cols);
    const layout = order.map((_, i) => `${(i % cols) * 320}_${Math.floor(i / cols) * 200}`).join('|');
    const inputs = order.flatMap(id => ['-i', path.join(out, `${id}.jpg`)]);
    fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
    const r = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `xstack=inputs=${order.length}:layout=${layout}:fill=0x111111,scale=1600:-1`, '-q:v', '4', path.join(ROOT, 'docs/styles.jpg')]);
    if (r.status !== 0) throw new Error('ffmpeg failed for the gallery');
    console.log(`docs/styles.jpg (${cols}×${rows})`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  await close();
}
