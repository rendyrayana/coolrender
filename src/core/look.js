// A "look" is every setting that shapes a render. It is what presets and
// look files store, and what a shot in shots.json can override.

export const RESOLUTIONS = {
  '720p':   { width: 1280, height: 720,  label: '720p', short: '720p' },
  '1080p':  { width: 1920, height: 1080, label: '1080p', short: '1080p' },
  '4k':     { width: 3840, height: 2160, label: '4K', short: '4K' },
  'square': { width: 1080, height: 1080, label: 'Square 1080', short: 'Square' },
};

export const BACKGROUNDS = {
  dark:        { color: '#111111', alpha: 1, label: 'Dark' },
  light:       { color: '#F5F5F5', alpha: 1, label: 'Light' },
  transparent: { color: '#000000', alpha: 0, label: 'Transparent' },
};

export const DEFAULT_LOOK = {
  style: 'studio',
  anim: 'turn',
  turnMode: 'full', // turn: 'full' (one 360 degree turn) or 'swing' (plus and minus `swing` degrees from the front)
  explodeMode: 'layout', // explode: 'layout' (a layout file), 'radial' (away from the centre) or 'lift' (parts drop in from above, bottom first)
  bg: 'dark',
  seconds: 6,
  resolution: '1080p',
  fps: 30,
  loop: false,
  shadow: true,
  elevation: 10,   // degrees above the horizon
  fov: 25,         // vertical field of view, long lens
  margin: 0.12,    // empty space around the object(s), fraction of frame
  sameSize: false, // rows of models: scale every model to the same height
  styleB: 'ps1',   // second style for morph, split compare and transitions
  drift: 0.5,      // point styles: how much the points float (0 = still)
  key: 1,          // key light strength (1 = default)
  rim: 0,          // cool rim light from behind, separates dark objects from the background
  pointCount: 150000, // points style: how many points
  pointSize: 1,    // points style: dot size (1 = default; scales with output resolution)
  pointBright: 1,  // points style: brightness of the point colours
  fillWidth: 0,    // rows of models: spread them to fill this share of the frame width (0 = even spacing)
  swing: 40,       // swing: how far the model turns each way from the front, in degrees
  motionEvents: [], // seconds for the motion: explode start, explode end, reassemble start, reassemble end (empty = defaults)
  styleEvents: [],  // seconds for the style: deviation sweep start and end, ghost overlay first and second ghost (empty = defaults)
  heatMin: 0,      // deviation: value shown as the darkest colour (millimetres)
  heatMax: 4,      // deviation: value shown as the brightest colour; larger values are clamped
  heatScale: 'fixed', // deviation: 'fixed' (heatMin to heatMax) or 'auto' (the 2nd to 98th percentile of the data)
  heatPulse: 'sweep', // deviation: a bright 'sweep' from bottom to top, a 'ripple' from the largest value, or 'none'
  heatReference: false, // deviation: measure against the second loaded model instead of stored values
};

// Settings that only matter for some motions and styles. A preset puts them back to
// their defaults, so one shot's tuning does not carry over.
export const ADVANCED_KEYS = ['turnMode', 'explodeMode', 'fillWidth', 'swing', 'motionEvents', 'styleEvents', 'heatMin', 'heatMax', 'heatScale', 'heatPulse', 'heatReference'];
export const advancedDefaults = () => Object.fromEntries(ADVANCED_KEYS.map(k => [k, DEFAULT_LOOK[k]]));

// Event times used when a look leaves them empty, in seconds for a shot of this length.
export function eventDefaults(look) {
  const t = look.seconds;
  const r = list => list.map(f => Math.round(f * t * 100) / 100);
  return { motion: r([0.15, 0.4, 0.6, 0.85]), deviation: r([0.33, 0.66]), ghost: r([0.1, 0.5]) };
}

// Names from older versions keep working in shot lists, look files and saved settings.
// Extra settings an alias implies are applied unless the look sets them itself.
export const MOTION_ALIASES = {
  turntable: { anim: 'turn', turnMode: 'full' },
  lineup: { anim: 'turn', turnMode: 'full' },
  swing: { anim: 'turn', turnMode: 'swing' },
  swing_row: { anim: 'turn', turnMode: 'swing' },
  explode_layout: { anim: 'explode' },
  exploded_orbit: { anim: 'explode', explodeMode: 'radial' },
  hand_assembly: { anim: 'explode', explodeMode: 'lift' },
};
export const STYLE_ALIASES = {
  ghost_diff: { style: 'ghost_overlay' },
  heatmap: { style: 'deviation', heatPulse: 'none', heatScale: 'auto' },
  heat_pulse: { style: 'deviation', heatPulse: 'ripple', heatScale: 'auto' },
  vertex_jitter: { style: 'ps1' },
  palette_cycle: { style: 'studio' },
  ascii: { style: 'studio' },
};

export const BUILTIN_PRESETS = {
  'Studio dark': { style: 'studio', bg: 'dark', anim: 'turn', turnMode: 'full', loop: false, shadow: true },
  'Clay light':  { style: 'clay', bg: 'light', anim: 'turn', turnMode: 'full', loop: false, shadow: true },
  'Point cloud': { style: 'points', bg: 'dark', anim: 'turn', turnMode: 'full', loop: true, shadow: false, drift: 1 },
};

const LOOK_KEYS = Object.keys(DEFAULT_LOOK);

// Keeps known keys with valid values, so a hand-edited file can't break the app.
export function cleanLook(raw = {}) {
  const input = { ...raw };
  // Old names: fill in what they stand for, without overriding settings given explicitly.
  const motionAlias = MOTION_ALIASES[input.anim];
  if (motionAlias) for (const [k, v] of Object.entries(motionAlias)) if (k === 'anim' || input[k] === undefined) input[k] = v;
  for (const key of ['style', 'styleB']) {
    const alias = STYLE_ALIASES[input[key]];
    if (!alias) continue;
    input[key] = alias.style;
    if (key === 'style') for (const [k, v] of Object.entries(alias)) if (k !== 'style' && input[k] === undefined) input[k] = v;
  }
  // The old single `events` list belonged to whichever of motion or style was using it.
  if (input.events !== undefined) {
    const target = input.anim === 'explode' ? 'motionEvents' : 'styleEvents';
    if (input[target] === undefined) input[target] = input.events;
  }
  const look = {};
  for (const key of LOOK_KEYS) if (input[key] !== undefined) look[key] = input[key];
  const oneOf = (key, values) => { if (look[key] !== undefined && !values.includes(look[key])) delete look[key]; };
  oneOf('turnMode', ['full', 'swing']);
  oneOf('explodeMode', ['layout', 'radial', 'lift']);
  oneOf('heatScale', ['fixed', 'auto']);
  oneOf('heatPulse', ['none', 'sweep', 'ripple']);
  if (look.resolution && !RESOLUTIONS[look.resolution]) delete look.resolution;
  if (look.bg && !BACKGROUNDS[look.bg]) delete look.bg;
  if (look.fps !== undefined && ![24, 30, 60].includes(Number(look.fps))) delete look.fps;
  if (look.seconds !== undefined) look.seconds = Math.min(120, Math.max(1, Number(look.seconds) || 6));
  if (look.fps !== undefined) look.fps = Number(look.fps);
  const clampNum = (key, lo, hi) => { if (look[key] !== undefined) { const v = Number(look[key]); if (Number.isFinite(v)) look[key] = Math.min(hi, Math.max(lo, v)); else delete look[key]; } };
  clampNum('margin', 0, 0.4);
  clampNum('fov', 5, 90);
  clampNum('elevation', -80, 80);
  clampNum('drift', 0, 3);
  clampNum('key', 0, 3);
  clampNum('rim', 0, 3);
  clampNum('pointCount', 5000, 500000);
  clampNum('pointSize', 0.2, 6);
  clampNum('pointBright', 0.2, 4);
  clampNum('fillWidth', 0, 0.95);
  clampNum('swing', 0, 90);
  clampNum('heatMin', -1e6, 1e6);
  clampNum('heatMax', -1e6, 1e6);
  if (look.heatMin !== undefined && look.heatMax !== undefined && look.heatMax <= look.heatMin) { delete look.heatMin; delete look.heatMax; }
  for (const key of ['motionEvents', 'styleEvents']) {
    if (look[key] !== undefined) look[key] = (Array.isArray(look[key]) ? look[key] : []).map(Number).filter(Number.isFinite).slice(0, 4);
  }
  for (const key of ['loop', 'shadow', 'sameSize', 'heatReference']) if (look[key] !== undefined) look[key] = look[key] === true || look[key] === 'true';
  for (const key of ['style', 'styleB', 'anim']) if (look[key] !== undefined && typeof look[key] !== 'string') delete look[key];
  // H.264 needs even sizes.
  for (const key of ['width', 'height']) if (input[key]) look[key] = Math.max(2, Math.round(Number(input[key]) / 2) * 2);
  return look;
}

export function outputSize(look) {
  if (look.width && look.height) return { width: look.width, height: look.height };
  const r = RESOLUTIONS[look.resolution] ?? RESOLUTIONS['1080p'];
  return { width: r.width, height: r.height };
}

export const frameCount = look => Math.max(1, Math.round(look.seconds * look.fps));

export function lookToFile(look) {
  return JSON.stringify({ coolrender: 'look', version: 1, look: cleanLook(look) }, null, 2);
}

export function lookFromFile(text) {
  const data = JSON.parse(text);
  return cleanLook(data.look ?? data);
}
