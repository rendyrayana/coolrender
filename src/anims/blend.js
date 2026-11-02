import * as THREE from 'three';
import { drawPass, passMaterial } from '../core/post.js';
import { spinAngle } from './spin.js';
import { GLSL_HASH } from '../core/shaderPatch.js';

// Builds a two-layer animation: layer A is the Style, layer B the Second style
// (on the second model if one is loaded). Both turn together; `mix` is GLSL
// that sets gl_FragColor from a (layer A), b (layer B), uW (0..1) and uv.
// `weight(p)` gives uW from shot progress p.
export function blendAnim({ id, label, mix, weight, uniforms = {}, extra }) {
  const material = passMaterial(/* glsl */`
    uniform sampler2D tA, tB;
    uniform float uW, uTime;
    uniform vec2 uRes;
    ${Object.keys(uniforms).map(k => `uniform float ${k};`).join('\n')}
    varying vec2 vUv;
    ${GLSL_HASH}
    void main() {
      vec2 uv = vUv;
      vec4 a = texture2D(tA, uv), b = texture2D(tB, uv);
      ${mix}
    }`, { tA: { value: null }, tB: { value: null }, uW: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() }, ...uniforms });

  return {
    id, label, layers: 2, maxModels: 1,
    timed: id !== 'split_compare', // split compare sweeps back, so it loops
    layout(items) { items.forEach(item => item.position.set(0, 0, 0)); },
    update(items, t, look) {
      const angle = spinAngle(t, look);
      items.forEach(item => { item.userData.spinner.rotation.y = angle; });
    },
    composite(stage, a, b, t, look) {
      material.uniforms.tA.value = a;
      material.uniforms.tB.value = b;
      material.uniforms.uW.value = weight(Math.min(1, t / look.seconds));
      material.uniforms.uTime.value = Math.round(t * look.fps);
      stage.renderer.getDrawingBufferSize(material.uniforms.uRes.value);
      extra?.(material.uniforms, t, look);
      drawPass(stage.renderer, material);
    },
  };
}

export const smoothstep = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
