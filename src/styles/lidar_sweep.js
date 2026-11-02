import * as THREE from 'three';
import { progress } from './shared.js';
import { cloud } from './cloud.js';

// A phone-LiDAR pass: a thin scan line circles the object and leaves points behind.
export default {
  id: 'lidar_sweep',
  label: 'LiDAR sweep',
  timed: true, // plays once over the shot, so it can't loop seamlessly
  build(model) {
    const uSweep = { value: 0 };
    const points = cloud(model, {
      key: 'lidar',
      extra: {
        uniforms: { uSweep },
        varyings: 'varying float vAngle;',
        vertex: 'vAngle = atan(position.z, position.x) / 6.2831853 + 0.5;',
        discard: 'if (vAngle > uSweep) discard;',
        fragment: 'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.6, 0.95, 1.0), 1.0 - smoothstep(0.0, 0.03, uSweep - vAngle));',
      },
    });
    const { radius: r, height: h } = model.userData;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -h * 0.05, 0), new THREE.Vector3(0, h * 1.05, 0)]),
      new THREE.LineBasicMaterial({ color: 0x9ff0ff, transparent: true, blending: THREE.AdditiveBlending }));
    const group = new THREE.Group().add(points, line);
    group.userData.update = (t, look) => {
      const s = Math.min(1, progress(t, look) / 0.75);
      uSweep.value = s;
      // The line sits on the circle at the sweep angle (matching the shader's atan).
      const a = (s - 0.5) * Math.PI * 2;
      line.position.set(Math.cos(a) * r * 1.05, 0, Math.sin(a) * r * 1.05);
      line.material.opacity = 1 - THREE.MathUtils.smoothstep(s, 0.95, 1);
    };
    return group;
  },
};
