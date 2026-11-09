import * as THREE from 'three';
import { STYLES } from '../styles/index.js';
import { ANIMS } from '../anims/index.js';
import { BACKGROUNDS, DEFAULT_LOOK } from './look.js';
import { splitParts } from './parts.js';
import { grab, releaseGrabs } from './post.js';
import { computeFit } from './fit.js';

// The stage owns the renderer, the fixed studio camera, the lights and the
// models on display. Everything that ends up in a frame is set here, and
// setTime() + render() are all that is needed to produce any frame.
//
// What is on display is one "layer" (a style applied to the models), or two
// layers for animations that blend or compare styles (morph, split_compare…).
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setPixelRatio(1);
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(DEFAULT_LOOK.fov, 16 / 9, 0.01, 1000);

  // Soft studio lighting: key from the upper left, fill from the right, ambient to lift shadows.
  const ambient = new THREE.HemisphereLight(0xffffff, 0x8a8580, 1.1);
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(-1.2, 1.8, 1.5);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
  fillLight.position.set(1.6, 0.6, 1.0);
  // Rim: cool white from behind and above, off by default (look.rim).
  const rimLight = new THREE.DirectionalLight(0xdfe9ff, 0);
  rimLight.position.set(1.4, 1.2, -1.6);
  scene.add(ambient, keyLight, fillLight, rimLight);

  let models = [];   // prepared models (see core/model.js)
  let layers = [];   // [{ style, group, items, updaters }]
  let look = { ...DEFAULT_LOOK };
  let time = 0;
  const target = new THREE.Vector3(); // what the studio camera looks at
  const warned = new Set();
  let activeAnim = ANIMS.turn; // the motion in use (a part motion is replaced by Turn for point clouds)

  const stage = {
    renderer, scene, camera, keyLight, target,
    holdCamera: false, // true while the user has orbited the preview camera
    onWarn: null,      // (message) => void, set by the app to show notices
    warn(message) {
      if (warned.has(message)) return;
      warned.add(message);
      if (stage.onWarn) stage.onWarn(message); else console.warn(message);
    },
    get look() { return look; },
    get time() { return time; },
    get models() { return models; },
    get items() { return layers[0]?.items ?? []; },

    setModels(list) { models = list; rebuild(); },

    // Sets models and look together, so the display is built only once.
    configure({ models: list, look: changes }) {
      if (list) models = list;
      if (changes) look = normalise({ ...look, ...changes });
      rebuild();
      applyLights();
      stage.setTime(time);
    },

    // Applies look changes. Only rebuilds the display when needed.
    setLook(changes) {
      const prev = look;
      look = normalise({ ...look, ...changes });
      const rebuildKeys = ['style', 'styleB', 'anim', 'turnMode', 'explodeMode', 'sameSize', 'shadow', 'bg', 'pointCount', 'pointSize', 'pointBright',
        'heatReference', 'heatScale', 'heatPulse', 'heatMin', 'heatMax'];
      if (rebuildKeys.some(k => prev[k] !== look[k])) rebuild();
      else fit();
      applyLights();
      stage.setTime(time);
    },

    refresh: rebuild,
    resetCamera: () => fit(),

    setTime(t) {
      time = t;
      for (const layer of layers) {
        activeAnim.update(layer.items, t, look);
        for (const update of layer.updaters) update(t, look);
      }
    },

    setSize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      fit();
    },

    render() {
      if (layers.length < 2) return renderLayer(layers[0]);
      renderLayer(layers[0]);
      const a = grab(renderer, 'layerA');
      renderLayer(layers[1]);
      const b = grab(renderer, 'layerB');
      activeAnim.composite(stage, a, b, time, look);
    },

    // Plain render of the scene to the canvas, for styles that add a pass on top.
    renderScene() {
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(scene, camera);
    },

    // Which models are on display: up to what the motion shows, but only the first
    // when the style uses the other loaded models itself (ghost overlay, deviation reference).
    visibleModels() {
      const style = STYLES[activeAnim.forceStyle ?? look.style];
      return models.slice(0, style?.usesOtherModels?.(look) ? 1 : activeAnim.maxModels);
    },
  };

  // Names from an old look file or a typo fall back to the defaults.
  function normalise(next) {
    const out = { ...next };
    if (!ANIMS[out.anim]) out.anim = 'turn';
    if (!STYLES[out.style]) out.style = 'studio';
    if (!STYLES[out.styleB]) out.styleB = 'ps1';
    return out;
  }
  function applyLights() {
    keyLight.intensity = 2.2 * look.key;
    rimLight.intensity = 3.0 * look.rim;
  }

  // The style that is really used: some styles need a mesh, and some motions need
  // a style that draws one mesh per part. Say so instead of silently showing nothing.
  function resolveStyle(styleId, shown, anim) {
    let style = STYLES[styleId] ?? STYLES.studio;
    if (anim.needsPerPart && !style.perPart) {
      stage.warn(`${style.label} can't show separate parts, so ${anim.label} uses Studio instead.`);
      style = STYLES.studio;
    }
    if (style.needsMesh && shown.some(m => m.userData.isPointCloud)) {
      stage.warn(`${style.label} needs a mesh, but this model is a point cloud, so it is shown as points.`);
      style = STYLES.points;
    }
    return style;
  }

  function renderLayer(layer) {
    for (const l of layers) l.group.visible = l === layer;
    const bg = BACKGROUNDS[look.bg];
    const style = layer ? STYLES[layer.style] : null;
    // A style may bring its own backdrop (e.g. blueprint), unless the user wants transparency.
    renderer.setClearColor(style?.background && look.bg !== 'transparent' ? style.background : bg.color, bg.alpha);
    if (style?.render) style.render(stage);
    else stage.renderScene();
  }

  function rebuild() {
    releaseGrabs();
    warned.clear();
    for (const layer of layers) {
      scene.remove(layer.group);
      // Free GPU memory: styles create new geometry, materials and textures on
      // every build. Shared model data is simply uploaded again if reused.
      const keep = new Set(models.flatMap(m => m.children.flatMap(c => [c.material].flat().map(x => x?.map))));
      layer.group.traverse(o => {
        o.geometry?.dispose();
        o.userData.disposables?.forEach(d => d.dispose()); // textures held in shader uniforms
        for (const m of [o.material].flat().filter(Boolean)) {
          for (const v of Object.values(m)) if (v?.isTexture && v.userData.disposable && !keep.has(v)) v.dispose();
          m.dispose();
        }
      });
    }
    layers = [];
    activeAnim = ANIMS[look.anim];
    if (activeAnim.needsPerPart && models.length && models.every(m => m.userData.isPointCloud)) {
      stage.warn(`${activeAnim.label} needs a mesh, but this model is a point cloud, so it is turned instead.`);
      activeAnim = ANIMS.turn;
    }
    const anim = activeAnim;
    const shown = stage.visibleModels();
    if (shown.length) {
      layers.push(buildLayer(anim.forceStyle ?? look.style, shown, anim));
      if (anim.layers === 2) {
        // The second layer shows the second model if there is one, else the same model.
        const second = models[1] ? [models[1]] : shown;
        layers.push(buildLayer(anim.forceStyleB ?? look.styleB, second, anim));
      }
    }
    for (const layer of layers) if (layer.items.length) anim.layout(layer.items, look, stage);
    fit();
    stage.setTime(time);
  }

  function buildLayer(styleId, shownModels, anim) {
    const style = resolveStyle(styleId, shownModels, anim);
    const group = new THREE.Group();
    const items = [], updaters = [];
    const tallest = Math.max(...shownModels.map(m => m.userData.height));
    shownModels.forEach((model, index) => {
      const source = anim.needsParts ? partsModel(model) : model;
      const scale = look.sameSize ? tallest / model.userData.height : 1;
      const ctx = { look, models, index, stage, warn: stage.warn };
      const built = style.build(source, ctx);
      const spinner = new THREE.Group().add(built);
      spinner.scale.setScalar(scale);
      const item = new THREE.Group().add(spinner);
      item.userData = { spinner, built, model: source, radius: model.userData.radius * scale, height: model.userData.height * scale };
      if (look.shadow && style.shadow !== false) item.add(contactShadow(item.userData.radius, look.bg));
      built.traverse(o => { if (o.userData.update) updaters.push(o.userData.update); });
      group.add(item);
      items.push(item);
    });
    scene.add(group);
    return { style: style.id, group, items, updaters };
  }

  // A stand-in model whose children are the parts, for explode-style animations.
  function partsModel(model) {
    const cache = (model.userData.cache ??= {});
    if (!cache.partsModel) {
      const g = new THREE.Group();
      g.name = model.name;
      g.add(...splitParts(model));
      g.userData = { ...model.userData, cache: {}, source: model };
      cache.partsModel = g;
    }
    return cache.partsModel;
  }

  // Frames everything on display (see core/fit.js). While the user has moved the
  // preview camera, only the target is kept up to date and the camera is left alone.
  function fit() {
    camera.fov = look.fov;
    camera.updateProjectionMatrix();
    const items = layers.flatMap(l => l.items);
    if (!items.length) return;
    const anim = activeAnim;
    const swings = typeof anim.swings === 'function' ? anim.swings(look) : !!anim.swings;
    const result = computeFit({
      items, look, aspect: camera.aspect, swings,
      spread: anim.spread ?? 1,
      wide: Math.max(1, ...layers.map(l => STYLES[l.style].extent ?? 1)),
      row: !!anim.row && items.length > 1,
    });
    target.copy(result.target);
    if (stage.holdCamera) return;
    camera.position.copy(result.position);
    camera.near = result.near;
    camera.far = result.far;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  return stage;
}

// Soft dark blob on the floor: a cheap, deterministic contact shadow that also
// works on transparent backgrounds.
let shadowTexture;
export function contactShadow(radius, bg) {
  if (!shadowTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.65, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    shadowTexture = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000, alphaMap: shadowTexture, transparent: true, depthWrite: false,
    opacity: bg === 'light' ? 0.28 : 0.42,
  });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  blob.rotation.x = -Math.PI / 2;
  blob.scale.setScalar(radius * 2.0);
  blob.position.y = radius * 0.002;
  blob.renderOrder = -1;
  return blob;
}
