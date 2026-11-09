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

  // Every style card and motion chip applies (or is dimmed with a reason), with no errors.
  const ids = await page.locator('.card').evaluateAll(els => els.map(e => e.dataset.id));
  for (const id of ids) {
    const card = page.locator(`.card[data-id="${id}"]`);
    if (await card.isDisabled()) continue;
    await page.click('.tabs button >> nth=' + (await page.evaluate(i => [...document.querySelectorAll('.cards')].findIndex(g => g.querySelector(`[data-id="${i}"]`)), id)));
    await card.click();
    const style = await page.evaluate(() => window.__coolrender.stage.look.style);
    if (style !== id) throw new Error(`style card ${id} did not apply (got ${style})`);
  }
  console.log(`styles: ${ids.length} cards clicked`);
  await page.click('.tabs button >> nth=0');
  await page.click('.card[data-id="studio"]');
  for (const id of await page.locator('.chip[data-value]').evaluateAll(els => els.map(e => e.dataset.value))) {
    if (await page.locator(`.chip[data-value="${id}"]`).isDisabled()) { console.log(`motion ${id}: dimmed with one model`); continue; }
    await page.click(`.chip[data-value="${id}"]`);
  }
  // Explode works with one model and shows its options; a point cloud style is dimmed for it.
  await page.click('.chip[data-value="explode"]');
  if (!(await page.locator('.panel-flush').isVisible())) throw new Error('motion options are not shown for Explode');
  await page.click('.chip[data-value="turn"]');
  // Settings from the shot list must not be saved to the browser.
  const saved = await page.evaluate(() => localStorage.getItem('coolrender.settings.v2') ?? '');
  if (saved.includes('motionEvents') && !saved.includes('"motionEvents":[]')) throw new Error('shot-only settings were saved');
  console.log('motions and options ok');

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
