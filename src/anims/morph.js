import { blendAnim, smoothstep } from './blend.js';

// Crossfade from the Style to the Second style (e.g. studio → PS1) while turning.
export default blendAnim({
  id: 'morph',
  label: 'Morph',
  weight: p => smoothstep(0.3, 0.7, p),
  mix: 'gl_FragColor = mix(a, b, uW);',
});
