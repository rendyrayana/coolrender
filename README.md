# coolrender

Render 3D scans as clean turntable video clips, right in your browser. Drop in a model, pick a style, press Export. No install, no account, and nothing is uploaded: everything runs on your computer.

![coolrender app](docs/app.png)

## 30-second quick start

1. Open the app: [rendyrayana.github.io/coolrender](https://rendyrayana.github.io/coolrender/). To run it yourself, use `npm install && npm run dev`.
2. Drag a model onto the stage, or click **Try the sample**.
3. Pick a look under **Quick start** or browse the **Style** gallery (hover a style for a one-line description).
4. Press **Export** (or <kbd>E</kbd>). Your video downloads when the progress bar finishes.

The defaults give a 6-second, 1080p, 30 fps MP4 with one smooth 360° turn. Your settings are remembered for next time.

![All 35 styles](docs/styles.jpg)

## Supported formats

| Import | Notes |
|---|---|
| GLB, GLTF | GLB preferred. For `.gltf`, drop the `.bin` and texture files together with it. |
| OBJ | Drop the `.obj` together with its `.mtl` and images. An `.obj` dropped with just one image and no `.mtl` uses that image as its texture. |
| PLY | Meshes or point clouds, with vertex colours. |
| STL | Geometry only. |

| Export | Notes |
|---|---|
| MP4 (H.264) | Plays everywhere: PowerPoint, Keynote, phones. No transparency. |
| WebM (VP9) | Keeps a transparent background. |
| PNG sequence (.zip) | `0001.png`, `0002.png`, …, with transparency. Good for editing software. |

Video export uses WebCodecs, so use Chrome or Edge (recent Safari works too). PNG export works in any browser. Every frame is rendered at an exact time, one after another, not in real time. A slow computer takes longer, but it never drops a frame.

## The panel

- **Quick start:** built-in looks (Studio dark, Clay light, Point cloud). **Save look** stores all settings in a small `.json` file; **Load look** (or dropping the file on the stage) brings them back.
- **Model:** the loaded models, plus **Fix orientation** (Y-up, Z-up, tip, turn, auto-fit). Heavy models (over 300k triangles) trigger an offer to simplify.
- **Style:** the gallery, in tabs: Basics, Scanning, Analysis, Retro, Staging.
- **Motion:** how it moves: a turntable, a lineup, styles blending into each other, or parts assembling.
- **Look:** background (dark `#111111`, light `#F5F5F5`, transparent), ground shadow, and under **Lighting & camera** the key and rim light, camera height, lens and frame margin. Point styles get **Point options** (count, size, brightness, drift).
- **Output:** duration, resolution (720p, 1080p, 4K, square), FPS (24, 30, 60), **Loop** (constant speed, so the clip repeats seamlessly) and format.

The camera is fixed for exports: a little above the object, with a long lens, auto-fitted to the frame height with a margin. You can drag the preview to look around, and <kbd>R</kbd> resets it. Rendered frames contain only the object, never text or UI.

**Shortcuts:** <kbd>Space</kbd> play/pause · <kbd>R</kbd> reset camera · <kbd>E</kbd> export

**Friendly messages:** unsupported files, missing textures or material files, and heavy models show a message with what to do, not an error.

## Styles

| Tab | Style | What you see |
|---|---|---|
| Basics | Studio (`studio`) | Textured, as scanned |
|  | Clay (`clay`) | Light-grey and untextured: pure shape |
|  | Point cloud (`points`) | Round points sampled from the surface, in the scan’s colours |
|  | PS1 (`ps1`) | PS1 look: vertex snapping, affine textures, 15-bit colour |
|  | Wireframe (`wire`) | Clay with a thin wireframe on top |
|  | Heatmap (`heatmap`) | Grey-to-slate ramp of per-vertex values. Drop a CSV with the model, or load two models to compare them |
|  | Contour (`contour`) | Topographic slice lines over clay |
| Scanning | Photo rig (`photo_rig`) | Cameras flash around the object, then the mesh appears |
|  | Structured light (`stripes`) | Structured-light stripes sweep across and build the scan |
|  | Depth noise (`depth_noise`) | Noisy Kinect-style depth points settle into a mesh |
|  | LiDAR sweep (`lidar_sweep`) | A scan line circles the object and leaves points behind |
|  | Points to mesh (`point_to_mesh`) | Points connect into triangles, then fill into a surface |
|  | Pixel rain (`pixel_rain`) | Texture pixels fall from above and settle onto the surface |
| Analysis | Heat pulse (`heat_pulse`) | Heatmap with pulses spreading from the largest difference |
|  | Ghost diff (`ghost_diff`) | The original with a shimmering ghost of the second model |
|  | Anchor glow (`anchor_glow`) | Clay with carved marks and anchor areas softly glowing |
|  | Section cut (`section_cut`) | A plane slices in and shows a cross-section |
|  | X-ray (`xray`) | Translucent glowing shell |
|  | Print layers (`print_layers`) | Grows bottom-up in 3D-printer layers |
|  | Live decimation (`decimate_live`) | The triangle count drops while the silhouette holds |
|  | UV unfold (`uv_unfold`) | Flattens into its UV atlas and folds back |
|  | Texel steps (`texel_step`) | Texture resolution steps 32 → 256 px |
|  | Filament colours (`filament_snap`) | Colours snap to 8 filament swatches |
|  | Palette cycle (`palette_cycle`) | 16-colour palette cycling (CLUT) |
| Retro | PS1 jitter (`vertex_jitter`) | PS1 with strong vertex wobble that settles |
|  | PS1 on CRT (`crt`) | PS1 on a CRT: scanlines, curvature, glow |
|  | ASCII (`ascii`) | Drawn in characters |
|  | Halftone (`halftone`) | One-colour print dots on paper |
|  | Ink (`ink`) | Black outlines on paper white |
|  | Blueprint (`blueprint`) | White lines on blue, with grid and dimension ticks |
|  | Tilt-shift (`tilt_shift`) | Shallow depth of field: a miniature look |
| Staging | AR card (`ar_card`) | The model rises out of an AR marker card |
|  | Museum vitrine (`museum_vitrine`) | A glass case with a top light, then the glass fades away |
|  | Mirror floor (`mirror_floor`) | Glossy dark floor reflection |
|  | Low light (`low_light`) | Almost black, revealed by a circling rim light |

Most styles change over the length of the shot, and the object keeps turning while they do. Styles that play once (build-ups, reveals) don't loop seamlessly; the panel tells you when Loop is on with one of them.

## Motion

| Motion | What happens |
|---|---|
| Turntable | One model, one 360° turn (ease-in-out, or constant with Loop) |
| Lineup | 2–4 models side by side, turning in sync |
| Gather | Scattered points converge into the object, then drift (always the point cloud style) |
| Morph | Crossfade from Style to Second style (e.g. studio → PS1) |
| Split | A divider sweeps across: Style on the left, Second style on the right |
| Dissolve | Transition from Style to Second style through a 4×4 dither |
| Glitch | RGB-split block glitch as the cut from Style to Second style |
| Explode | Parts fly in from apart, assemble, hold, then the object turns |
| Orbit | Parts hover apart, spinning around their own centres, then assemble |
| Assembly | Parts arrive one by one, bottom first, then the object turns |

**Two models:** the blend motions show a second loaded model as the second layer (a scan vs. its PS1 version, say). Heatmap, heat pulse and ghost diff measure the distance to the other loaded model (original vs. rescan).

**Parts:** explode, orbit and assembly use a model's separate meshes as parts, so export your segmented model with one mesh per part. A single scan is split into its loose pieces, or into 8 blocks if it is one piece.

**Heat values:** drop a `.csv` or `.txt` with one number per vertex (e.g. Hausdorff distances) together with the model; it is matched by file name. For OBJ files the values follow the `v` lines of the file. Without values, the heat styles use the distance to the other loaded model, the model's vertex colours, or height.

## Batch mode (command line)

For many shots with the same look, or for rendering without clicking:

```bash
npm install
npx playwright install chromium
npm run render -- shots.json
```

`shots.json` lists the shots. The one in this repo uses the bundled sample, so it works right away. Put your own models in `models/` (that folder is not committed).

```json
{
  "defaults": { "resolution": "1080p", "fps": 30, "bg": "dark", "rim": 1, "models": ["/sample/teapot.glb"] },
  "shots": [
    { "id": "sample_studio", "style": "studio", "anim": "turntable", "seconds": 6 },
    { "id": "sample_morph", "style": "clay", "styleB": "ps1", "anim": "morph", "seconds": 6 }
  ]
}
```

A shot can set `models`, `style`, `styleB`, `anim`, `seconds`, `bg`, `loop`, `fps`, `resolution`, `width`/`height`, `shadow`, `sameSize`, `fillWidth` (lineup: share of the frame width to fill), `key`, `rim`, `elevation`, `fov`, `margin`, `drift`, `pointCount`, `pointSize`, `pointBright`, `up: "z"`, `tip` and `rotate` (degrees about x and y; a list gives one value per model) and `heat` (a CSV in `models/`). [examples/film.json](examples/film.json) sketches a longer film; replace its model names with your files.

For each shot the renderer steps time in fixed 1/fps increments in headless Chromium, writes `renders/<id>/0001.png …`, encodes `renders/<id>.mp4` (H.264, yuv420p, CRF 16) with the bundled ffmpeg (plus a ProRes 4444 `.mov` with alpha for transparent shots), and prints the render time. Models above 300k triangles are simplified automatically. To render only some shots, add their ids: `npm run render -- shots.json sample_studio`.

`npm run dev` also shows a **Shot list** dropdown with your `shots.json`, to check framing before rendering.

**Preparing big scans.** [scripts/prepare_scan.py](scripts/prepare_scan.py) uses Blender to join meshes, apply a texture, simplify to a triangle budget, shrink the texture and write a GLB, with optional clean-up (stand a tilted scan upright, trim scanner floor, drop loose fragments). [scripts/obj2glb.mjs](scripts/obj2glb.mjs) converts a textured OBJ without Blender.

## Publishing

The repo has a GitHub Pages workflow ([.github/workflows/pages.yml](.github/workflows/pages.yml)). In the repository settings, set **Pages → Source** to **GitHub Actions**, then push to `main`. The build uses relative paths, so it works at any URL.

## Adding a style or animation

Each style is one file in `src/styles/` that exports `{ id, label, build(model, ctx), render?(stage) }`. Anything it builds can have `userData.update(t, look)`, which runs every frame. `src/core/shaderPatch.js` adds GLSL to normal three.js materials, and `src/styles/cloud.js` builds point clouds. Register the file in `src/styles/index.js` and give it a tab and a tooltip in `src/ui/catalog.js`. Run `npm run thumbnails` to render its gallery picture.

Each animation is one file in `src/anims/` that exports `{ id, label, maxModels, layout(items), update(items, t, look) }`; `src/anims/blend.js` makes two-style blends. Register it in `src/anims/index.js`.

## Tests

`npm test` drives the app like a user: it opens the sample, picks Point cloud, exports MP4, a PNG zip and a transparent WebM, and checks the unsupported-file message. Pass extra files to also check the heavy-model and missing-texture messages: `node tests/ui.mjs <out-dir> heavy.obj heavy.jpg other.obj`.

## License

MIT. See [LICENSE](LICENSE). The PS1 shaders come from [lofi-viewer](https://github.com/rendyrayana/lofi-viewer). The sample teapot is a photogrammetry scan by the author.

coolrender by Rendy Rayana Herdiana Putra
