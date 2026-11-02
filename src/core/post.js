import * as THREE from 'three';

// Screen-space helpers. Frames are first drawn to the canvas as usual (with
// tone mapping and colour conversion), then copied into a texture, so a pass
// works on exactly what would otherwise be shown.

const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false;
const quadScene = new THREE.Scene().add(quad);
const grabs = new Map();

// Copies the canvas into texture `slot` and returns it.
export function grab(renderer, slot = 0) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  let tex = grabs.get(slot);
  if (!tex || tex.image.width !== size.x || tex.image.height !== size.y) {
    tex?.dispose();
    tex = new THREE.FramebufferTexture(size.x, size.y);
    grabs.set(slot, tex);
  }
  renderer.copyFramebufferToTexture(tex);
  return tex;
}

// Draws a full-screen pass to the canvas. Inputs are already display-ready,
// so the material writes colours as they are.
export function drawPass(renderer, material) {
  quad.material = material;
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(quadScene, quadCamera);
}

export function passMaterial(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
}
