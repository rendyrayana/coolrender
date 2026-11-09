import * as THREE from 'three';

// Explode layouts: where each part of an assembled model goes in its exploded
// view. A layout JSON (made by scripts/prepare_parts.py) holds one 4x4 matrix per
// part name, in glTF axes and the units of the GLB, and maps the assembled part
// to its hand-arranged exploded position.
//
// attachLayout() only stores the file matrices. They are converted to the
// model's own frame (it was recentred when loaded, and may have been turned
// since) by layoutMatrices(), each time the motion needs them.

const key = name => THREE.PropertyBinding.sanitizeNodeName(String(name));

export function attachLayout(model, json) {
  const parts = new Map();
  for (const entry of json.parts ?? []) parts.set(key(entry.name), new THREE.Matrix4().set(...entry.matrix)); // row-major in the file
  model.userData.layoutFile = { parts };
  const matched = model.children.filter(c => parts.has(key(c.name))).length;
  return { matched, total: model.children.length };
}

// Part name -> matrix in the model's current frame, for the parts of `model`
// (a model, or its parts stand-in). Missing parts are left out.
export function layoutMatrices(parts, base) {
  const file = base.userData.layoutFile;
  const out = new Map();
  if (!file) return out;
  const toModel = base.userData.transform;
  const fromModel = toModel.clone().invert();
  parts.forEach((part, i) => {
    const m = file.parts.get(key(part.name));
    if (m) out.set(i, toModel.clone().multiply(m).multiply(fromModel));
  });
  return out; // keyed by part index
}
