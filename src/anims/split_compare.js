import { blendAnim } from './blend.js';

// A vertical divider sweeps across: the Style on the left, the Second style
// (or second model) on the right, like lofi-viewer's compare view.
export default blendAnim({
  id: 'split_compare',
  label: 'Split',
  // Divider goes 15% → 85% → 15% of the width over the shot (loop-safe).
  weight: p => 0.5 - 0.35 * Math.cos(p * Math.PI * 2),
  mix: /* glsl */`
    gl_FragColor = uv.x < uW ? a : b;
    float line = 1.0 - smoothstep(0.0, 1.5, abs(uv.x - uW) * uRes.x);
    gl_FragColor = mix(gl_FragColor, vec4(0.94, 0.94, 0.93, 1.0), line * 0.8);`,
});
