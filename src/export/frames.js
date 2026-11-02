import { frameCount, outputSize } from '../core/look.js';

// Renders every frame of the current shot at exact times (frame / fps), never
// in real time, so slow machines take longer but never drop a frame.
// onFrame(i, canvas) receives the canvas at full output size.
export async function renderFrames(stage, { onFrame, onProgress, signal }) {
  const look = stage.look;
  const { width, height } = outputSize(look);
  const frames = frameCount(look);
  const startTime = stage.time;
  stage.setSize(width, height);
  const started = performance.now();
  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      stage.setTime(i / look.fps);
      stage.render();
      await onFrame(i, stage.renderer.domElement);
      const elapsed = (performance.now() - started) / 1000;
      onProgress?.({ done: i + 1, total: frames, eta: (elapsed / (i + 1)) * (frames - i - 1) });
      // Yield so the progress bar can repaint.
      if (i % 2 === 0) await new Promise(r => setTimeout(r, 0));
    }
  } finally {
    stage.setTime(startTime);
  }
  return { width, height, frames, fps: look.fps };
}
