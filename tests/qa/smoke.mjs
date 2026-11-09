// Smoke matrix: renders one frame of every style with every motion on the bundled
// sample, and every style on a generated point cloud and on the sample with a
// transparent background. Fails on any page error, thrown load, or empty frame.
//   npm run qa
import fs from 'node:fs';
import path from 'node:path';
import { openPage, ROOT } from '../../scripts/lib/browser.mjs';

// A small coloured point cloud (a sphere) as PLY, written into models/ for the dev server to serve.
const cloud = path.join(ROOT, 'models/_smoke_cloud.ply');
fs.mkdirSync(path.dirname(cloud), { recursive: true });
{
  const lines = [];
  for (let i = 0; i < 20000; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * 2 * Math.PI, r = Math.sqrt(1 - u * u);
    const x = r * Math.cos(t), y = u, z = r * Math.sin(t);
    lines.push(`${(x * 0.1).toFixed(5)} ${(z * 0.1).toFixed(5)} ${(y * 0.1 + 0.1).toFixed(5)} ${Math.round(128 + 120 * x)} ${Math.round(128 + 120 * y)} ${Math.round(128 + 120 * z)}`);
  }
  fs.writeFileSync(cloud, `ply\nformat ascii 1.0\nelement vertex 20000\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n${lines.join('\n')}\n`);
}

const { page, close } = await openPage('?batch');
const problems = [];
page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 160)}`); });
page.on('pageerror', e => problems.push(`pageerror: ${e.message.slice(0, 160)}`));

try {
  const { styles, anims } = await page.evaluate(async () => {
    const { STYLES } = await import('/src/styles/index.js');
    const { ANIMS } = await import('/src/anims/index.js');
    return { styles: Object.keys(STYLES), anims: Object.keys(ANIMS) };
  });
  const sample = '/sample/teapot.glb';
  const cases = [];
  for (const style of styles) for (const anim of anims) {
    const two = ['morph', 'split_compare', 'dither_dissolve', 'glitch_cut'].includes(anim);
    cases.push({ name: `${style} x ${anim}`, shot: { models: two ? [sample, sample] : [sample], style, anim } });
  }
  for (const style of styles) {
    cases.push({ name: `${style} on a point cloud`, shot: { models: ['_smoke_cloud.ply'], style } });
    cases.push({ name: `${style} on transparent`, shot: { models: [sample], style, bg: 'transparent' } });
  }
  cases.push({ name: 'explode on a point cloud', shot: { models: ['_smoke_cloud.ply'], style: 'studio', anim: 'explode' } });
  cases.push({ name: 'explode radial', shot: { models: [sample], style: 'clay', anim: 'explode', explodeMode: 'radial' } });
  cases.push({ name: 'explode lift', shot: { models: [sample], style: 'clay', anim: 'explode', explodeMode: 'lift' } });
  cases.push({ name: 'ghost overlay with two models', shot: { models: [sample, sample], style: 'ghost_overlay' } });
  cases.push({ name: 'deviation against the second model', shot: { models: [sample, sample], style: 'deviation', heatReference: true } });
  cases.push({ name: 'old names', shot: { models: [sample, sample], style: 'heatmap', anim: 'lineup' } });

  let done = 0;
  for (const { name, shot } of cases) {
    const before = problems.length;
    try {
      const result = await page.evaluate(async s => {
        const info = await window.coolrender.loadShot({ seconds: 2, fps: 12, width: 320, height: 180, ...s });
        const sizes = [0, Math.floor(info.frames / 2), info.frames - 1].map(i => window.coolrender.frame(i).length);
        return { sizes, logs: info.logs };
      }, shot);
      if (Math.max(...result.sizes) < 1500) problems.push(`${name}: the frame is empty`);
    } catch (e) {
      problems.push(`${name}: ${e.message.split('\n')[0]}`);
    }
    for (let i = before; i < problems.length; i++) problems[i] = `${name} -> ${problems[i]}`.replace(`${name} -> ${name}: `, `${name}: `);
    done++;
  }
  console.log(`${done} combinations rendered`);
} finally {
  fs.rmSync(cloud, { force: true });
  await close();
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of [...new Set(problems)].slice(0, 40)) console.error('  ' + p);
  process.exitCode = 1;
} else {
  console.log('no problems');
}
