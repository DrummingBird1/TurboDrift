// js/particles.js — Particle effects system
let parts = [], meshes = [], group;

export function init(THREE, scene, maxCount) {
  group = new THREE.Group();
  const geo = new THREE.SphereGeometry(.1, 3, 2);
  for (let i = 0; i < maxCount; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    m.visible = false; group.add(m); meshes.push(m);
  }
  scene.add(group);
}

export function spawn(pos, vel, life, decay, size, color) {
  parts.push({ p: pos.clone(), v: vel.clone(), l: life, d: decay, s: size, c: color.clone() });
}

export function update(dt, max) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.l -= p.d * dt;
    p.p.x += p.v.x * dt; p.p.y += p.v.y * dt; p.p.z += p.v.z * dt;
    p.v.y -= dt * .5;
    if (p.l <= 0) parts.splice(i, 1);
  }
  const lim = Math.min(meshes.length, max);
  for (let i = 0; i < meshes.length; i++) {
    if (i < parts.length && i < lim) {
      const p = parts[i], m = meshes[i];
      m.visible = true; m.position.copy(p.p); m.scale.setScalar(p.s * p.l);
      m.material.color.copy(p.c); m.material.opacity = p.l * .6;
    } else meshes[i].visible = false;
  }
  if (parts.length > lim) parts.length = lim;
}

export function clear() { parts.length = 0; }
