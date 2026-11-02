import { loadModelUrl } from './loaders.js';
import { prepareModel, decimateModel, countTriangles, setZUp, rotateModel, TRI_BUDGET } from './model.js';
import { cleanLook, DEFAULT_LOOK } from './look.js';
import { attachHeat } from './heat.js';

// shots.json is either an array of shots, or { "defaults": {...}, "shots": [...] }.
// Shot fields: id, models (files in models/, or "/sample/teapot.glb"), style, anim, seconds, bg, loop, plus any look
// setting (fps, resolution, elevation, fov, margin, shadow, sameSize),
// optional width/height in pixels, "up": "z" for Z-up models, "tip" and "rotate" (degrees about x and y; a list gives one value per model),
// and "heat": "values.csv" (per-vertex values for heatmap styles, in models/).
export function parseShotList(data) {
  const shots = Array.isArray(data) ? data : data.shots ?? [];
  const defaults = Array.isArray(data) ? {} : data.defaults ?? {};
  return shots.map((shot, i) => ({ ...defaults, ...shot, id: shot.id ?? `shot_${i + 1}` }));
}

export function shotLook(shot) {
  return { ...DEFAULT_LOOK, ...cleanLook(shot) }; // cleanLook also rounds width/height to even
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
    if (shot.heat) {
      const { matched, total } = attachHeat(model, await (await fetch(baseUrl + shot.heat)).text());
      if (!matched) log(`${name}: ${shot.heat} doesn't match the model's vertices, so heat styles use other data`);
      else if (matched < total) log(`${name}: ${shot.heat} matched ${matched.toLocaleString()} of ${total.toLocaleString()} vertices`);
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
