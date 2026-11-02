// PS1 vertex/fragment shaders, taken from lofi-viewer (src/pipeline/shaders.js).
export const PSX_VERT = /* glsl */`
// Snap grid in NDC units per axis: (render size / 2) / snap size in pixels,
// so vertices land on the low-resolution pixel grid like PS1 integer coords.
uniform vec2 uSnapGrid;
uniform bool uVertexSnap;

out vec2 vUv;
out vec3 vAffineUvW; // .xy = uv*w, .z = w  →  div in frag gives affine interp
out vec3 vNormal;
out vec3 vViewPos;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);

  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewPos = -mvPos.xyz;

  gl_Position = projectionMatrix * mvPos;

  if (uVertexSnap) {
    gl_Position.xyz /= gl_Position.w;
    gl_Position.xy = floor(gl_Position.xy * uSnapGrid + 0.5) / uSnapGrid;
    gl_Position.xyz *= gl_Position.w;
  }

  // Pre-multiply UV by clip-W; GPU interpolates this linearly,
  // then dividing by interpolated W in the fragment gives affine UVs.
  vAffineUvW = vec3(uv * gl_Position.w, gl_Position.w);
}
`;

export const PSX_FRAG = /* glsl */`
uniform bool uAffineWarp;
uniform bool uHasMap;
uniform sampler2D map;
uniform vec3 diffuse;
uniform float opacity;
uniform float uExposure;
uniform vec3 ambientLightColor;
uniform vec3 keyLightColor;
uniform vec3 keyLightDir;
uniform bool uFogEnabled;
uniform vec3 uFogColor;
uniform float uFogDensity;

in vec2 vUv;
in vec3 vAffineUvW;
in vec3 vNormal;
in vec3 vViewPos;

out vec4 fragColor;

void main() {
  vec2 texUv = uAffineWarp ? vAffineUvW.xy / vAffineUvW.z : vUv;

  vec4 col = vec4(diffuse, opacity);
  if (uHasMap) col *= texture(map, texUv);

  vec3 normal = normalize(vNormal);
  float NdotL = max(dot(normal, normalize(keyLightDir)), 0.0);
  vec3 light = ambientLightColor + keyLightColor * NdotL;

  vec3 linearCol = col.rgb * light * uExposure;

  // Exponential fog applied in linear space
  if (uFogEnabled && uFogDensity > 0.0) {
    float dist = length(vViewPos);
    float fogFactor = clamp(exp(-uFogDensity * dist), 0.0, 1.0);
    vec3 fogLinear = pow(max(uFogColor, vec3(0.0)), vec3(2.2));
    linearCol = mix(fogLinear, linearCol, fogFactor);
  }

  // Manual sRGB encoding (Three.js skips auto-encoding for GLSL3 out vars)
  vec3 srgbCol = mix(linearCol * 12.92,
                     pow(clamp(linearCol, vec3(0.0031308), vec3(1.0)), vec3(1.0/2.4)) * 1.055 - 0.055,
                     step(vec3(0.0031308), linearCol));
  fragColor = vec4(srgbCol, col.a);
}
`;
