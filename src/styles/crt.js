import * as THREE from 'three';
import ps1, { renderPs1 } from './ps1.js';
import { grab, drawPass, passMaterial } from '../core/post.js';

// PS1 render on a CRT: scanlines, slight curvature, glow, colour fringing, vignette.
const pass = passMaterial(/* glsl */`
  uniform sampler2D tFrame;
  uniform vec2 uRes;
  varying vec2 vUv;
  vec2 curve(vec2 uv) {
    vec2 p = uv * 2.0 - 1.0;
    p *= 1.0 + 0.06 * dot(p, p);
    return p * 0.5 + 0.5;
  }
  void main() {
    vec2 uv = curve(vUv);
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec2 px = 1.0 / uRes;
    vec4 c = texture2D(tFrame, uv);
    c.r = texture2D(tFrame, uv + vec2(px.x * 1.5, 0.0)).r;
    c.b = texture2D(tFrame, uv - vec2(px.x * 1.5, 0.0)).b;
    // Cheap glow: average of a few wide taps.
    vec4 glow = (texture2D(tFrame, uv + px * vec2(6.0, 0.0)) + texture2D(tFrame, uv - px * vec2(6.0, 0.0)) +
                 texture2D(tFrame, uv + px * vec2(0.0, 6.0)) + texture2D(tFrame, uv - px * vec2(0.0, 6.0))) * 0.25;
    c.rgb += glow.rgb * 0.25;
    float line = 0.75 + 0.25 * sin(uv.y * uRes.y / 4.5 * 3.14159 * 2.0);
    vec2 v = uv * 2.0 - 1.0;
    float vignette = clamp(1.0 - dot(v, v) * 0.25, 0.0, 1.0);
    c.rgb *= line * vignette;
    gl_FragColor = c;
  }`, { tFrame: { value: null }, uRes: { value: new THREE.Vector2() } });

export default {
  id: 'crt',
  label: 'PS1 on CRT',
  build: (model, ctx) => ps1.build(model, ctx),
  render(stage) {
    renderPs1(stage);
    pass.uniforms.tFrame.value = grab(stage.renderer, 'crt');
    stage.renderer.getDrawingBufferSize(pass.uniforms.uRes.value);
    drawPass(stage.renderer, pass);
  },
};
