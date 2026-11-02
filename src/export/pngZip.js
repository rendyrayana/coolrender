import { Zip, ZipPassThrough } from 'fflate';
import { renderFrames } from './frames.js';

// PNG sequence (0001.png, 0002.png, …) in a ZIP. Keeps transparency.
// PNGs are already compressed, so files are stored without recompression.
export async function exportPngZip(stage, { onProgress, signal }) {
  const parts = [];
  const zip = new Zip((err, chunk) => { if (err) throw err; parts.push(chunk); });
  await renderFrames(stage, {
    signal, onProgress,
    onFrame: async (i, canvas) => {
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new ZipPassThrough(`${String(i + 1).padStart(4, '0')}.png`);
      zip.add(file);
      file.push(new Uint8Array(await blob.arrayBuffer()), true);
    },
  });
  zip.end();
  return new Blob(parts, { type: 'application/zip' });
}
