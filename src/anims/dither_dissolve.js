import { blendAnim, smoothstep } from './blend.js';

// Transition: the Style dissolves into the Second style through a 4×4 dither.
export default blendAnim({
  id: 'dither_dissolve',
  label: 'Dissolve',
  weight: p => smoothstep(0.3, 0.7, p),
  // Dither cells scale with the output, about 270 cells tall.
  mix: 'gl_FragColor = crBayer4(floor(gl_FragCoord.xy / max(1.0, uRes.y / 270.0))) < uW ? b : a;',
});
