// Every render style lives in its own file. To add one, create
// src/styles/<name>.js exporting
//   { id, label, build(model, ctx), render?(stage), background?, shadow?,
//     extent? (props reach this many radii out), timed? (plays once; not loopable) }
// Capability flags the app uses to warn or dim instead of showing nothing:
//   perPart            build() returns one mesh per model part, in order (needed by Explode)
//   needsMesh          needs triangles; a point cloud falls back to the points style
//   usesOtherModels    (look) => bool: the other loaded models are used inside this style
//                      (ghost overlay), so only the first model is shown on its own
// build(model, ctx): ctx = { look, models, index, stage, warn }. A group may list textures it holds
// in uniforms in userData.disposables, so they are freed when the style is rebuilt.
// Old style names keep working through STYLE_ALIASES in core/look.js.
// and list it here and in src/ui/catalog.js (tab and tooltip). build() returns an Object3D; if it (or a child) has
// userData.update(t, look), that runs every frame with the shot time.
import studio from './studio.js';
import clay from './clay.js';
import points from './points.js';
import ps1 from './ps1.js';
import wire from './wire.js';
import texelStep from './texel_step.js';
import photoRig from './photo_rig.js';
import stripes from './stripes.js';
import depthNoise from './depth_noise.js';
import printLayers from './print_layers.js';
import anchorGlow from './anchor_glow.js';
import uvUnfold from './uv_unfold.js';
import filamentSnap from './filament_snap.js';
import contour from './contour.js';
import ink from './ink.js';
import lidarSweep from './lidar_sweep.js';
import pointToMesh from './point_to_mesh.js';
import decimateLive from './decimate_live.js';
import crt from './crt.js';
import pixelRain from './pixel_rain.js';
import arCard from './ar_card.js';
import museumVitrine from './museum_vitrine.js';
import xray from './xray.js';
import sectionCut from './section_cut.js';
import halftone from './halftone.js';
import blueprint from './blueprint.js';
import lowLight from './low_light.js';
import mirrorFloor from './mirror_floor.js';
import tiltShift from './tilt_shift.js';
import deviation from './deviation.js';
import ghostOverlay from './ghost_overlay.js';

export const STYLES = Object.fromEntries([
  studio, clay, points, ps1, wire, deviation, texelStep,
  photoRig, stripes, depthNoise, printLayers, ghostOverlay, anchorGlow, uvUnfold, filamentSnap, contour, ink,
  lidarSweep, pointToMesh, decimateLive, crt, pixelRain, arCard,
  museumVitrine, xray, sectionCut, halftone, blueprint, lowLight, mirrorFloor, tiltShift,
].map(s => [s.id, s]));
