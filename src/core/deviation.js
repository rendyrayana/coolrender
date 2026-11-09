import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Per-vertex "deviation" values for the deviation and ghost overlay styles.
// prepareDeviation() gives every mesh of the model the attribute aDeviation and
// says where the numbers came from:
//   stored     the custom attribute _deviation made by scripts/align_scans.py (millimetres)
//   csv        values dropped with the model (see core/heat.js); the unit is whatever the file holds
//   reference  distance to the next loaded model, after bringing both into one frame
//              (model units; only when look.heatReference is on)
//   height     nothing else exists, so height is shown (and the user is told)
// Only `stored` values have a known unit, so only they honour a fixed scale.
export function prepareDeviation(model, ctx) {
  const meshes = model.children.filter(c => c.isMesh);
  const set = (mesh, values) => mesh.geometry.setAttribute('aDeviation', new THREE.BufferAttribute(values, 1));
  let source;
  if (meshes.every(m => m.geometry.attributes._deviation)) {
    for (const m of meshes) m.geometry.setAttribute('aDeviation', m.geometry.attributes._deviation);
    source = 'stored';
  } else if (meshes.every(m => m.geometry.attributes.aHeat)) {
    for (const m of meshes) m.geometry.setAttribute('aDeviation', m.geometry.attributes.aHeat);
    source = 'csv';
  } else if (ctx.look.heatReference && referenceFor(model, ctx.models)) {
    const bvhs = registeredBvhs(model, referenceFor(model, ctx.models));
    for (const m of meshes) set(m, distances(m.geometry, bvhs));
    source = 'reference';
  } else {
    for (const m of meshes) {
      const pos = m.geometry.attributes.position;
      set(m, Float32Array.from({ length: pos.count }, (_, i) => pos.getY(i) / (model.userData.height || 1)));
    }
    source = 'height';
    ctx.warn?.(ctx.look.heatReference
      ? 'Deviation: load a second model to measure against. Showing height for now.'
      : 'Deviation: this model has no deviation values. Showing height. Make them with scripts/align_scans.py, drop a CSV with the model, or turn on "Measure against the second model".');
  }
  return { source, range: source === 'stored' ? null : percentileRange(meshes) };
}

// Where the highest value is, for the ripple pulse (model frame).
export function peakPosition(model) {
  let best = -Infinity;
  const peak = new THREE.Vector3(), p = new THREE.Vector3();
  for (const m of model.children.filter(c => c.isMesh)) {
    const a = m.geometry.attributes.aDeviation, pos = m.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) if (a.getX(i) > best) { best = a.getX(i); peak.copy(p.fromBufferAttribute(pos, i)); }
  }
  return peak;
}

// The 2nd to 98th percentile of all values, so a few outliers don't flatten the ramp.
export function percentileRange(meshes) {
  const values = [];
  for (const m of meshes) {
    const a = m.geometry.attributes.aDeviation;
    const step = Math.max(1, Math.floor(a.count / 100000));
    for (let i = 0; i < a.count; i += step) if (Number.isFinite(a.getX(i))) values.push(a.getX(i));
  }
  values.sort((x, y) => x - y);
  const lo = values[Math.floor(values.length * 0.02)] ?? 0, hi = values[Math.floor(values.length * 0.98)] ?? 1;
  return [lo, hi > lo ? hi : lo + 1];
}

// The model to measure against: the first other loaded model (the first model measures against the second).
export function referenceFor(model, models) {
  const others = models.filter(m => m !== model && !m.userData.isPointCloud);
  return others.length ? (models[0] === model ? others[0] : models[0]) : null;
}

// The reference's surfaces, moved into this model's frame (both were recentred separately).
function registeredBvhs(model, reference) {
  const toModel = model.userData.transform.clone().multiply(reference.userData.transform.clone().invert());
  return reference.children.filter(c => c.isMesh).map(m => {
    const geo = m.geometry.clone().applyMatrix4(toModel);
    if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
    return new MeshBVH(geo);
  });
}

function distances(geo, bvhs) {
  const pos = geo.attributes.position, p = new THREE.Vector3(), hit = {};
  return Float32Array.from({ length: pos.count }, (_, i) => {
    p.fromBufferAttribute(pos, i);
    let best = Infinity;
    for (const bvh of bvhs) { bvh.closestPointToPoint(p, hit); best = Math.min(best, hit.distance); }
    return best;
  });
}
