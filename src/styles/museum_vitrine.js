import * as THREE from 'three';
import { meshes, progress, smooth, ownMaterial } from './shared.js';

// The object stands in a glass case with a soft top light; then the glass fades away.
export default {
  id: 'museum_vitrine',
  label: 'Museum vitrine',
  timed: true, // plays once over the shot, so it can't loop seamlessly
  extent: 1.6, // props reach beyond the object
  build(model) {
    const { radius: r, height: h } = model.userData;
    const body = meshes(model, ownMaterial);
    const w = r * 2.3, ch = h * 1.06;
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xc9d3dc, transparent: true, opacity: 0.6 });
    const box = new THREE.BoxGeometry(w, ch, w).translate(0, ch / 2, 0);
    const glass = new THREE.Mesh(box, glassMat);
    glass.renderOrder = 2;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), edgeMat);
    // A glowing panel in the lid: the soft top light.
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6e6, transparent: true });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, w * 0.8), lightMat);
    panel.rotation.x = Math.PI / 2;
    panel.position.y = ch * 0.995;
    const topLight = new THREE.PointLight(0xfff3e0, 0, 0, 0);
    topLight.position.y = ch * 0.95;
    const caseGroup = new THREE.Group().add(glass, edges, panel, topLight);
    const group = new THREE.Group().add(body, caseGroup);
    group.userData.update = (t, look) => {
      const p = progress(t, look);
      const fade = 1 - smooth(0.55, 0.8, p);
      glassMat.opacity = 0.1 * fade;
      edgeMat.opacity = 0.6 * fade;
      lightMat.opacity = fade;
      topLight.intensity = 1.5 * fade;
      caseGroup.visible = fade > 0.001;
      caseGroup.rotation.y = -group.parent.rotation.y; // the case stays still while the object turns
    };
    return group;
  },
};
