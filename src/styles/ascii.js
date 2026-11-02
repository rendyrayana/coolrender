import * as THREE from 'three';
import { meshes, ownMaterial } from './shared.js';
import { grab, drawPass, passMaterial } from '../core/post.js';

const CHARS = ' .:-=+*#%@';

// Glyph atlas: one row of characters, light to dense.
function atlas() {
  const cell = 32, c = document.createElement('canvas');
  c.width = cell * CHARS.length; c.height = cell;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.font = `bold ${cell * 0.9}px "Space Mono", monospace`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  [...CHARS].forEach((ch, i) => g.fillText(ch, i * cell + cell / 2, cell / 2 + 1));
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

const pass = passMaterial(/* glsl */`
  uniform sampler2D tFrame, tGlyphs;
  uniform vec2 uRes;
  uniform float uCell;
  varying vec2 vUv;
  void main() {
    vec2 px = vUv * uRes;
    vec2 cellId = floor(px / uCell);
    vec4 c = texture2D(tFrame, (cellId + 0.5) * uCell / uRes);
    vec4 bg = texture2D(tFrame, vec2(0.002));
    float l = dot(c.rgb, vec3(0.3, 0.59, 0.11));
    float idx = floor(clamp(sqrt(l) * 1.3, 0.0, 0.999) * ${CHARS.length}.0);
    vec2 inCell = fract(px / uCell);
    float glyph = texture2D(tGlyphs, vec2((idx + inCell.x) / ${CHARS.length}.0, inCell.y)).r;
    // Only object cells become characters; the background stays as it was.
    float isObject = step(0.02, distance(c, bg));
    vec3 ink = min(vec3(1.0), c.rgb / max(l, 0.2) * 0.9);
    vec4 lit = vec4(ink * glyph + bg.rgb * (1.0 - glyph), glyph + bg.a * (1.0 - glyph)); // premultiplied
    gl_FragColor = mix(bg, lit, isObject);
  }`, { tFrame: { value: null }, tGlyphs: { value: null }, uRes: { value: new THREE.Vector2() }, uCell: { value: 12 } });

// The model drawn in characters.
export default {
  id: 'ascii',
  label: 'ASCII',
  shadow: false,
  build: model => meshes(model, ownMaterial),
  render(stage) {
    pass.uniforms.tGlyphs.value ??= atlas();
    stage.renderScene();
    pass.uniforms.tFrame.value = grab(stage.renderer, 'ascii');
    stage.renderer.getDrawingBufferSize(pass.uniforms.uRes.value);
    pass.uniforms.uCell.value = Math.max(6, pass.uniforms.uRes.value.y / 70);
    drawPass(stage.renderer, pass);
  },
};
