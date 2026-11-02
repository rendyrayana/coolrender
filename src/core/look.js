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
  anim: 'turntable',
  bg: 'dark',
  seconds: 6,
  resolution: '1080p',
  fps: 30,
  loop: false,
  shadow: true,
  elevation: 10,   // degrees above the horizon
  fov: 25,         // vertical field of view, long lens
  margin: 0.12,    // empty space around the object(s), fraction of frame
  sameSize: false, // lineup: scale every model to the same height
  styleB: 'ps1',   // second style for morph, split compare and transitions
  drift: 0.5,      // point styles: how much the points float (0 = still)
  key: 1,          // key light strength (1 = default)
  rim: 0,          // cool rim light from behind, separates dark objects from the background
  pointCount: 150000, // points style: how many points
  pointSize: 1,    // points style: dot size (1 = default; scales with output resolution)
  pointBright: 1,  // points style: brightness of the point colours
  fillWidth: 0,    // lineup: spread models to fill this share of the frame width (0 = even spacing)
};

export const BUILTIN_PRESETS = {
  'Studio dark': { style: 'studio', bg: 'dark', anim: 'turntable', loop: false, shadow: true },
  'Clay light':  { style: 'clay', bg: 'light', anim: 'turntable', loop: false, shadow: true },
  'Point cloud': { style: 'points', bg: 'dark', anim: 'turntable', loop: true, shadow: false, drift: 1 },
};

const LOOK_KEYS = Object.keys(DEFAULT_LOOK);

// Keeps known keys with valid values, so a hand-edited file can't break the app.
export function cleanLook(input = {}) {
  const look = {};
  for (const key of LOOK_KEYS) if (input[key] !== undefined) look[key] = input[key];
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
  for (const key of ['loop', 'shadow', 'sameSize']) if (look[key] !== undefined) look[key] = look[key] === true || look[key] === 'true';
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
