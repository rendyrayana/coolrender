import { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, QUALITY_VERY_HIGH, canEncodeVideo } from 'mediabunny';
import { renderFrames } from './frames.js';
import { outputSize, BACKGROUNDS } from '../core/look.js';

export const canMakeVideo = () => typeof window.VideoEncoder === 'function';

// format: 'mp4' (H.264) or 'webm' (VP9; keeps transparency, which mediabunny
// encodes as a separate alpha stream when the browser's encoder can't).
export async function exportVideo(stage, format, { onProgress, signal }) {
  if (!canMakeVideo()) throw new Error('This browser cannot make videos. Use Chrome or Edge, or export a PNG sequence instead.');
  const look = stage.look;
  const { width, height } = outputSize(look);
  const alpha = format === 'webm' && look.bg === 'transparent';
  const codec = format === 'mp4' ? 'avc' : 'vp9';
  if (!(await canEncodeVideo(codec, { width, height, quality: QUALITY_VERY_HIGH }))) {
    throw new Error(`This browser cannot encode ${format === 'mp4' ? 'H.264' : 'WebM'} at ${width}×${height}. Try a smaller resolution or export a PNG sequence.`);
  }

  // Frames are drawn onto this canvas first. Without alpha it is filled with
  // the background colour, so MP4 (which has no alpha) shows the dark background.
  const flat = document.createElement('canvas');
  flat.width = width; flat.height = height;
  const ctx = flat.getContext('2d');
  const fill = look.bg === 'transparent' ? BACKGROUNDS.dark.color : BACKGROUNDS[look.bg].color;

  const output = new Output({
    format: format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(flat, { codec, quality: QUALITY_VERY_HIGH, keyFrameInterval: 2, alpha: alpha ? 'keep' : 'discard' });
  output.addVideoTrack(source, { frameRate: look.fps });
  await output.start();

  try {
    await renderFrames(stage, {
      signal, onProgress,
      onFrame: async (i, canvas) => {
        ctx.clearRect(0, 0, width, height);
        if (!alpha) { ctx.fillStyle = fill; ctx.fillRect(0, 0, width, height); }
        ctx.drawImage(canvas, 0, 0);
        await source.add(i / look.fps, 1 / look.fps);
      },
    });
    source.close();
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  }
  return new Blob([output.target.buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
}
