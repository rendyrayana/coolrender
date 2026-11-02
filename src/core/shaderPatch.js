// Adds custom GLSL to a built-in three.js material (Standard, Basic, Points…)
// so styles can reveal, cut, colour or move geometry without writing whole shaders.
//
// Varyings available in the fragment code:
//   vCrObj    position in model space (turns with the model)
//   vCrLocal  position in model units, but facing the camera like the world
//             does (origin at the model's base centre, does not turn)
//   vCrViewN  view-space normal
// `color` code runs before lighting and may change diffuseColor (the base colour).
// `varyings` are declared in both shaders. `discard` code runs at the start of the fragment shader, `fragment` code runs
// after lighting and may change gl_FragColor. `vertex` code may change `transformed`.
export function patchMaterial(material, { key, uniforms = {}, head = '', varyings: extraVaryings = '', color = '', vertex = '', vertexHead = '', discard = '', fragment = '' }) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    const uniformDecl = Object.entries(uniforms).map(([name, u]) => `uniform ${glslType(u.value)} ${name};`).join('\n');
    const varyings = `varying vec3 vCrObj;\nvarying vec3 vCrLocal;\nvarying vec3 vCrViewN;\n${extraVaryings}\n`;
    shader.vertexShader = `${uniformDecl}\n${varyings}${head}\n${vertexHead}\n` + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      ${vertex}
      vCrObj = transformed;
      vec4 crW = modelMatrix * vec4(transformed, 1.0);
      vec4 crO = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vCrLocal = (crW.xyz - crO.xyz) / length(modelMatrix[0].xyz);
      vCrViewN = normalMatrix * normal;`);
    shader.fragmentShader = `${uniformDecl}\n${varyings}${head}\n` + shader.fragmentShader
      .replace('void main() {', `void main() {\n${discard}\n`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${color}`)
      .replace('#include <tonemapping_fragment>', `${fragment}\n#include <tonemapping_fragment>`);
  };
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return material;
}

function glslType(v) {
  if (typeof v === 'number') return 'float';
  if (typeof v === 'boolean') return 'bool';
  if (v?.isVector2) return 'vec2';
  if (v?.isVector3 || v?.isColor) return 'vec3';
  if (v?.isVector4) return 'vec4';
  if (v?.isTexture) return 'sampler2D';
  return 'float';
}

// Shared GLSL helpers styles can paste into `head`.
export const GLSL_HASH = /* glsl */`
  float crHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float crBayer4(vec2 p) {
    int i = (int(mod(p.y, 4.0)) * 4) + int(mod(p.x, 4.0));
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[i]) + 0.5) / 16.0;
  }
`;
