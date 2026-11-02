// How styles and animations are presented in the panel: tabs, order and the
// one-line descriptions shown as tooltips. A style that is missing from
// STYLE_GROUPS still works, but the panel warns about it in the console.

export const STYLE_GROUPS = [
  { id: 'basics', label: 'Basics', styles: ['studio', 'clay', 'points', 'ps1', 'wire', 'heatmap', 'contour'] },
  { id: 'scanning', label: 'Scanning', styles: ['photo_rig', 'stripes', 'depth_noise', 'lidar_sweep', 'point_to_mesh', 'pixel_rain'] },
  { id: 'analysis', label: 'Analysis', styles: ['heat_pulse', 'ghost_diff', 'anchor_glow', 'section_cut', 'xray', 'print_layers', 'decimate_live', 'uv_unfold', 'texel_step', 'filament_snap', 'palette_cycle'] },
  { id: 'retro', label: 'Retro', styles: ['vertex_jitter', 'crt', 'ascii', 'halftone', 'ink', 'blueprint', 'tilt_shift'] },
  { id: 'staging', label: 'Staging', styles: ['ar_card', 'museum_vitrine', 'mirror_floor', 'low_light'] },
];

export const STYLE_BLURBS = {
  studio: 'Textured, as scanned',
  clay: 'Light-grey and untextured: pure shape',
  points: 'Round points sampled from the surface, in the scan’s colours',
  ps1: 'PS1 look: vertex snapping, affine textures, 15-bit colour',
  wire: 'Clay with a thin wireframe on top',
  heatmap: 'Grey-to-slate ramp of per-vertex values. Drop a CSV with the model, or load two models to compare them',
  contour: 'Topographic slice lines over clay',
  photo_rig: 'Cameras flash around the object, then the mesh appears',
  stripes: 'Structured-light stripes sweep across and build the scan',
  depth_noise: 'Noisy Kinect-style depth points settle into a mesh',
  lidar_sweep: 'A scan line circles the object and leaves points behind',
  point_to_mesh: 'Points connect into triangles, then fill into a surface',
  pixel_rain: 'Texture pixels fall from above and settle onto the surface',
  heat_pulse: 'Heatmap with pulses spreading from the largest difference',
  ghost_diff: 'The original with a shimmering ghost of the second model',
  anchor_glow: 'Clay with carved marks and anchor areas softly glowing',
  section_cut: 'A plane slices in and shows a cross-section',
  xray: 'Translucent glowing shell',
  print_layers: 'Grows bottom-up in 3D-printer layers',
  decimate_live: 'The triangle count drops while the silhouette holds',
  uv_unfold: 'Flattens into its UV atlas and folds back',
  texel_step: 'Texture resolution steps 32 → 256 px',
  filament_snap: 'Colours snap to 8 filament swatches',
  palette_cycle: '16-colour palette cycling (CLUT)',
  vertex_jitter: 'PS1 with strong vertex wobble that settles',
  crt: 'PS1 on a CRT: scanlines, curvature, glow',
  ascii: 'Drawn in characters',
  halftone: 'One-colour print dots on paper',
  ink: 'Black outlines on paper white',
  blueprint: 'White lines on blue, with grid and dimension ticks',
  tilt_shift: 'Shallow depth of field: a miniature look',
  ar_card: 'The model rises out of an AR marker card',
  museum_vitrine: 'A glass case with a top light, then the glass fades away',
  mirror_floor: 'Glossy dark floor reflection',
  low_light: 'Almost black, revealed by a circling rim light',
};

export const ANIM_GROUPS = [
  { label: 'Basic', anims: ['turntable', 'lineup', 'gather'] },
  { label: 'Compare two styles', anims: ['morph', 'split_compare', 'dither_dissolve', 'glitch_cut'] },
  { label: 'Parts', anims: ['explode', 'exploded_orbit', 'hand_assembly'] },
];

export const ANIM_BLURBS = {
  turntable: 'One model, one full turn. Ease-in-out, or constant speed with Loop.',
  lineup: '2 to 4 models side by side, turning in sync.',
  gather: 'Scattered points converge into the object, then drift. Always uses the point cloud style.',
  morph: 'Blends from the style to the second style. With two models loaded, the second style shows the second model.',
  split_compare: 'A divider sweeps across: style on the left, second style on the right. Load two models to compare them instead.',
  dither_dissolve: 'A transition from the style to the second style through a dither pattern.',
  glitch_cut: 'A short RGB-split glitch as the cut from the style to the second style.',
  explode: 'Parts fly in from apart and assemble. Separate meshes are used as parts; a single scan is split into its pieces or 8 blocks.',
  exploded_orbit: 'Parts hover apart, spinning around their own centres, then assemble.',
  hand_assembly: 'Parts arrive one by one, bottom first. Works best with models made of separate meshes.',
};
