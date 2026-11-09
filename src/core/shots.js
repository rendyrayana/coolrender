import { loadModelUrl } from './loaders.js';
import { prepareModel, decimateModel, countTriangles, setZUp, rotateModel, TRI_BUDGET } from './model.js';
import { cleanLook, DEFAULT_LOOK } from './look.js';
import { attachHeat } from './heat.js';
import { attachLayout } from './layout.js';

// shots.json is either an array of shots, or { "defaults": {...}, "shots": [...] }.
// Shot fields: id, models (files in models/, or "/sample/teapot.glb"), style, anim, seconds, bg, loop, plus any look
// setting (fps, resolution, elevation, fov, margin, shadow, sameSize),
// optional width/height in pixels, "up": "z" for Z-up models, "tip" and "rotate" (degrees about x and y; a list gives one value per model),
// "layout": "name.layout.json" or "radial" (explode layout motion), and "heat": "values.csv" (per-vertex values for heatmap styles, in models/).
export function parseShotList(data) {
  const shots = Array.isArray(data) ? data : data.shots ?? [];
  const defaults = Array.isArray(data) ? {} : data.defaults ?? {};
  return shots.map((shot, i) => ({ ...defaults, ...shot, id: shot.id ?? `shot_${i + 1}` }));
}

export function shotLook(shot) {
  const look = { ...DEFAULT_LOOK, ...cleanLook(shot) }; // cleanLook also rounds width/height to even
  // "layout": "radial" (or a list with radial) is the radial Explode mode.
  if ([shot.layout].flat().includes('radial') && shot.explodeMode === undefined) look.explodeMode = 'radial';
  return look;
}

// Loads and prepares a shot's models; heavy models are simplified (batch mode never asks).
export async function loadShotModels(shot, baseUrl, log = () => {}) {
  const models = [];
  for (const [k, name] of (shot.models ?? []).entries()) {
    // Per-model orientation for lineups: "rotate": [180, 270, 0] (one value per model).
    const pick = v => (Array.isArray(v) ? v[k] : v);
    // Names starting with / or http are used as they are (e.g. "/sample/teapot.glb").
    const loaded = await loadModelUrl(/^(\/|https?:)/.test(name) ? name : baseUrl + name);
    loaded.warnings.forEach(w => log(`${name}: ${w}`));
    const model = prepareModel(loaded, name);
    if (pick(shot.up) === 'z') setZUp(model);
    if (pick(shot.tip)) rotateModel(model, 'x', pick(shot.tip)); // e.g. 180 to stand an upside-down scan on its feet
    if (pick(shot.rotate)) rotateModel(model, 'y', pick(shot.rotate));
    // Explode layout: a layout JSON from models/, or "radial" to explode away from the centre.
    const layoutFile = pick(shot.layout);
    if (layoutFile && layoutFile !== 'radial') {
      const res = await fetch(baseUrl + layoutFile);
      if (!res.ok) throw new Error(`Layout file not found: ${layoutFile}`);
      const layout = attachLayout(model, await res.json());
      if (layout.matched < layout.total) log(`${name}: layout matched ${layout.matched} of ${layout.total} parts; unmatched parts stay in place`);
    }
    const heatFile = pick(shot.heat);
    if (heatFile) {
      const res = await fetch(baseUrl + heatFile);
      if (!res.ok) throw new Error(`Heat file not found: ${heatFile}`);
      const { matched, total } = attachHeat(model, await res.text());
      if (!matched) log(`${name}: ${heatFile} doesn't match the model's vertices, so heat styles use other data`);
      else if (matched < total) log(`${name}: ${heatFile} matched ${matched.toLocaleString()} of ${total.toLocaleString()} vertices`);
    }
    const tris = countTriangles(model);
    if (tris > TRI_BUDGET) {
      log(`${name}: ${tris.toLocaleString()} triangles, simplifying to ${TRI_BUDGET.toLocaleString()}`);
      await decimateModel(model);
    }
    models.push(model);
  }
  return models;
}
