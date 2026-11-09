import { createStage } from './core/stage.js';
import { parseShotList, shotLook, loadShotModels } from './core/shots.js';
import { frameCount, outputSize } from './core/look.js';
import { STYLES } from './styles/index.js';
import { spinAngle } from './anims/spin.js';

// Headless entry used by scripts/render.mjs: the page exposes window.coolrender
// and the Node script asks it for one frame at a time.
export function startBatch() {
  document.body.innerHTML = '<canvas id="batch"></canvas>';
  const stage = createStage(document.getElementById('batch'));

  window.coolrender = {
    stage, // for debugging in the console
    parseShotList,
    // Helpers for scripts/thumbnails.mjs.
    styleIds: () => Object.keys(STYLES),
    turnDegrees: (frame, seconds, fps) => (spinAngle(frame / fps, { seconds, fps, loop: false }) * 180) / Math.PI,
    async loadShot(shot) {
      const logs = [];
      const models = await loadShotModels(shot, '/models/', m => logs.push(m));
      const look = shotLook(shot);
      const { width, height } = outputSize(look);
      stage.onWarn = m => logs.push(m);
      stage.setSize(width, height);
      stage.configure({ models, look: { width: undefined, height: undefined, ...look } });
      return { frames: frameCount(look), fps: look.fps, width, height, logs };
    },
    // Frame i at exactly i / fps seconds, as a PNG data URL.
    frame(i) {
      stage.setTime(i / stage.look.fps);
      stage.render();
      return stage.renderer.domElement.toDataURL('image/png');
    },
  };
  window.coolrenderReady = true;
}
