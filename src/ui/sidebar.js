import { STYLES } from '../styles/index.js';
import { ANIMS } from '../anims/index.js';
import { BUILTIN_PRESETS, RESOLUTIONS, BACKGROUNDS, DEFAULT_LOOK, frameCount, outputSize } from '../core/look.js';
import { STYLE_GROUPS, STYLE_BLURBS, ANIM_GROUPS, ANIM_BLURBS } from './catalog.js';

const THUMBS = `${import.meta.env.BASE_URL}thumbs/`;
const FORMATS = [['mp4', 'MP4'], ['webm', 'WebM'], ['png', 'PNG zip']];
const FORMAT_NAMES = { mp4: 'MP4', webm: 'WebM', png: 'PNG sequence' };

let uid = 0;
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter(c => c !== null && c !== undefined && c !== false));
  return node;
}

// A row of mutually exclusive buttons. `set(value)` marks the active one.
function segmented(options, onPick, label) {
  const root = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const buttons = new Map();
  for (const [value, text, title] of options) {
    const button = h('button', { type: 'button', text, title, dataset: { value }, onclick: () => onPick(value) });
    buttons.set(value, button);
    root.append(button);
  }
  root.set = value => buttons.forEach((b, v) => b.setAttribute('aria-pressed', String(v === value)));
  root.buttons = buttons;
  return root;
}

function toggleRow(label, onChange, title) {
  const id = `t${++uid}`;
  const input = h('input', { type: 'checkbox', class: 'toggle', id, onchange: e => onChange(e.target.checked) });
  const row = h('div', { class: 'row', title }, h('label', { for: id, text: label }), input);
  row.set = value => { input.checked = value; };
  return row;
}

// Label and live value on one line, the slider below. `live: false` applies the
// change on release (for settings that rebuild the scene).
function sliderRow({ label, min, max, step, fmt = v => String(v), live = true, onChange, title }) {
  const id = `s${++uid}`;
  const out = h('output', { for: id });
  const input = h('input', { type: 'range', id, min, max, step });
  input.addEventListener('input', () => { out.textContent = fmt(Number(input.value)); if (live) onChange(Number(input.value)); });
  if (!live) input.addEventListener('change', () => onChange(Number(input.value)));
  const row = h('div', { class: 'slider', title }, h('label', { for: id, text: label }), out, input);
  row.set = value => { input.value = value; out.textContent = fmt(value); };
  return row;
}

const panel = (title, ...children) => h('section', { class: 'panel' }, h('h2', { text: title }), ...children);

// The control panel. It only draws and reports: `actions` change the app, and
// the app calls `sync(state)` to redraw. `state` = { look, models, exporting, canVideo }.
export function createSidebar(root, actions) {
  const scroll = h('div', { id: 'side-scroll' });
  const bar = h('div', { id: 'export-bar' });
  root.replaceChildren(scroll, bar);
  let tab = STYLE_GROUPS[0].id;
  let format = 'mp4';
  let last = null;

  // ── Shot list (dev server only) ─────────────────────────────────────────────
  const shotSelect = h('select', { id: 'shot-select', 'aria-label': 'Shot', onchange: e => e.target.value !== '' && actions.shot(Number(e.target.value)) });
  const shotsPanel = panel('Shot list',
    h('div', { class: 'row' }, h('label', { for: 'shot-select', text: 'Shot' }), shotSelect),
    h('p', { class: 'hint' }, 'From shots.json. Render all with ', h('code', { text: 'npm run render -- shots.json' }), '.'));
  shotsPanel.hidden = true;

  // ── Quick start ─────────────────────────────────────────────────────────────
  const presetChips = new Map(Object.keys(BUILTIN_PRESETS).map(name =>
    [name, h('button', { type: 'button', class: 'chip', text: name, onclick: () => actions.preset(name) })]));
  const quickPanel = panel('Quick start',
    h('div', { class: 'chips' }, ...presetChips.values()),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-small', id: 'save-look', text: 'Save look', title: 'Save all settings as a small .json file', onclick: actions.saveLook }),
      h('button', { type: 'button', class: 'btn btn-small', id: 'load-look', text: 'Load look', title: 'Load a saved .json look file', onclick: actions.loadLook })));

  // ── Model ───────────────────────────────────────────────────────────────────
  const modelList = h('ul', { id: 'model-list' });
  const orient = [
    ['y-up', 'Y-up', 'The model was made Y-up (most GLB files)', 'yUp'],
    ['z-up', 'Z-up', 'The model was made Z-up (CAD, photogrammetry)', 'zUp'],
    ['tip', 'Tip 90°', 'Tip forward 90°', 'tip'],
    ['spin', 'Turn 90°', 'Turn around the vertical axis by 90°', 'turn'],
    ['fit', 'Auto-fit', 'Centre on the turntable and put it on the floor', 'fit'],
  ].map(([id, text, title, kind]) => h('button', { type: 'button', class: 'btn btn-small', id, text, title, onclick: () => actions.orient(kind) }));
  const modelPanel = panel('Model', modelList,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', id: 'open-files', text: 'Open…', onclick: () => actions.open(false) }),
      h('button', { type: 'button', class: 'btn', id: 'add-files', text: 'Add…', title: 'Add more models for a lineup', onclick: () => actions.open(true) }),
      h('button', { type: 'button', class: 'btn', id: 'load-sample', text: 'Sample', onclick: actions.sample })),
    h('div', { class: 'sub', text: 'Fix orientation' }),
    h('div', { class: 'btn-row' }, ...orient));

  // ── Style gallery ───────────────────────────────────────────────────────────
  const grouped = new Set(STYLE_GROUPS.flatMap(g => g.styles));
  for (const id of Object.keys(STYLES)) if (!grouped.has(id)) console.warn(`Style "${id}" is missing from STYLE_GROUPS in src/ui/catalog.js`);
  const cards = new Map();
  const grids = new Map();
  const tabs = new Map();
  for (const group of STYLE_GROUPS) {
    const grid = h('div', { class: 'cards', role: 'tabpanel', id: `grid-${group.id}` });
    for (const id of group.styles.filter(s => STYLES[s])) {
      const card = h('button', { type: 'button', class: 'card', title: STYLE_BLURBS[id], dataset: { id }, onclick: () => actions.look({ style: id }) },
        h('span', { class: 'thumb' }, h('img', { src: `${THUMBS}${id}.jpg`, alt: '', loading: 'lazy', decoding: 'async', onerror: e => e.target.remove() })),
        h('span', { class: 'card-label', text: STYLES[id].label }));
      cards.set(id, card);
      grid.append(card);
    }
    grids.set(group.id, grid);
    tabs.set(group.id, h('button', { type: 'button', role: 'tab', text: group.label, 'aria-controls': grid.id, onclick: () => { tab = group.id; drawTabs(); } }));
  }
  const drawTabs = () => {
    for (const [id, button] of tabs) button.setAttribute('aria-selected', String(id === tab));
    for (const [id, grid] of grids) grid.hidden = id !== tab;
  };
  const styleNote = h('p', { class: 'hint' });
  const stylePanel = panel('Style', h('div', { class: 'tabs', role: 'tablist' }, ...tabs.values()), ...grids.values(), styleNote);

  // ── Motion ──────────────────────────────────────────────────────────────────
  const chips = new Map();
  const motionRows = ANIM_GROUPS.map(group => {
    const row = h('div', { class: 'chips' });
    for (const id of group.anims.filter(a => ANIMS[a])) {
      const chip = h('button', { type: 'button', class: 'chip', text: ANIMS[id].label, title: ANIM_BLURBS[id], dataset: { value: id }, onclick: () => actions.look({ anim: id }) });
      chips.set(id, chip);
      row.append(chip);
    }
    return [h('div', { class: 'sub', text: group.label }), row];
  }).flat();
  const styleBSelect = h('select', { id: 'style-b', 'aria-label': 'Second style', onchange: e => actions.look({ styleB: e.target.value }) },
    ...STYLE_GROUPS.map(g => h('optgroup', { label: g.label }, ...g.styles.filter(s => STYLES[s]).map(s => h('option', { value: s, text: STYLES[s].label })))));
  const styleBRow = h('div', { class: 'row' }, h('label', { for: 'style-b', text: 'Second style', title: 'What this animation blends or compares to' }), styleBSelect);
  const sameSizeRow = toggleRow('Same size', v => actions.look({ sameSize: v }), 'Scale every model in a lineup to the same height');
  const animHint = h('p', { class: 'hint' });
  const motionPanel = panel('Motion', ...motionRows, styleBRow, sameSizeRow, animHint);

  // ── Look ────────────────────────────────────────────────────────────────────
  const swatches = segmented(Object.entries(BACKGROUNDS).map(([id, bg]) => [id, bg.label]), v => actions.look({ bg: v }), 'Background');
  swatches.classList.add('swatches');
  swatches.id = 'bg';
  for (const [id, button] of swatches.buttons) {
    button.prepend(h('span', { class: `swatch swatch-${id}`, style: id === 'transparent' ? null : `background:${BACKGROUNDS[id].color}` }));
  }
  const shadowRow = toggleRow('Ground shadow', v => actions.look({ shadow: v }));
  const pct = v => `${Math.round(v * 100)}%`;
  const lightSliders = {
    key: sliderRow({ label: 'Key light', min: 0, max: 3, step: 0.05, fmt: v => v.toFixed(2), onChange: v => actions.look({ key: v }) }),
    rim: sliderRow({ label: 'Rim light', min: 0, max: 3, step: 0.05, fmt: v => v.toFixed(2), title: 'Cool light from behind: separates dark objects from the background', onChange: v => actions.look({ rim: v }) }),
    elevation: sliderRow({ label: 'Camera height', min: -10, max: 60, step: 1, fmt: v => `${v}°`, onChange: v => actions.look({ elevation: v }) }),
    fov: sliderRow({ label: 'Lens (field of view)', min: 10, max: 60, step: 1, fmt: v => `${v}°`, title: 'Lower = longer lens, flatter perspective', onChange: v => actions.look({ fov: v }) }),
    margin: sliderRow({ label: 'Frame margin', min: 0, max: 0.3, step: 0.01, fmt: pct, onChange: v => actions.look({ margin: v }) }),
  };
  const lightDetails = h('details', { class: 'more' }, h('summary', { text: 'Lighting & camera' }), ...Object.values(lightSliders),
    h('button', { type: 'button', class: 'btn btn-small', text: 'Reset', onclick: () => actions.look(Object.fromEntries(Object.keys(lightSliders).map(k => [k, DEFAULT_LOOK[k]]))) }));
  const pointSliders = {
    pointCount: sliderRow({ label: 'Points', min: 5000, max: 300000, step: 5000, live: false, fmt: v => `${Math.round(v / 1000)}k`, onChange: v => actions.look({ pointCount: v }) }),
    pointSize: sliderRow({ label: 'Dot size', min: 0.3, max: 5, step: 0.1, live: false, fmt: v => v.toFixed(1), onChange: v => actions.look({ pointSize: v }) }),
    pointBright: sliderRow({ label: 'Brightness', min: 0.5, max: 3, step: 0.1, live: false, fmt: v => v.toFixed(1), onChange: v => actions.look({ pointBright: v }) }),
    drift: sliderRow({ label: 'Drift', min: 0, max: 2, step: 0.1, fmt: v => v.toFixed(1), title: 'How much the points float', onChange: v => actions.look({ drift: v }) }),
  };
  const pointDetails = h('details', { class: 'more', open: true }, h('summary', { text: 'Point options' }), ...Object.values(pointSliders));
  const lookPanel = panel('Look', swatches, shadowRow, lightDetails, pointDetails);

  // ── Output ──────────────────────────────────────────────────────────────────
  const seconds = h('input', { type: 'number', id: 'seconds', min: 1, max: 120, step: 0.5, 'aria-label': 'Duration in seconds',
    onchange: e => actions.look({ seconds: Math.min(120, Math.max(1, Number(e.target.value) || 6)) }) });
  const durationRow = h('div', { class: 'row' }, h('label', { for: 'seconds', text: 'Duration' }), h('span', { class: 'num' }, seconds, ' s'));
  const resolution = segmented(Object.entries(RESOLUTIONS).map(([id, r]) => [id, r.short, `${r.width}×${r.height}`]), v => actions.look({ resolution: v }), 'Resolution');
  resolution.id = 'resolution';
  const fps = segmented([24, 30, 60].map(v => [v, String(v)]), v => actions.look({ fps: v }), 'Frames per second');
  fps.id = 'fps';
  const loopRow = toggleRow('Loop', v => actions.look({ loop: v }), 'Constant speed, so the clip loops seamlessly');
  const formatSeg = segmented(FORMATS, v => { format = v; actions.format?.(v); if (last) sync(last); }, 'Format');
  formatSeg.id = 'format';
  const outputInfo = h('p', { class: 'hint' });
  const outputPanel = panel('Output',
    durationRow,
    h('div', { class: 'row' }, h('label', { text: 'Resolution' }), resolution),
    h('div', { class: 'row' }, h('label', { text: 'FPS' }), fps),
    loopRow,
    h('div', { class: 'row' }, h('label', { text: 'Format' }), formatSeg),
    outputInfo);

  scroll.append(shotsPanel, quickPanel, modelPanel, stylePanel, motionPanel, lookPanel, outputPanel);

  // ── Export bar ──────────────────────────────────────────────────────────────
  const exportButton = h('button', { type: 'button', class: 'btn btn-primary btn-wide', id: 'export', onclick: actions.export });
  const progressFill = h('div', { id: 'progress-fill' });
  const progressText = h('span', { id: 'progress-text' });
  const progress = h('div', { id: 'progress', hidden: true },
    h('div', { class: 'bar' }, progressFill),
    h('div', { class: 'progress-row' }, progressText, h('button', { type: 'button', class: 'btn btn-small', id: 'cancel', text: 'Cancel', onclick: actions.cancel })));
  bar.append(exportButton, progress);

  // ── Redraw ──────────────────────────────────────────────────────────────────
  function sync(state) {
    last = state;
    const { look, models, exporting, canVideo } = state;
    const anim = ANIMS[look.anim];
    if (!canVideo && format !== 'png') format = 'png';
    for (const [id, button] of formatSeg.buttons) button.disabled = id !== 'png' && !canVideo;

    for (const [name, chip] of presetChips) {
      chip.setAttribute('aria-pressed', String(Object.entries(BUILTIN_PRESETS[name]).every(([k, v]) => look[k] === v)));
    }

    modelList.replaceChildren(...models.map((m, i) => h('li', { class: m.hidden ? 'off' : null, title: m.hidden ? m.hiddenReason : null },
      h('span', { class: 'name', text: m.name }), h('span', { class: 'tris', text: `${m.tris.toLocaleString()} tris` }),
      h('button', { type: 'button', class: 'remove', 'aria-label': `Remove ${m.name}`, title: 'Remove', text: '×', onclick: () => actions.remove(i) }))));
    const none = models.length === 0;
    for (const button of orient) button.disabled = none;

    // The tab follows the selected style (presets and shots can change it).
    const home = STYLE_GROUPS.find(g => g.styles.includes(look.style));
    if (home && home.id !== tab && last.followStyle !== false) tab = home.id;
    drawTabs();
    for (const [id, card] of cards) card.setAttribute('aria-pressed', String(id === look.style && !anim.forceStyle));
    grids.forEach(grid => grid.classList.toggle('dim', !!anim.forceStyle));
    styleNote.textContent = anim.forceStyle ? `${anim.label} always uses the ${STYLES[anim.forceStyle].label.toLowerCase()} style.` : '';
    styleNote.hidden = !anim.forceStyle;

    for (const [id, chip] of chips) {
      chip.setAttribute('aria-pressed', String(id === look.anim));
      chip.disabled = id === 'lineup' && models.length < 2;
      if (id === 'lineup') chip.title = chip.disabled ? 'Load 2 or more models to make a lineup' : ANIM_BLURBS.lineup;
    }
    styleBSelect.value = look.styleB;
    styleBRow.hidden = anim.layers !== 2;
    sameSizeRow.hidden = anim.maxModels < 2;
    sameSizeRow.set(look.sameSize);
    const timed = [look.style, anim.layers === 2 && look.styleB].some(id => STYLES[id]?.timed);
    animHint.textContent = [ANIM_BLURBS[look.anim], look.loop && (timed || anim.timed) ? 'This plays once over the shot, so with Loop on the last frame will not match the first.' : ''].filter(Boolean).join(' ');

    swatches.set(look.bg);
    shadowRow.set(look.shadow);
    for (const [key, row] of Object.entries({ ...lightSliders, ...pointSliders })) row.set(look[key]);
    pointDetails.hidden = !(look.style === 'points' || anim.forceStyle === 'points');

    seconds.value = look.seconds;
    resolution.set(look.width ? null : look.resolution);
    fps.set(look.fps);
    loopRow.set(look.loop);
    formatSeg.set(format);
    const { width, height } = outputSize(look);
    outputInfo.textContent = [
      `${width}×${height} · ${frameCount(look)} frames`,
      format === 'mp4' && look.bg === 'transparent' ? 'MP4 cannot store transparency, so the background will be dark. Pick WebM or PNG to keep it transparent.' : '',
      !canVideo ? 'Video export needs a browser with WebCodecs (Chrome, Edge or Safari 16.4+). PNG export works everywhere.' : '',
    ].filter(Boolean).join('. ').replace(/\.\./g, '.');

    exportButton.replaceChildren(exporting ? 'Exporting…' : `Export ${FORMAT_NAMES[format]} `, exporting ? '' : h('kbd', { text: 'E' }));
    exportButton.disabled = none || exporting;
    scroll.inert = exporting;
    scroll.classList.toggle('busy', exporting);
    progress.hidden = !exporting;
  }

  drawTabs();
  return {
    sync,
    get format() { return format; },
    set format(value) { if (FORMAT_NAMES[value]) { format = value; if (last) sync(last); } },
    setShots(list) {
      shotSelect.replaceChildren(h('option', { value: '', text: 'Choose a shot…' }), ...list.map((s, i) => h('option', { value: i, text: s.id })));
      shotsPanel.hidden = list.length === 0;
    },
    progress({ done, total, eta }) {
      progressFill.style.width = `${(done / total) * 100}%`;
      progressText.textContent = `Frame ${done}/${total} · ${eta < 1 ? 'finishing' : `about ${eta < 60 ? `${Math.ceil(eta)} s` : `${Math.floor(eta / 60)} min ${Math.round(eta % 60)} s`} left`}`;
    },
    resetProgress() { progressFill.style.width = '0'; },
  };
}
