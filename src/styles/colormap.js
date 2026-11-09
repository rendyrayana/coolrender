// Perceptually uniform sequential colour map (viridis): dark at the low end, bright
// at the high end, no rainbow. Eleven stops, blended linearly in linear light.
// crViridis(t) takes t in 0..1 and returns a linear RGB colour.
const STOPS = [
  [68, 1, 84], [72, 36, 117], [65, 68, 135], [53, 95, 141], [42, 120, 142], [33, 144, 141],
  [34, 168, 132], [68, 191, 112], [122, 209, 81], [189, 223, 38], [253, 231, 37],
];

export const VIRIDIS_GLSL = /* glsl */`
  vec3 crViridis(float t) {
    const vec3 stops[11] = vec3[11](${STOPS.map(([r, g, b]) => `vec3(${(r / 255).toFixed(4)}, ${(g / 255).toFixed(4)}, ${(b / 255).toFixed(4)})`).join(', ')});
    float x = clamp(t, 0.0, 1.0) * 10.0;
    int i = int(min(floor(x), 9.0));
    vec3 c = mix(stops[i], stops[i + 1], x - float(i));
    return pow(c, vec3(2.2));
  }
`;
