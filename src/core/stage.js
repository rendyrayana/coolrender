import * as THREE from 'three';
import { STYLES } from '../styles/index.js';
import { ANIMS } from '../anims/index.js';
import { BACKGROUNDS, DEFAULT_LOOK } from './look.js';
import { splitParts } from './parts.js';
import { grab } from './post.js';

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

  const stage = {
    renderer, scene, camera, keyLight, target,
    get look() { return look; },
    get time() { return time; },
    get models() { return models; },
    get items() { return layers[0]?.items ?? []; },

    setModels(list) { models = list; rebuild(); },

    // Applies look changes. Only rebuilds the display when needed.
    setLook(changes) {
      const prev = look;
      look = { ...look, ...changes };
      // Names from an old look file or a typo fall back to the defaults.
      if (!ANIMS[look.anim]) look.anim = 'turntable';
      if (!STYLES[look.style]) look.style = 'studio';
      if (!STYLES[look.styleB]) look.styleB = 'ps1';
      const rebuildKeys = ['style', 'styleB', 'anim', 'sameSize', 'shadow', 'bg', 'pointCount', 'pointSize', 'pointBright'];
      if (rebuildKeys.some(k => prev[k] !== look[k])) rebuild();
      else fit();
      keyLight.intensity = 2.2 * look.key;
      rimLight.intensity = 3.0 * look.rim;
      stage.setTime(time);
    },

    refresh: rebuild,
    resetCamera: () => fit(),

    setTime(t) {
      time = t;
      const anim = ANIMS[look.anim];
      for (const layer of layers) {
        anim.update(layer.items, t, look);
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
      ANIMS[look.anim].composite(stage, a, b, time, look);
    },

    // Plain render of the scene to the canvas, for styles that add a pass on top.
    renderScene() {
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(scene, camera);
    },

    // Which models the current animation shows (turntable shows one, lineup up to 4).
    visibleModels() { return models.slice(0, ANIMS[look.anim].maxModels); },
  };

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
    for (const layer of layers) {
      scene.remove(layer.group);
      // Free GPU memory: styles create new geometry, materials and textures on
      // every build. Shared model data is simply uploaded again if reused.
      const keep = new Set(models.flatMap(m => m.children.flatMap(c => [c.material].flat().map(x => x?.map))));
      layer.group.traverse(o => {
        o.geometry?.dispose();
        for (const m of [o.material].flat().filter(Boolean)) {
          for (const v of Object.values(m)) if (v?.isTexture && v.userData.disposable && !keep.has(v)) v.dispose();
          m.dispose();
        }
      });
    }
    layers = [];
    const anim = ANIMS[look.anim];
    const shown = stage.visibleModels();
    if (shown.length) {
      layers.push(buildLayer(anim.forceStyle ?? look.style, shown, anim));
      if (anim.layers === 2) {
        // The second layer shows the second model if there is one, else the same model.
        const second = models[1] ? [models[1]] : shown;
        layers.push(buildLayer(anim.forceStyleB ?? look.styleB, second, anim));
      }
    }
    for (const layer of layers) if (layer.items.length) anim.layout(layer.items);
    fit();
    stage.setTime(time);
  }

  function buildLayer(styleId, shownModels, anim) {
    const style = STYLES[styleId] ?? STYLES.studio;
    const group = new THREE.Group();
    const items = [], updaters = [];
    const tallest = Math.max(...shownModels.map(m => m.userData.height));
    shownModels.forEach((model, index) => {
      const source = anim.needsParts ? partsModel(model) : model;
      const scale = look.sameSize ? tallest / model.userData.height : 1;
      const ctx = { look, models, index, stage };
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
      g.userData = { ...model.userData, cache: {} };
      cache.partsModel = g;
    }
    return cache.partsModel;
  }

  // Fixed camera, slightly above, looking at the centre of everything on
  // display. Distance is chosen so the full turntable sweep (a cylinder per
  // model) stays inside the frame with the requested margin.
  function fit() {
    camera.fov = look.fov;
    camera.updateProjectionMatrix();
    const items = layers.flatMap(l => l.items);
    if (!items.length) return;
    // Room for parts flying out (in every direction), and for props a style
    // places beside the object (extent: sideways only, so framing height stays the same).
    const spread = ANIMS[look.anim].spread ?? 1;
    const wide = Math.max(spread, ...layers.map(l => STYLES[l.style].extent ?? 1));
    let minX = Infinity, maxX = -Infinity, height = 0, depth = 0;
    for (const item of items) {
      const { radius, height: h } = item.userData;
      minX = Math.min(minX, item.position.x - radius * wide);
      maxX = Math.max(maxX, item.position.x + radius * wide);
      height = Math.max(height, h * (1 + (spread - 1) * 0.6));
      depth = Math.max(depth, radius * spread);
    }
    const elev = THREE.MathUtils.degToRad(look.elevation);
    const center = new THREE.Vector3((minX + maxX) / 2, height / 2, 0);
    const halfH = (height / 2) * Math.cos(elev) + depth * Math.sin(elev);
    const halfW = (maxX - minX) / 2;
    const tanV = Math.tan(THREE.MathUtils.degToRad(look.fov) / 2);
    const tanH = tanV * camera.aspect;
    const room = 1 / (1 - 2 * look.margin);
    let dist = Math.max((halfH * room) / tanV, (halfW * room) / tanH) + depth * 0.5;
    // Lineup with fillWidth: keep the height fit and spread the models sideways
    // so the group spans that share of the frame width.
    if (look.fillWidth && items.length > 1 && look.anim === 'lineup') {
      dist = (halfH * room) / tanV + depth * 0.5;
      const visibleWidth = 2 * (dist - depth) * tanH; // at the front of the models
      const r = Math.max(...items.map(i => i.userData.radius));
      const span = Math.max(visibleWidth * look.fillWidth - 2 * r, 0);
      const step = span / (items.length - 1);
      if (step > 2 * r) items.forEach((item, k) => item.position.setX((k - (items.length - 1) / 2) * step));
      center.x = 0;
    }
    camera.position.set(center.x, center.y + Math.sin(elev) * dist, Math.cos(elev) * dist);
    camera.near = dist / 100;
    camera.far = dist * 10;
    target.copy(center);
    camera.lookAt(center);
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
