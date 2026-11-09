// Every motion lives in its own file. To add one, create
// src/anims/<name>.js exporting { id, label, maxModels, layout(items, look, stage), update(items, t, look) }
// and list it here and in src/ui/catalog.js. Each item is a Group placed in the scene with
// userData.spinner (the part that rotates), built (the style's object),
// model, radius and height. Optional flags:
//   minModels / maxModels  how many models it needs and shows (default 1 and 1)
//   row                    more than one model stands in a row (see core/fit.js)
//   swings                 true, or (look) => bool: the model turns only a little each way
//   needsPerPart           needs a style that draws one mesh per part (see styles/index.js)
//   needsParts, spread, forceStyle, timed
//   layers: 2 + composite() for blending two styles (see blend.js).
// Old motion names keep working through MOTION_ALIASES in core/look.js.
import turn from './turn.js';
import explode from './explode.js';
import gather from './gather.js';
import morph from './morph.js';
import ditherDissolve from './dither_dissolve.js';
import splitCompare from './split_compare.js';
import glitchCut from './glitch_cut.js';

export const ANIMS = Object.fromEntries([
  turn, explode, gather, morph, ditherDissolve, splitCompare, glitchCut,
].map(a => [a.id, a]));
