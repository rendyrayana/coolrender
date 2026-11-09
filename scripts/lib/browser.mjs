import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Starts the Vite dev server and a headless Chromium page on it.
// The GPU flags let Chromium use the real GPU when one is available;
// otherwise it falls back to software rendering (slower, same pixels).
export async function openPage(query = '', { video, viewport } = {}) {
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0 } });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const gpu = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({ args: gpu });
  const context = await browser.newContext({ viewport: viewport ?? { width: 1280, height: 720 }, ...(video ? { recordVideo: { dir: video, size: viewport ?? { width: 1280, height: 720 } } } : {}) });
  const page = await context.newPage();
  page.on('pageerror', e => console.error('  page error:', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.text().startsWith('fbx ')) console.error('  browser:', m.text().slice(0, 600)); });
  await page.goto(url + query);
  // Vite may reload once after optimising dependencies on a first run.
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => window.coolrenderReady, null, { timeout: 60000 });
  return {
    page,
    // Closing the context first is what finishes a recorded video file.
    async close() { await context.close(); await browser.close(); await server.close(); },
  };
}
