import * as THREE from 'three';
import { PSX_VERT, PSX_FRAG } from './ps1-shaders.js';
import { pointsLike } from './shared.js';

const INTERNAL_HEIGHT = 240; // PS1-era vertical resolution
const COLOR_BITS = 5;        // 5 bits per channel = 15-bit colour

// Shared by every PS1 material, updated once per frame.
const uniforms = {
  uSnapGrid: { value: new THREE.Vector2(160, 120) },
  uVertexSnap: { value: true },
  uAffineWarp: { value: true },
  uExposure: { value: 1.0 },
  ambientLightColor: { value: new THREE.Color(0.55, 0.55, 0.55) },
  keyLightColor: { value: new THREE.Color(0.9, 0.9, 0.9) },
  keyLightDir: { value: new THREE.Vector3(0, 1, 0) },
  uFogEnabled: { value: false },
  uFogColor: { value: new THREE.Color(0, 0, 0) },
  uFogDensity: { value: 0 },
};

function psxMaterial(source) {
  const color = source.color ? source.color.clone() : new THREE.Color(1, 1, 1);
  // A copy shares the image but keeps the scan's own texture smooth for other styles.
  const map = source.map ? source.map.clone() : null;
  if (map) map.userData.disposable = true;
  if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter; map.needsUpdate = true; }
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: PSX_VERT,
    fragmentShader: PSX_FRAG,
    uniforms: {
      ...uniforms,
      map: { value: map },
      uHasMap: { value: !!map },
      diffuse: { value: color },
      opacity: { value: 1 },
    },
  });
}

// Upscale pass: nearest-neighbour blow-up of the low-res frame with 15-bit
// quantisation and 4×4 ordered dither (as in lofi-viewer's dither pass).
const blitMaterial = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uLevels: { value: 2 ** COLOR_BITS - 1 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uLevels;
    varying vec2 vUv;
    float bayer4(ivec2 p) {
      int i = (p.y & 3) * 4 + (p.x & 3);
      int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
      return float(m[i]) / 16.0;
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      ivec2 cell = ivec2(vUv * vec2(textureSize(tDiffuse, 0)));
      c.rgb += (bayer4(cell) - 0.5) / uLevels;
      c.rgb = floor(clamp(c.rgb, 0.0, 1.0) * uLevels + 0.5) / uLevels;
      gl_FragColor = vec4(c.rgb * c.a, c.a); // premultiplied, so transparent stays clean
    }`,
  depthTest: false,
  depthWrite: false,
  premultipliedAlpha: true,
  blending: THREE.NoBlending,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMaterial);
quad.frustumCulled = false;
const quadScene = new THREE.Scene().add(quad);
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
let target = null;

// PS1 look from lofi-viewer: vertex snapping, affine texture mapping,
// 15-bit colour and a low internal resolution.
export default {
  id: 'ps1',
  label: 'PS1',
  build(model) {
    const group = new THREE.Group();
    for (const part of model.children) {
      group.add(part.isPoints ? pointsLike(part, model) : new THREE.Mesh(part.geometry, psxMaterial(part.material)));
    }
    return group;
  },

  render: stage => renderPs1(stage),
};

// Exported so variations (vertex_jitter, crt) can reuse it.
// snapScale > 1 makes the vertex grid coarser, so vertices wobble more.
export function renderPs1(stage, { snapScale = 1 } = {}) {
  const { renderer, scene, camera } = stage;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const h = INTERNAL_HEIGHT, w = Math.max(1, Math.round(h * size.x / size.y));
  if (!target || target.width !== w || target.height !== h) {
    target?.dispose();
    target = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  }
  uniforms.uSnapGrid.value.set(w / 2 / snapScale, h / 2 / snapScale);
  // The PS1 shader lights in view space with the key light only.
  uniforms.keyLightDir.value.copy(stage.keyLight.position).normalize().transformDirection(camera.matrixWorldInverse);

  // The low-res target holds display-ready (sRGB) values, since the PS1 shader
  // encodes its own output; give it the background colour in sRGB too.
  const clear = renderer.getClearColor(new THREE.Color());
  const alpha = renderer.getClearAlpha();
  renderer.setClearColor(clear.clone().convertLinearToSRGB(), alpha);
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, alpha);
  blitMaterial.uniforms.tDiffuse.value = target.texture;
  renderer.clear();
  renderer.render(quadScene, quadCamera);
}
