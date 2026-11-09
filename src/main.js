import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStage } from './core/stage.js';
import { groupFiles, loadModelFile, loadModelUrl, FriendlyError } from './core/loaders.js';
import { prepareModel, countTriangles, decimateModel, rotateModel, setZUp, setYUp, recenter, disposeModel, TRI_BUDGET } from './core/model.js';
import { DEFAULT_LOOK, BUILTIN_PRESETS, advancedDefaults, cleanLook, outputSize, lookToFile, lookFromFile } from './core/look.js';
import { parseShotList, shotLook, loadShotModels } from './core/shots.js';
import { attachHeat } from './core/heat.js';
import { attachLayout } from './core/layout.js';
import { lodReady } from './core/lod.js';
import { ANIMS } from './anims/index.js';
import { exportVideo } from './export/video.js';
import { exportPngZip } from './export/pngZip.js';
import { createSidebar } from './ui/sidebar.js';
import { startBatch } from './batch.js';

// v2: v1 also held settings that only shot lists could set, which then leaked into later visits.
const STORE_KEY = 'coolrender.settings.v2';

function startApp() {
  const $ = id => document.getElementById(id);
  const viewport = $('viewport');
  let stage;
  try {
    stage = createStage($('canvas'));
  } catch (e) {
    console.error(e);
    $('empty').classList.add('fatal');
    $('empty').querySelector('.empty-title').textContent = 'The 3D preview could not start';
    $('empty').querySelector('.empty-sub').textContent = 'coolrender needs WebGL. Try a recent Chrome, Edge, Firefox or Safari, and check that hardware acceleration is on.';
    return;
  }

  // Settings are remembered between visits; a broken or old entry is ignored.
  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; } })();
  stage.setLook({ ...DEFAULT_LOOK, ...cleanLook(saved?.look) });
  stage.onWarn = message => notify('warn', message);
  const saveSettings = () => {
    try {
      const { width, height, ...look } = stage.look; // custom sizes come from shots and are not kept
      localStorage.setItem(STORE_KEY, JSON.stringify({ look, format: sidebar.format }));
    } catch { /* storage can be blocked; the app works without it */ }
  };

  // Orbiting is only for inspecting the model; exports always use the studio camera.
  const controls = new OrbitControls(stage.camera, $('canvas'));
  controls.enableDamping = true;
  controls.enablePan = false;
  let cameraMoved = false;
  controls.addEventListener('start', () => { cameraMoved = true; stage.holdCamera = true; $('cam-hint').hidden = false; });
  function resetCamera() {
    stage.holdCamera = false;
    stage.resetCamera();
    controls.target.copy(stage.target);
    controls.update();
    cameraMoved = false;
    $('cam-hint').hidden = true;
  }

  let playing = true;
  let exporting = null; // AbortController while an export runs
  const canVideo = typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';

  // ── Notices: friendly messages instead of crashes ───────────────────────────
  function notify(kind, text, actions = []) {
    const box = document.createElement('div');
    box.className = `notice ${kind}`;
    const p = document.createElement('div');
    p.textContent = text;
    const row = document.createElement('div');
    row.className = 'notice-actions';
    for (const [label, fn, primary] of [...actions, ['Dismiss', () => {}]]) {
      const b = document.createElement('button');
      b.className = `btn btn-small${primary ? ' btn-primary' : ''}`;
      b.type = 'button';
      b.textContent = label;
      b.onclick = () => { box.remove(); fn(); };
      row.append(b);
    }
    box.append(p, row);
    $('notices').append(box);
    if (kind === 'ok') setTimeout(() => box.remove(), 6000);
    return box;
  }
  const clearNotices = () => { $('notices').innerHTML = ''; };
  window.addEventListener('error', e => {
    if (!e.message?.includes('ResizeObserver')) notify('error', `Something went wrong: ${e.message}`);
  });
  window.addEventListener('unhandledrejection', e => notify('error', `Something went wrong: ${e.reason?.message ?? e.reason}`));

  // ── Settings panel ──────────────────────────────────────────────────────────
  const sidebar = createSidebar($('sidebar'), {
    look: changes => setLook(changes),
    preset: name => setLook({ ...advancedDefaults(), ...BUILTIN_PRESETS[name] }),
    format: saveSettings,
    saveLook: () => download(new Blob([lookToFile(stage.look)], { type: 'application/json' }), 'look.json'),
    loadLook: () => { $('look-input').value = ''; $('look-input').click(); },
    orient: kind => ({
      yUp: () => orient(setYUp),
      zUp: () => orient(setZUp),
      tip: () => orient(m => rotateModel(m, 'x', 90)),
      turn: () => orient(m => rotateModel(m, 'y', 90)),
      fit: () => orient(recenter),
    })[kind](),
    open: append => openFiles(append),
    sample: () => loadSample(),
    remove: i => setModels(stage.models.filter((_, k) => k !== i)),
    shot: i => loadShot(i),
    export: () => runExport(),
    cancel: () => exporting?.abort(),
  });
  if (saved?.format) sidebar.format = saved.format;

  // persist: false for looks that come from a shot list, which are not the user's own settings.
  function setLook(changes, { persist = true } = {}) {
    if (exporting) return; // the export reads the look frame by frame
    // Custom sizes from a shot only apply until a resolution is picked again.
    const clear = changes.resolution ? { width: undefined, height: undefined } : {};
    stage.setLook({ ...clear, ...changes });
    if (!cameraMoved) resetCamera();
    layoutFrame();
    syncUi();
    if (persist) saveSettings();
  }

  function syncUi() {
    const look = stage.look;
    const shown = stage.visibleModels();
    const max = ANIMS[look.anim].maxModels;
    sidebar.sync({
      look, canVideo, exporting: !!exporting, shownCount: shown.length,
      hasLayout: stage.models.some(m => m.userData.layoutFile),
      models: stage.models.map(m => ({
        name: m.name, tris: countTriangles(m), hidden: !shown.includes(m), isPointCloud: !!m.userData.isPointCloud,
        hiddenReason: max === 1 ? 'Hidden: this motion shows one model.' : `Hidden: this motion shows up to ${max} models, or the style uses this model on its own as a comparison.`,
      })),
    });
    $('filename-badge').textContent = stage.models.map(m => m.name).join(', ');
    $('empty').hidden = stage.models.length > 0;
    viewport.classList.toggle('is-empty', stage.models.length === 0);
    $('frame').classList.toggle('transparent', look.bg === 'transparent');
  }

  // ── Models ──────────────────────────────────────────────────────────────────
  function setModels(models) {
    if (exporting) return;
    const old = stage.models;
    stage.setModels(models);
    old.filter(m => !models.includes(m)).forEach(disposeModel); // free what is no longer shown
    if (models.length > 4) notify('warn', `${models.length} models loaded. A row shows the first 4; remove some to choose which.`);
    stage.setTime(0);
    resetCamera();
    syncUi();
  }

  async function handleFiles(fileList, append = false) {
    if (exporting) { notify('warn', 'Wait for the export to finish, or cancel it, before loading files.'); return; }
    const files = [...fileList];
    clearNotices();
    // .json files are look files, or explode layouts that belong to a model dropped with them.
    const jsons = files.filter(f => f.name.toLowerCase().endsWith('.json'));
    const layouts = [], looks = [];
    for (const f of jsons) {
      try { const data = JSON.parse(await f.text()); (data.coolrender === 'explode-layout' ? layouts : looks).push({ file: f, data }); } catch { looks.push({ file: f }); }
    }
    for (const { file } of looks) await loadLookFile(file);
    const { models, extras, unsupported } = groupFiles(files.filter(f => !jsons.includes(f)));
    if (unsupported.length) notify('error', `Can't open ${unsupported.join(', ')}. Supported: GLB, GLTF, OBJ (+MTL and textures), PLY, STL.`);
    if (!models.length) {
      // A layout file dropped alone belongs to a model that is already loaded.
      if (layouts.length) { for (const m of stage.models) useLayout(m, layouts, stage.models.length); setLook({ anim: 'explode' }); stage.setTime(0); return; }
      if (extras.size && !unsupported.length) notify('warn', 'These look like texture or material files. Drop them together with the model file (.obj, .gltf).');
      return;
    }
    const loaded = [];
    for (const file of models) {
      try {
        const result = await loadModelFile(file, extras, { useLoneImage: models.length === 1 });
        result.warnings.forEach(w => notify('warn', `${file.name}: ${w}`, [['Use Clay style', () => setLook({ style: 'clay' })]]));
        result.infos.forEach(m => notify('ok', `${file.name}: ${m}`));
        const model = prepareModel(result, file.name);
        await loadHeat(model, extras, models.length);
        useLayout(model, layouts, models.length);
        loaded.push(model);
      } catch (e) {
        notify('error', e instanceof FriendlyError ? e.message : `Couldn't open ${file.name}: ${e.message}`);
      }
    }
    if (!loaded.length) return;
    setModels(append ? [...stage.models, ...loaded] : loaded);
    for (const m of loaded) checkHeavy(m);
  }

  // A layout file matches a model by file name (barong.glb and barong.layout.json), or the only model.
  function useLayout(model, layouts, modelCount) {
    const base = model.name.replace(/\.[^.]+$/, '').toLowerCase();
    const layout = layouts.find(l => l.file.name.toLowerCase() === `${base}.layout.json`) ?? (layouts.length === 1 && modelCount === 1 ? layouts[0] : null);
    if (!layout) return;
    const { matched, total } = attachLayout(model, layout.data);
    if (matched < total) notify('warn', `${layout.file.name} matches ${matched} of ${total} parts of ${model.name}. The others stay in place.`);
    else notify('ok', `Explode layout loaded for ${model.name}. Pick the Explode motion.`);
    stage.refresh();
  }

  // Per-vertex values for the Deviation style: a CSV/TXT with the model's name,
  // or the only CSV dropped with a single model.
  async function loadHeat(model, extras, modelCount) {
    const base = model.name.replace(/\.[^.]+$/, '').toLowerCase();
    const csvs = [...extras.values()].filter(f => /\.(csv|txt)$/i.test(f.name));
    const file = csvs.find(f => f.name.toLowerCase().startsWith(base)) ?? (csvs.length === 1 && modelCount === 1 ? csvs[0] : null);
    if (!file) return;
    const { matched, total, values } = attachHeat(model, await file.text());
    if (!matched) notify('warn', `${file.name} has ${values.toLocaleString()} values, which don't match the vertices of ${model.name}. The Deviation style will use other values or show height instead.`);
    else if (matched < total) notify('warn', `${file.name}: ${matched.toLocaleString()} of ${total.toLocaleString()} vertices got a value; the rest show as 0.`);
  }

  function checkHeavy(model) {
    const tris = countTriangles(model);
    if (tris <= TRI_BUDGET) return;
    notify('warn', `${model.name} has ${tris.toLocaleString()} triangles. That is heavy and will make exports slow. Simplify it to about ${TRI_BUDGET.toLocaleString()}? It will look the same on video.`, [
      [`Simplify to ${TRI_BUDGET / 1000}k`, async () => {
        if (exporting) return;
        const msg = notify('ok', `Simplifying ${model.name}…`);
        await new Promise(r => setTimeout(r, 30));
        await decimateModel(model);
        msg.remove();
        stage.refresh();
        syncUi();
        notify('ok', `${model.name} simplified to ${countTriangles(model).toLocaleString()} triangles.`);
      }, true],
      ['Keep full detail', () => {}],
    ]);
  }

  async function loadSample() {
    if (exporting) return;
    clearNotices();
    const loading = notify('ok', 'Loading the sample…');
    try {
      const result = await loadModelUrl(`${import.meta.env.BASE_URL}sample/teapot.glb`);
      setModels([prepareModel(result, 'teapot.glb (sample)')]);
    } catch (e) {
      notify('error', `Couldn't load the sample: ${e.message}`);
    } finally {
      loading.remove();
    }
  }

  function orient(fn) {
    if (exporting) return;
    for (const m of stage.models) fn(m);
    stage.refresh();
    resetCamera();
    syncUi();
  }

  const fileInput = $('file-input');
  let appendNext = false;
  function openFiles(append) { appendNext = append; fileInput.value = ''; fileInput.click(); }
  fileInput.onchange = () => handleFiles(fileInput.files, appendNext);
  $('empty-open').onclick = () => openFiles(false);
  $('empty-sample').onclick = loadSample;

  viewport.addEventListener('dragover', e => { e.preventDefault(); viewport.classList.add('dragging'); });
  viewport.addEventListener('dragleave', e => { if (!viewport.contains(e.relatedTarget)) viewport.classList.remove('dragging'); });
  viewport.addEventListener('drop', e => {
    e.preventDefault();
    viewport.classList.remove('dragging');
    handleFiles(e.dataTransfer.files, e.shiftKey);
  });
  // Dropping anywhere else must not navigate away from the app.
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());

  // ── Looks (presets) ─────────────────────────────────────────────────────────
  async function loadLookFile(file) {
    try {
      setLook(lookFromFile(await file.text()));
      notify('ok', `Look "${file.name}" loaded.`);
    } catch {
      notify('error', `${file.name} is not a coolrender look file.`);
    }
  }
  $('look-input').onchange = e => e.target.files[0] && loadLookFile(e.target.files[0]);

  // ── Shot list (dev server only) ─────────────────────────────────────────────
  let shots = [];
  // Only the dev server serves shots.json and models/; the published site works from drag and drop.
  if (import.meta.env.DEV) fetch('/__shots').then(r => (r.ok ? r.json() : null)).then(data => {
    if (!data) return;
    shots = parseShotList(data);
    sidebar.setShots(shots);
  }).catch(() => {});
  async function loadShot(index) {
    const shot = shots[index];
    if (!shot || exporting) return;
    clearNotices();
    try {
      const models = await loadShotModels(shot, '/models/', m => notify('warn', m));
      const old = stage.models;
      stage.configure({ models, look: shotLook(shot) }); // built once, in one step
      old.filter(m => !models.includes(m)).forEach(disposeModel);
      resetCamera();
      layoutFrame();
      stage.setTime(0);
      syncUi();
    } catch (err) {
      notify('error', `Shot "${shot.id}": ${err.message}`);
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  async function runExport() {
    if (exporting || !stage.models.length) return;
    const format = sidebar.format;
    exporting = new AbortController();
    const wasPlaying = playing;
    playing = false;
    resetCamera();
    syncUi();
    const t0 = performance.now();
    try {
      const options = { onProgress: sidebar.progress, signal: exporting.signal };
      const blob = format === 'png' ? await exportPngZip(stage, options) : await exportVideo(stage, format, options);
      const base = stage.models[0].name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_');
      const name = `${base}_${stage.look.style}.${format === 'png' ? 'zip' : format}`;
      window.__lastExport = { blob, name, seconds: (performance.now() - t0) / 1000 };
      download(blob, name);
      notify('ok', `Saved ${name} (${(blob.size / 1e6).toFixed(1)} MB) in ${formatTime((performance.now() - t0) / 1000)}.`);
    } catch (e) {
      if (e.name !== 'AbortError') notify('error', `Export failed: ${e.message}`);
    } finally {
      exporting = null;
      sidebar.resetProgress();
      layoutFrame();
      setPlaying(wasPlaying);
      syncUi();
    }
  }

  // ── Playback and preview ────────────────────────────────────────────────────
  function setPlaying(on) {
    playing = on;
    $('icon-play').hidden = on;
    $('icon-pause').hidden = !on;
  }
  $('play').onclick = () => setPlaying(!playing);
  $('reset-view').onclick = resetCamera;
  $('scrub').oninput = e => { setPlaying(false); stage.setTime((e.target.value / 1000) * stage.look.seconds); };

  // Fits the canvas to the viewport at the output aspect ratio.
  function layoutFrame() {
    if (exporting) return;
    const { width, height } = outputSize(stage.look);
    const box = viewport.getBoundingClientRect();
    const scale = Math.min((box.width - 32) / width, (box.height - 32) / height);
    const w = Math.max(2, Math.floor(width * scale)), h = Math.max(2, Math.floor(height * scale));
    $('frame').style.width = `${w}px`;
    $('frame').style.height = `${h}px`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    stage.setSize(Math.round(w * dpr), Math.round(h * dpr));
    if (!cameraMoved) resetCamera();
  }
  new ResizeObserver(() => requestAnimationFrame(layoutFrame)).observe(viewport);

  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (exporting) return;
    const look = stage.look;
    if (playing && !document.hidden) stage.setTime((stage.time + dt) % look.seconds);
    $('scrub').value = Math.round((stage.time / look.seconds) * 1000);
    $('time-label').textContent = `${stage.time.toFixed(2)} / ${look.seconds.toFixed(2)} s`;
    controls.update();
    stage.render();
  }
  requestAnimationFrame(tick);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  window.addEventListener('keydown', e => {
    if (e.target.closest?.('input, select, textarea, button, summary') && e.code === 'Space') return; // let focused controls use Space
    if (e.target.closest?.('input[type="text"], input[type="number"], select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'r' || e.key === 'R') resetCamera();
    else if (e.key === 'e' || e.key === 'E') runExport();
  });

  setPlaying(true);
  layoutFrame();
  syncUi();
  window.__coolrender = { stage, handleFiles, loadSample, runExport, $ }; // for testing in the console
  window.coolrenderReady = true;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const formatTime = s => (s < 60 ? `${Math.ceil(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

await lodReady;
if (new URLSearchParams(location.search).has('batch')) startBatch();
else startApp();
