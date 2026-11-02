// Every animation lives in its own file. To add one, create
// src/anims/<name>.js exporting { id, label, maxModels, layout(items), update(items, t, look) }
// and list it here. Each item is a Group placed in the scene with
// userData.spinner (the part that rotates), built (the style's object),
// model, radius and height. Optional: needsParts, spread, forceStyle,
// layers: 2 + composite() for blending two styles (see blend.js).
import turntable from './turntable.js';
import lineup from './lineup.js';
import morph from './morph.js';
import explode from './explode.js';
import gather from './gather.js';
import explodedOrbit from './exploded_orbit.js';
import handAssembly from './hand_assembly.js';
import ditherDissolve from './dither_dissolve.js';
import splitCompare from './split_compare.js';
import glitchCut from './glitch_cut.js';

export const ANIMS = Object.fromEntries([
  turntable, lineup, morph, explode, gather, explodedOrbit, handAssembly, ditherDissolve, splitCompare, glitchCut,
].map(a => [a.id, a]));
