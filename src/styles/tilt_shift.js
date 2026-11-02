import * as THREE from 'three';
import { meshes, ownMaterial } from './shared.js';
import { grab, drawPass, passMaterial } from '../core/post.js';

// Fake shallow depth of field: sharp band across the middle, blur growing
// toward top and bottom, plus a little extra saturation. Objects read as miniatures.
const blur = passMaterial(/* glsl */`
  uniform sampler2D tFrame;
  uniform vec2 uDir;
  uniform float uSat, uRadius;
  varying vec2 vUv;
  void main() {
    float amount = smoothstep(0.1, 0.45, abs(vUv.y - 0.5)) * uRadius;
    vec4 c = vec4(0.0); float w = 0.0;
    for (int i = -6; i <= 6; i++) {
      float k = exp(-float(i * i) / 18.0);
      c += texture2D(tFrame, vUv + uDir * float(i) * amount / 6.0) * k;
      w += k;
    }
    c /= w;
    float l = dot(c.rgb, vec3(0.3, 0.59, 0.11));
    c.rgb = mix(vec3(l) * c.a, c.rgb, uSat);
    gl_FragColor = c;
  }`, { tFrame: { value: null }, uDir: { value: new THREE.Vector2() }, uSat: { value: 1 }, uRadius: { value: 9 } });

export default {
  id: 'tilt_shift',
  label: 'Tilt-shift',
  build: model => meshes(model, ownMaterial),
  render(stage) {
    const { renderer } = stage;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    blur.uniforms.uRadius.value = size.y / 70; // same look at any resolution
    stage.renderScene();
    // Two passes: horizontal, then vertical with the saturation boost.
    blur.uniforms.tFrame.value = grab(renderer, 'tilt');
    blur.uniforms.uDir.value.set(1 / size.x, 0);
    blur.uniforms.uSat.value = 1;
    drawPass(renderer, blur);
    blur.uniforms.tFrame.value = grab(renderer, 'tilt');
    blur.uniforms.uDir.value.set(0, 1 / size.y);
    blur.uniforms.uSat.value = 1.25;
    drawPass(renderer, blur);
  },
};
