// Batch renderer: npm run render -- shots.json [shot_id ...]
// Renders each shot frame by frame in headless Chromium (fixed 1/fps steps,
// never real time), saves renders/<id>/0001.png…, then encodes with ffmpeg:
//   renders/<id>.mp4  H.264, yuv420p, high quality
//   renders/<id>.mov  ProRes 4444 with alpha (transparent shots only)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { openPage, ROOT } from './lib/browser.mjs';

const [shotsArg = 'shots.json', ...only] = process.argv.slice(2);
const shotsFile = path.resolve(shotsArg);
if (!fs.existsSync(shotsFile)) {
  console.error(`Shot list not found: ${shotsFile}`);
  process.exit(1);
}
const outDir = path.join(ROOT, 'renders');
const ffmpeg = process.env.FFMPEG || ffmpegPath;

const { page, close } = await openPage('?batch');
const summary = [];
try {
  const shots = await page.evaluate(data => window.coolrender.parseShotList(data), JSON.parse(fs.readFileSync(shotsFile, 'utf8')));
  for (const shot of shots) {
    if (only.length && !only.includes(shot.id)) continue;
    // The id becomes a folder name that is deleted and rewritten, so keep it plain.
    if (!/^[\w.-]+$/.test(String(shot.id)) || shot.id.includes('..')) {
      console.error(`\n✗ Skipping shot "${shot.id}": ids may only use letters, digits, _ . -`);
      summary.push({ id: String(shot.id), error: 'bad id' });
      continue;
    }
    const t0 = Date.now();
    try {
      console.log(`\n▶ ${shot.id}  (${shot.style ?? 'studio'}, ${shot.anim ?? 'turntable'}, ${shot.models?.join(', ')})`);

      const info = await page.evaluate(s => window.coolrender.loadShot(s), shot);
      info.logs.forEach(l => console.log(`  ${l}`));
      const framesDir = path.join(outDir, shot.id);
      fs.rmSync(framesDir, { recursive: true, force: true });
      fs.mkdirSync(framesDir, { recursive: true });

      for (let i = 0; i < info.frames; i++) {
        const dataUrl = await page.evaluate(n => window.coolrender.frame(n), i);
        fs.writeFileSync(path.join(framesDir, `${String(i + 1).padStart(4, '0')}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
        if (process.stdout.isTTY) process.stdout.write(`\r  frames ${i + 1}/${info.frames}`);
      }
      const tFrames = (Date.now() - t0) / 1000;
      process.stdout.write('\n');

      const input = ['-y', '-loglevel', 'error', '-framerate', String(info.fps), '-i', path.join(framesDir, '%04d.png')];
      const outputs = [];
      const mp4 = path.join(outDir, `${shot.id}.mp4`);
      // A transparent shot's MP4 is flattened onto the dark background.
      const flatten = shot.bg === 'transparent'
        ? ['-f', 'lavfi', '-i', `color=c=0x111111:s=${info.width}x${info.height}:r=${info.fps}`, '-filter_complex', '[1][0]overlay=shortest=1']
        : [];
      run([...input, ...flatten, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
      outputs.push(mp4);
      if (shot.bg === 'transparent') {
        const mov = path.join(outDir, `${shot.id}.mov`);
        run([...input, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', mov]);
        outputs.push(mov);
      }
      const total = (Date.now() - t0) / 1000;
      console.log(`  ${outputs.map(o => path.relative(ROOT, o)).join(', ')}`);
      console.log(`  ${info.frames} frames at ${info.width}×${info.height}, ${info.fps} fps · render ${tFrames.toFixed(1)} s, total ${total.toFixed(1)} s`);
      summary.push({ id: shot.id, outputs, seconds: total });
    } catch (e) {
      console.error(`\n✗ ${shot.id} failed: ${e.message.split('\n')[0]}`);
      summary.push({ id: shot.id, error: e.message.split('\n')[0] });
    }
  }
} finally {
  await close();
}

console.log('\nDone.');
for (const s of summary) {
  if (s.error) console.log(`  ${s.id.padEnd(20)}  FAILED  ${s.error}`);
  else console.log(`  ${s.id.padEnd(20)} ${s.seconds.toFixed(1).padStart(6)} s   ${s.outputs.map(o => path.relative(ROOT, o)).join(', ')}`);
}
if (summary.some(s => s.error)) process.exitCode = 1;

function run(args) {
  const r = spawnSync(ffmpeg, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status})`);
}
