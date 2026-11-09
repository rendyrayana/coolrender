// Records the screen demo used in the README: a scripted walk through the app
// (load the sample, try styles and motions, change the look, export), with a
// visible mouse pointer. Writes docs/demo.mp4 and docs/demo.gif.
//   npm run demo
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { openPage, ROOT } from './lib/browser.mjs';

const tmp = fs.mkdtempSync(path.join(ROOT, 'renders', '.demo-'));
const size = { width: 1280, height: 800 };
const { page, close } = await openPage('', { video: tmp, viewport: size });

// A visible pointer: recorded videos do not show the real one.
await page.addInitScript(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const dot = Object.assign(document.createElement('div'), { id: 'demo-pointer' });
    dot.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 0 3px rgba(0,0,0,.35);pointer-events:none;transition:transform .1s;left:0;top:0';
    document.body.append(dot);
    window.addEventListener('mousemove', e => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; });
    window.addEventListener('mousedown', () => { dot.style.transform = 'scale(.7)'; });
    window.addEventListener('mouseup', () => { dot.style.transform = 'scale(1)'; });
  });
});
await page.reload();
await page.waitForFunction(() => window.coolrenderReady);
// The shot list only exists on the dev server; keep it out of the recording.
await page.addStyleTag({ content: '#shot-select { display: none }' });
await page.evaluate(() => [...document.querySelectorAll('.panel')].find(p => p.querySelector('h2')?.textContent === 'Shot list')?.remove());

const pause = ms => page.waitForTimeout(ms);
async function click(selector, wait = 1400) {
  const target = page.locator(selector).first();
  await target.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await pause(500);
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await pause(180);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await pause(wait);
}

try {
  await page.mouse.move(640, 400);
  await pause(1500);
  await click('#empty-sample', 2200);                    // load the sample
  await click('.card[data-id="clay"]');                  // styles
  await click('.card[data-id="points"]');
  await click('.card[data-id="ps1"]');
  await click('.tabs button:has-text("Scanning")', 700);
  await click('.card[data-id="photo_rig"]', 2200);
  await click('.card[data-id="stripes"]', 2000);
  await click('.tabs button:has-text("Analysis")', 700);
  await click('.card[data-id="section_cut"]', 2200);
  await click('.tabs button:has-text("Basics")', 600);
  await click('.card[data-id="studio"]', 900);
  await click('.chip[data-value="turn"]', 500);          // motion: a gentle swing from the front
  await click('.panel-flush .seg button:has-text("Swing")', 3000);
  await click('.swatches button:has-text("Light")', 1600); // background
  await click('.chip:has-text("Studio dark")', 1200);    // quick start look
  await click('#resolution [data-value="720p"]', 600);
  await click('#fps [data-value="24"]', 600);
  await click('#export', 500);                            // export
  await page.waitForSelector('#notices .notice.ok:has-text("Saved")', { timeout: 120000 });
  await pause(2500);
} finally {
  await close();
}

const webm = fs.readdirSync(tmp).find(f => f.endsWith('.webm'));
const source = path.join(tmp, webm);
const docs = path.join(ROOT, 'docs');
const run = args => { const r = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', ...args]); if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.slice(-1)}`); };
run(['-i', source, '-vf', 'fps=30,scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(docs, 'demo.mp4')]);
// GIF for the README: a shared palette keeps it small and clean.
run(['-i', source, '-vf', 'fps=8,scale=640:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5', path.join(docs, 'demo.gif')]);
fs.rmSync(tmp, { recursive: true, force: true });
for (const f of ['demo.mp4', 'demo.gif']) console.log(`docs/${f}  ${(fs.statSync(path.join(docs, f)).size / 1e6).toFixed(1)} MB`);
