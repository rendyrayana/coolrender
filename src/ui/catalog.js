// How styles and animations are presented in the panel: tabs, order and the
// one-line descriptions shown as tooltips. A style that is missing from
// STYLE_GROUPS still works, but the panel warns about it in the console.

export const STYLE_GROUPS = [
  { id: 'basics', label: 'Basics', styles: ['studio', 'clay', 'points', 'ps1', 'wire', 'contour'] },
  { id: 'scanning', label: 'Scanning', styles: ['photo_rig', 'stripes', 'depth_noise', 'lidar_sweep', 'point_to_mesh', 'pixel_rain'] },
  { id: 'analysis', label: 'Analysis', styles: ['deviation', 'ghost_overlay', 'anchor_glow', 'section_cut', 'xray', 'print_layers', 'decimate_live', 'uv_unfold', 'texel_step', 'filament_snap'] },
  { id: 'retro', label: 'Retro', styles: ['crt', 'halftone', 'ink', 'blueprint', 'tilt_shift'] },
  { id: 'staging', label: 'Staging', styles: ['ar_card', 'museum_vitrine', 'mirror_floor', 'low_light'] },
];

export const STYLE_BLURBS = {
  studio: 'Textured, as scanned',
  clay: 'Light-grey and untextured: pure shape',
  points: 'Round points sampled from the surface, in the scan’s colours',
  ps1: 'PS1 look: vertex snapping, affine textures, 15-bit colour at a low internal resolution',
  wire: 'Clay with a thin wireframe on top',
  contour: 'Topographic slice lines over clay',
  photo_rig: 'Cameras flash around the object, then the mesh appears',
  stripes: 'Structured-light stripes sweep across and build the scan',
  depth_noise: 'Noisy Kinect-style depth points settle into a mesh',
  lidar_sweep: 'A scan line circles the object and leaves points behind',
  point_to_mesh: 'Points connect into triangles, then fill into a surface',
  pixel_rain: 'Texture pixels fall from above and settle onto the surface',
  deviation: 'Distance to the raw scan on one colour scale (viridis), with a pulse. Uses stored values, a CSV dropped with the model, or a second model',
  ghost_overlay: 'The raw scan solid, with rescans fading in as translucent ghosts so drift becomes visible',
  anchor_glow: 'Clay with carved marks and anchor areas softly glowing',
  section_cut: 'A plane slices in and shows a cross-section',
  xray: 'Translucent glowing shell',
  print_layers: 'Grows bottom-up in 3D-printer layers',
  decimate_live: 'The triangle count drops while the silhouette holds',
  uv_unfold: 'Flattens into its UV atlas and folds back',
  texel_step: 'Texture resolution steps 32 → 256 px',
  filament_snap: 'Colours snap to 8 filament swatches',
  crt: 'PS1 on a CRT: scanlines, curvature, glow',
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
  { label: 'Basic', anims: ['turn', 'gather'] },
  { label: 'Compare two styles', anims: ['morph', 'split_compare', 'dither_dissolve', 'glitch_cut'] },
  { label: 'Parts', anims: ['explode'] },
];

export const ANIM_BLURBS = {
  turn: 'One or more models turning in sync: a full 360 degree turn, or a gentle swing from the front view (Advanced).',
  gather: 'Scattered points converge into the object, then drift. Always uses the point cloud style.',
  morph: 'Blends from the style to the second style. With two models loaded, the second style shows the second model.',
  split_compare: 'A divider sweeps across: style on the left, second style on the right. Load two models to compare them instead.',
  dither_dissolve: 'A transition from the style to the second style through a dither pattern.',
  glitch_cut: 'A short RGB-split glitch as the cut from the style to the second style.',
  explode: 'Parts move out to an exploded view and come back, with a small stagger. Use a layout file for your own arrangement, or explode away from the centre (Advanced).',
};
