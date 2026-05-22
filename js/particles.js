// js/particles.js — Particle effects system
let parts = [], meshes = [], group, maxAlloc = 0, THREE_ref = null;

export function init(THREE, scene, maxCount) {
  THREE_ref = THREE;
  group = new THREE.Group();
  maxAlloc = Math.max(maxCount, 800); // pre-allocate enough for any preset switch
  const geo = new THREE.BoxGeometry(.18, .18, .18); // cheaper than sphere
  for (let i = 0; i < maxAlloc; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; group.add(m); meshes.push(m);
  }
  scene.add(group);
}

export function spawn(pos, vel, life, decay, size, color) {
  parts.push({ p: pos.clone(), v: vel.clone(), l: life, l0: life, d: decay, s: size, c: color.clone() });
}

export function update(dt, max) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.l -= p.d * dt;
    p.p.x += p.v.x * dt; p.p.y += p.v.y * dt; p.p.z += p.v.z * dt;
    p.v.y -= dt * .5;
    p.v.x *= 1 - dt * 0.4;
    p.v.z *= 1 - dt * 0.4;
    if (p.p.y < 0.05) { p.p.y = 0.05; p.v.y = Math.abs(p.v.y) * 0.3; }
    if (p.l <= 0) parts.splice(i, 1);
  }
  const lim = Math.min(meshes.length, max);
  for (let i = 0; i < meshes.length; i++) {
    if (i < parts.length && i < lim) {
      const p = parts[i], m = meshes[i];
      m.visible = true; m.position.copy(p.p); m.scale.setScalar(p.s * Math.max(.2, p.l));
      m.material.color.copy(p.c); m.material.opacity = Math.max(0, Math.min(1, p.l * .6));
    } else meshes[i].visible = false;
  }
  if (parts.length > lim) parts.length = lim;
}

export function clear() { parts.length = 0; }
export function count() { return parts.length; }

// Helpers for common effects
export function shockwave(pos, color, count = 20) {
  if (!THREE_ref) return;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    spawn(pos.clone().setY(pos.y + .2),
      new THREE_ref.Vector3(Math.cos(ang) * 4, .5 + Math.random() * .8, Math.sin(ang) * 4),
      1, 1.5, .25, color.clone());
  }
}

export function smokeTrail(pos, vel, color) {
  if (!THREE_ref) return;
  spawn(pos, vel, 1, .8, .35, color);
}
