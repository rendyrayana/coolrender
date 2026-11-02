import { blendAnim } from './blend.js';

// A short RGB-split and block glitch as the cut from the Style to the Second style.
export default blendAnim({
  id: 'glitch_cut',
  label: 'Glitch',
  // uW: strength of the glitch, peaking at the cut in the middle of the shot.
  weight: p => Math.max(0, 1 - Math.abs(p - 0.5) / 0.08),
  mix: /* glsl */`
    float row = floor(uv.y * 24.0);
    float seed = crHash(vec3(row, uTime, 1.0));
    float shift = (seed - 0.5) * 0.12 * uW * step(0.6, crHash(vec3(row, uTime, 2.0)));
    vec2 g = vec2(uv.x + shift, uv.y);
    // Before the cut show A, after it B; during the glitch rows pick at random.
    bool useB = (crHash(vec3(row, uTime, 3.0)) < uW ? seed > 0.5 : uAfter > 0.5);
    float split = 0.012 * uW;
    vec4 src = useB ? texture2D(tB, g) : texture2D(tA, g);
    float r = (useB ? texture2D(tB, g + vec2(split, 0.0)) : texture2D(tA, g + vec2(split, 0.0))).r;
    float bl = (useB ? texture2D(tB, g - vec2(split, 0.0)) : texture2D(tA, g - vec2(split, 0.0))).b;
    gl_FragColor = vec4(r, src.g, bl, src.a);`,
  uniforms: { uAfter: { value: 0 } },
  extra(u, t, look) { u.uAfter.value = t / look.seconds >= 0.5 ? 1 : 0; },
});
