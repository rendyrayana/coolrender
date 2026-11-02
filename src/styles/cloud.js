import * as THREE from 'three';
import { samplePoints, POINT_COUNT } from '../core/sample.js';
import { patchMaterial, GLSL_HASH } from '../core/shaderPatch.js';
import { dot, pointSizeFor } from './shared.js';

// Shared point-cloud builder for every point style (points, gather, lidar_sweep…).
// Each point can scatter (uGather 0 = scattered, 1 = in place) and drift
// (uDrift, a loop-safe float on a 1-shot cycle driven by uPhase). Styles add
// their own GLSL through `extra` (same fields as patchMaterial).
export function cloud(model, { count = POINT_COUNT, sizeScale = 1.3, color = null, extra = {}, key = 'cloud' } = {}) {
  const geo = samplePoints(model, count);
  const n = geo.attributes.position.count;
  const size = pointSizeFor(model, n) * sizeScale;
  const uniforms = {
    uPhase: { value: 0 },
    uDrift: { value: 0 },
    uGather: { value: 1 },
    uScatter: { value: model.userData.height * 1.5 },
    uSize: { value: size },
    ...extra.uniforms,
  };
  const material = new THREE.PointsMaterial({ size, map: dot(), alphaTest: 0.5, vertexColors: !color, color: color ?? 0xffffff, sizeAttenuation: true });
  patchMaterial(material, {
    key: `${key}${color ? '-flat' : ''}`,
    uniforms,
    head: GLSL_HASH + (extra.head ?? ''),
    varyings: 'varying vec4 vRandom;\n' + (extra.varyings ?? ''),
    vertexHead: 'attribute vec4 aRandom;\n' + (extra.vertexHead ?? ''),
    vertex: /* glsl */`
      vRandom = aRandom;
      vec3 crDir = normalize(aRandom.xyz * 2.0 - 1.0 + 1e-4);
      float crG = clamp(uGather * 1.6 - aRandom.w * 0.6, 0.0, 1.0);
      crG = crG * crG * (3.0 - 2.0 * crG);
      transformed = mix(transformed + crDir * uScatter * (0.4 + aRandom.w), transformed, crG);
      transformed += uDrift * sin(6.2831853 * (uPhase + aRandom.xyz));
      ${extra.vertex ?? ''}`,
    discard: extra.discard ?? '',
    fragment: extra.fragment ?? '',
  });
  const points = new THREE.Points(geo, material);
  points.userData.uniforms = uniforms;
  points.userData.driftAmount = model.userData.height * 0.006;
  return points;
}

// Default per-frame update: drift on a loop that closes at the end of the shot.
export function drift(points, t, look) {
  const u = points.userData.uniforms;
  u.uPhase.value = t / look.seconds;
  u.uDrift.value = points.userData.driftAmount * (look.drift ?? 0);
}
