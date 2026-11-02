// End-to-end check of the browser app, as a normal user would use it: open the
// bundled sample, pick "Point cloud", export MP4, PNG zip and transparent WebM.
// Optionally also checks the friendly messages for a heavy model and one with
// a missing texture, and always for an unsupported file.
//   npm test
//   node tests/ui.mjs <out-dir> [heavy.obj heavy.jpg] [no-texture.obj [no-texture.mtl]]
import path from 'node:path';
import fs from 'node:fs';
import { openPage } from '../scripts/lib/browser.mjs';

const [outDir = 'renders/test', heavyObj, heavyTex, ...bareObj] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const { page, close } = await openPage('');
page.on('console', m => ['error', 'warning'].includes(m.type()) && console.log('  console:', m.text()));
const notices = () => page.locator('#notices').innerText();
try {
  await page.setInputFiles('#file-input', 'public/sample/teapot.glb');
  await page.waitForSelector('#model-list li');
  await page.click('.chip:has-text("Point cloud")');
  await page.click('#format [data-value=mp4]');
  const t0 = Date.now();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.click('#export')]);
  const file = path.join(outDir, download.suggestedFilename());
  await download.saveAs(file);
  console.log(`export: ${file} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`notice: ${await notices()}`);

  // PNG sequence and transparent WebM, 1 second each.
  await page.fill('#seconds', '1');
  await page.press('#seconds', 'Enter');
  await page.click('#bg [data-value=transparent]');
  for (const format of ['png', 'webm']) {
    await page.click(`#format [data-value=${format}]`);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.click('#export')]);
    const f = path.join(outDir, dl.suggestedFilename());
    await dl.saveAs(f);
    console.log(`export: ${f} (${(fs.statSync(f).size / 1e6).toFixed(1)} MB)`);
  }

  if (heavyObj) {
    await page.setInputFiles('#file-input', [heavyObj, heavyTex]);
    await page.waitForSelector('.notice.warn', { timeout: 120000 });
    console.log(`heavy: ${await notices()}`);
    await page.screenshot({ path: path.join(outDir, 'heavy.png') });
    await page.click('text=Simplify to 300k');
    await page.waitForSelector('text=simplified to', { timeout: 120000 });
    console.log(`after simplify: ${await page.locator('#model-list').innerText()}`);
  }
  if (bareObj.length) {
    await page.setInputFiles('#file-input', bareObj);
    await page.waitForSelector('.notice.warn', { timeout: 120000 });
    console.log(`missing texture: ${await notices()}`);
    await page.screenshot({ path: path.join(outDir, 'missing.png') });
  }
  await page.setInputFiles('#file-input', { name: 'scan.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await page.waitForSelector('.notice.error');
  console.log(`unsupported: ${await notices()}`);
} catch (e) {
  console.log(`FAILED: ${e.message.split('\n')[0]}\nnotices: ${await notices()}`);
  process.exitCode = 1;
} finally {
  await close();
}
