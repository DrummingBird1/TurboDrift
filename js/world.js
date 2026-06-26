// js/world.js — Track, city, environment generation (multi-track)
const T_N = 100, T_W = 18;
export const trackPts = [];
export const colls = [];
export const animated = [];
export const boostPads = [];
export let weather = { rain: 0, fog: 1 };

// ===== Track catalog =====
export const TRACKS = [
  {
    id: 'neon', name: 'NEON CITY', icon: '🌃',
    r: (t) => 320 + Math.sin(t * 3) * 90 + Math.cos(t * 5) * 50 + Math.sin(t * 7) * 25,
    fog: 0x060610, ground: 0x141f14, road: 0x2a2a2a, rim: 0xff4400, defaultRain: 0
  },
  {
    id: 'mountain', name: 'MOUNTAIN PASS', icon: '🏔️',
    r: (t) => 300 + Math.sin(t * 2) * 120 + Math.cos(t * 4) * 55 + Math.sin(t * 6) * 30,
    fog: 0x0b0a14, ground: 0x1b1410, road: 0x33302e, rim: 0x5566ff, defaultRain: 0.5
  },
  {
    id: 'coast', name: 'COASTAL LOOP', icon: '🌊',
    r: (t) => 340 + Math.sin(t * 3) * 70 + Math.cos(t * 5) * 35 + Math.sin(t * 8) * 22,
    fog: 0x07121c, ground: 0x102028, road: 0x2a2e30, rim: 0x00ccff, defaultRain: 0
  }
];

let CFG_T = TRACKS[0];
let curTrackIdx = 0;
export function getTrackIdx() { return curTrackIdx; }
export function getTrack() { return CFG_T; }

function trackR(t) { return CFG_T.r(t); }
function isNearTrack(x, z, m) { for (const t of trackPts) if (Math.hypot(t.x - x, t.z - z) < T_W + m) return true; return false; }
function collFree(x, z, r) { for (const c of colls) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return false; return true; }

let rainMesh = null, worldGroup = null;

function disposeWorld(scene) {
  if (!worldGroup) return;
  worldGroup.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    }
  });
  scene.remove(worldGroup);
  worldGroup = null; rainMesh = null;
}

export function generate(THREE, scene, gfx, trackIdx = 0) {
  disposeWorld(scene);
  curTrackIdx = ((trackIdx % TRACKS.length) + TRACKS.length) % TRACKS.length;
  CFG_T = TRACKS[curTrackIdx];

  trackPts.length = 0; colls.length = 0; animated.length = 0; boostPads.length = 0;
  worldGroup = new THREE.Group();

  // Theme
  if (scene.fog) scene.fog.color.setHex(CFG_T.fog);
  scene.background = new THREE.Color(CFG_T.fog);
  weather.rain = CFG_T.defaultRain;

  for (let i = 0; i <= T_N; i++) {
    const t = (i / T_N) * Math.PI * 2;
    trackPts.push(new THREE.Vector3(Math.cos(t) * trackR(t), 0, Math.sin(t) * trackR(t)));
  }

  mkLights(THREE, worldGroup, gfx);
  mkSky(THREE, worldGroup);
  mkGround(THREE, worldGroup);
  mkRoad(THREE, worldGroup);
  mkCity(THREE, worldGroup);
  mkProps(THREE, worldGroup);
  mkBoostPads(THREE, worldGroup);
  mkRain(THREE, worldGroup);

  scene.add(worldGroup);
}

function mkLights(THREE, root, gfx) {
  root.add(new THREE.AmbientLight(0x1a2244, .55));
  root.add(new THREE.HemisphereLight(0x223355, 0x110a08, .35));
  const moon = new THREE.DirectionalLight(0x4466aa, .7);
  moon.position.set(200, 350, -250); moon.castShadow = true;
  moon.shadow.mapSize.set(gfx.shadowRes, gfx.shadowRes);
  const s = 450; moon.shadow.camera.near = 10; moon.shadow.camera.far = 900;
  moon.shadow.camera.left = -s; moon.shadow.camera.right = s; moon.shadow.camera.top = s; moon.shadow.camera.bottom = -s;
  root.add(moon);
  const rim = new THREE.DirectionalLight(CFG_T.rim, .12); rim.position.set(-100, 50, 0); root.add(rim);
}

function mkSky(THREE, root) {
  const n = 5000, sp = new Float32Array(n * 3), sc = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1), r = 800 + Math.random() * 300;
    sp[i * 3] = r * Math.sin(ph) * Math.cos(th); sp[i * 3 + 1] = Math.abs(r * Math.cos(ph)); sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const c = .4 + Math.random() * .6; sc[i * 3] = c; sc[i * 3 + 1] = c; sc[i * 3 + 2] = c + Math.random() * .3;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2, vertexColors: true, transparent: true, opacity: .85 }));
  root.add(stars); animated.push({ mesh: stars, type: 'twinkle' });

  const mm = new THREE.Mesh(new THREE.SphereGeometry(35, 32, 32), new THREE.MeshBasicMaterial({ color: 0xeeeedd }));
  mm.position.set(450, 280, -550); root.add(mm);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 32), new THREE.MeshBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: .06 }));
  halo.position.set(450, 280, -550); root.add(halo);

  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Mesh(
      new THREE.PlaneGeometry(60 + Math.random() * 80, 15 + Math.random() * 20),
      new THREE.MeshBasicMaterial({ color: 0x334455, transparent: true, opacity: .04 + Math.random() * .04, side: THREE.DoubleSide })
    );
    cloud.position.set((Math.random() - .5) * 1200, 150 + Math.random() * 100, (Math.random() - .5) * 1200);
    cloud.rotation.x = -Math.PI / 2;
    root.add(cloud);
    animated.push({ mesh: cloud, type: 'cloud', speed: .2 + Math.random() * .3, dir: Math.random() * Math.PI * 2 });
  }
}

function mkGround(THREE, root) {
  const gg = new THREE.PlaneGeometry(2500, 2500, 80, 80);
  const v = gg.attributes.position;
  for (let i = 0; i < v.count; i++) v.setZ(i, Math.sin(v.getX(i) * .008) * Math.cos(v.getY(i) * .008) * 3);
  gg.computeVertexNormals();
  const m = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: CFG_T.ground, roughness: .95 }));
  m.rotation.x = -Math.PI / 2; m.position.y = -.5; m.receiveShadow = true; root.add(m);
}

function mkRoad(THREE, root) {
  const sh = new THREE.Shape();
  for (let i = 0; i <= T_N; i++) {
    const t = (i / T_N) * Math.PI * 2, r = trackR(t) + T_W;
    if (!i) sh.moveTo(Math.cos(t) * r, Math.sin(t) * r);
    else sh.lineTo(Math.cos(t) * r, Math.sin(t) * r);
  }
  for (let i = T_N; i >= 0; i--) {
    const t = (i / T_N) * Math.PI * 2, r = trackR(t) - T_W;
    sh.lineTo(Math.cos(t) * r, Math.sin(t) * r);
  }
  // Rainy tracks get a wet, glossy road (low roughness, high metalness → streaky reflections)
  const wet = CFG_T.defaultRain > 0;
  const rm = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({
    color: wet ? new THREE.Color(CFG_T.road).multiplyScalar(.7).getHex() : CFG_T.road,
    roughness: wet ? .18 : .55, metalness: wet ? .85 : .2
  }));
  rm.rotation.x = -Math.PI / 2; rm.position.y = .03; rm.receiveShadow = true; root.add(rm);

  // Center dashes
  for (let i = 0; i < T_N; i += 3) {
    const t = (i / T_N) * Math.PI * 2, t2 = ((i + 1) / T_N) * Math.PI * 2;
    root.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(t) * trackR(t), .06, Math.sin(t) * trackR(t)),
        new THREE.Vector3(Math.cos(t2) * trackR(t2), .06, Math.sin(t2) * trackR(t2))
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .25 })
    ));
  }

  // Barriers + lights
  let lc = 0;
  for (let i = 0; i < T_N; i += 2) {
    const t = (i / T_N) * Math.PI * 2, r = trackR(t);
    [1, -1].forEach((side, si) => {
      const br = r + side * (T_W + 1.5), bx = Math.cos(t) * br, bz = Math.sin(t) * br;
      const bm = new THREE.Mesh(
        new THREE.BoxGeometry(.6, 1.2, 3.5),
        new THREE.MeshStandardMaterial({ color: i % 4 === 0 ? 0xff2200 : 0xcccccc, roughness: .4, metalness: .3, emissive: i % 4 === 0 ? 0x330000 : 0 })
      );
      bm.position.set(bx, .6, bz); bm.rotation.y = t; bm.castShadow = true; root.add(bm);
      colls.push({ x: bx, z: bz, r: 2.2 });
      if (i % 12 === 0 && si === 0 && lc < 28) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .15, 8), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: .8 }));
        pole.position.set(bx, 4, bz); root.add(pole);
        const col = i % 24 === 0 ? 0xff6600 : 0x88ccff;
        const pl = new THREE.PointLight(col, 2, 45); pl.position.set(bx, 8, bz); root.add(pl);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(.25), new THREE.MeshBasicMaterial({ color: col }));
        glow.position.set(bx, 8, bz); root.add(glow); lc++;
      }
    });
  }

  // Start line
  const fc = document.createElement('canvas'); fc.width = 128; fc.height = 32;
  const fx = fc.getContext('2d');
  for (let cx = 0; cx < 16; cx++) for (let cy = 0; cy < 4; cy++) { fx.fillStyle = (cx + cy) % 2 === 0 ? '#fff' : '#111'; fx.fillRect(cx * 8, cy * 8, 8, 8); }
  const ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(6, 1);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(T_W * 2, 3), new THREE.MeshStandardMaterial({ map: ft, roughness: .3 }));
  fl.rotation.x = -Math.PI / 2; fl.position.set(trackPts[0].x, .05, trackPts[0].z); root.add(fl);

  // Start arch
  const aw = T_W * 2 + 6, am = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: .7, roughness: .3 });
  [[-aw / 2], [aw / 2]].forEach(([ox]) => {
    const lp = new THREE.Mesh(new THREE.BoxGeometry(.8, 10, .8), am);
    lp.position.set(trackPts[0].x + ox, 5, trackPts[0].z); lp.castShadow = true; root.add(lp);
    colls.push({ x: trackPts[0].x + ox, z: trackPts[0].z, r: 1.5 });
  });
  const archBar = new THREE.Mesh(new THREE.BoxGeometry(aw, 1.2, 1.2), am);
  archBar.position.set(trackPts[0].x, 10, trackPts[0].z); root.add(archBar);
}

function mkCity(THREE, root) {
  const bMat = () => new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(.58 + Math.random() * .1, .08, .04 + Math.random() * .06),
    roughness: .75, metalness: .3
  });
  for (let i = 0; i < 150; i++) {
    const ang = Math.random() * Math.PI * 2, dist = 420 + Math.random() * 400;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    if (isNearTrack(x, z, 20) || !collFree(x, z, 15)) continue;
    const h = 12 + Math.random() * 65, w = 6 + Math.random() * 16, d = 6 + Math.random() * 16;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bMat());
    b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true; root.add(b);
    colls.push({ x, z, r: Math.max(w, d) / 2 + 1 });
    const wr = Math.min(Math.floor(h / 4), 6);
    for (let wy = 0; wy < wr; wy++) for (let wx = 0; wx < 3; wx++) if (Math.random() > .4) {
      const wm = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.6),
        new THREE.MeshBasicMaterial({ color: Math.random() > .4 ? 0xffdd88 : 0x88bbff, transparent: true, opacity: .3 + Math.random() * .5 })
      );
      wm.position.set(x + (wx - 1) * 3, wy * 4 + 4, z + d / 2 + .01);
      root.add(wm);
      if (Math.random() < .15) animated.push({ mesh: wm, type: 'windowFlicker', base: wm.material.opacity });
    }
  }

  // Towers
  [[200, 150, 0xff4400], [-220, -200, 0x00aaff], [0, 350, 0xff00aa]].forEach(([tx, tz, col]) => {
    if (isNearTrack(tx, tz, 25)) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: .8, roughness: .3 });
    const h = 75;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 3, h, 8), mat);
    trunk.position.set(tx, h / 2, tz); trunk.castShadow = true; root.add(trunk);
    colls.push({ x: tx, z: tz, r: 5 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(5, 4, 3, 8), mat);
    top.position.set(tx, h - 1, tz); root.add(top);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, 15), mat);
    antenna.position.set(tx, h + 7.5, tz); root.add(antenna);
    const pl = new THREE.PointLight(col, 4, 90); pl.position.set(tx, h + 15, tz); root.add(pl);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({ color: col }));
    gl.position.set(tx, h + 15, tz); root.add(gl);
    animated.push({ mesh: gl, type: 'blink', phase: Math.random() * Math.PI * 2 });
  });

  // Cranes
  [[320, 220], [-300, -270]].forEach(([cx, cz]) => {
    if (isNearTrack(cx, cz, 25)) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0xddaa00, roughness: .4, metalness: .6 });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 55, 4), mat);
    tower.position.set(cx, 27.5, cz); tower.castShadow = true; root.add(tower);
    colls.push({ x: cx, z: cz, r: 4 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(45, 1.2, 1.2), mat);
    arm.position.set(cx + 12, 55, cz); root.add(arm);
    const wg = new THREE.Mesh(new THREE.SphereGeometry(.35), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    wg.position.set(cx, 57, cz); root.add(wg);
    animated.push({ mesh: wg, type: 'blink', phase: Math.random() * Math.PI * 2 });
  });

  // Gas stations
  [trackPts[25], trackPts[60]].forEach((tp, i) => {
    const ox = (i === 0 ? 1 : -1) * 50;
    const x = tp.x + ox, z = tp.z + ox;
    if (isNearTrack(x, z, 20)) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: .5, metalness: .3 });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(12, .4, 8), mat);
    canopy.position.set(x, 5, z); canopy.castShadow = true; root.add(canopy);
    colls.push({ x, z, r: 7 });
    [[-5, -3], [-5, 3], [5, -3], [5, 3]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, 5), mat);
      post.position.set(x + px, 2.5, z + pz); root.add(post);
    });
    [-2.5, 2.5].forEach(px => {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(1, 2.5, .7), new THREE.MeshStandardMaterial({ color: 0xcc0000, metalness: .5 }));
      pump.position.set(x + px, 1.25, z); root.add(pump);
    });
    const nl = new THREE.PointLight(0xffffff, 1.5, 18); nl.position.set(x, 4.5, z); root.add(nl);
    const shop = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 5), new THREE.MeshStandardMaterial({ color: 0x443322, roughness: .7 }));
    shop.position.set(x, 2, z - 7); shop.castShadow = true; root.add(shop);
    colls.push({ x, z: z - 7, r: 7 });
  });

  // Billboards
  const colors = [0xff2200, 0x00aaff, 0xffaa00, 0x00ff88, 0xff00aa];
  for (let i = 0; i < 10; i++) {
    const idx = Math.floor(Math.random() * T_N), t = (idx / T_N) * Math.PI * 2, r = trackR(t);
    const side = Math.random() > .5 ? 1 : -1, off = T_W + 14 + Math.random() * 12;
    const bx = Math.cos(t) * (r + off * side), bz = Math.sin(t) * (r + off * side);
    if (isNearTrack(bx, bz, 5)) continue;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.2, .25, 7), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: .7 }));
    post.position.set(bx, 3.5, bz); root.add(post);
    const col = colors[i % colors.length];
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(5, 2.5, .2),
      new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(.15), roughness: .4 })
    );
    board.position.set(bx, 8.5, bz); board.rotation.y = t; root.add(board);
    colls.push({ x: bx, z: bz, r: 2 });
    animated.push({ mesh: board, type: 'billboard', phase: Math.random() * Math.PI * 2 });
  }
}

function mkProps(THREE, root) {
  for (let i = 0; i < 250; i++) {
    const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 500;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    if (isNearTrack(x, z, 12) || !collFree(x, z, 4)) continue;
    const h = 3 + Math.random() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.2, .35, h * .4), new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: .9 }));
    trunk.position.set(x, h * .2, z); trunk.castShadow = true; root.add(trunk);
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(1.2 + Math.random() * 1.2, 5, 4),
      new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(.25 + Math.random() * .1, .35, .12 + Math.random() * .08), roughness: .9 })
    );
    leaves.position.set(x, h * .55, z); leaves.scale.y = 1.3; leaves.castShadow = true; root.add(leaves);
    colls.push({ x, z, r: 1.5 });
  }

  // Street lamps
  let ll = 0;
  for (let i = 0; i < T_N; i += 6) {
    const t = (i / T_N) * Math.PI * 2, r = trackR(t) + T_W + 5;
    const lx = Math.cos(t) * r, lz = Math.sin(t) * r;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, 5), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: .8 }));
    pole.position.set(lx, 2.5, lz); root.add(pole);
    if (ll < 18) {
      const l = new THREE.PointLight(0xffddaa, 1, 20); l.position.set(lx, 5.2, lz); root.add(l); ll++;
    }
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.15), new THREE.MeshBasicMaterial({ color: 0xffddaa }));
    bulb.position.set(lx, 5.2, lz); root.add(bulb);
  }

  // Cones near start
  for (let i = -5; i <= 5; i++) {
    const cx = trackPts[0].x + i * 2.5, cz = trackPts[0].z + 14;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.2, .5, 6), new THREE.MeshStandardMaterial({ color: 0xff6600 }));
    cone.position.set(cx, .25, cz); root.add(cone);
    colls.push({ x: cx, z: cz, r: .5 });
  }
}

function mkBoostPads(THREE, root) {
  const positions = [10, 25, 42, 58, 75, 90];
  for (const idx of positions) {
    const t = (idx / T_N) * Math.PI * 2;
    const cx = Math.cos(t) * trackR(t), cz = Math.sin(t) * trackR(t);
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(4, .05, 4),
      new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 1.5, transparent: true, opacity: .8 })
    );
    pad.position.set(cx, .08, cz); pad.rotation.y = t; root.add(pad);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let k = -1; k <= 1; k++) {
      const arr = new THREE.Mesh(new THREE.ConeGeometry(.4, .9, 3), arrowMat);
      arr.position.set(cx, .15, cz);
      arr.rotation.x = Math.PI / 2; arr.rotation.z = t;
      root.add(arr);
    }
    boostPads.push({ x: cx, z: cz, mesh: pad, cd: 0 });
    animated.push({ mesh: pad, type: 'boost', phase: Math.random() * Math.PI * 2 });
  }
}

function mkRain(THREE, root) {
  const N = 1500;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - .5) * 400;
    pos[i * 3 + 1] = Math.random() * 80;
    pos[i * 3 + 2] = (Math.random() - .5) * 400;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainMesh = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x88aacc, size: .6, transparent: true, opacity: 0, sizeAttenuation: true
  }));
  root.add(rainMesh);
}

export function setWeather(w) { weather = { ...weather, ...w }; }
export function getWeather() { return weather; }

export function updateAnimated(time, carPos) {
  for (const o of animated) {
    if (o.type === 'cloud') {
      o.mesh.position.x += Math.cos(o.dir) * o.speed * .05;
      o.mesh.position.z += Math.sin(o.dir) * o.speed * .05;
      if (Math.abs(o.mesh.position.x) > 800) o.mesh.position.x *= -1;
    } else if (o.type === 'blink') {
      o.mesh.material.opacity = .5 + Math.sin(time * 2 + o.phase) * .5;
    } else if (o.type === 'windowFlicker') {
      if (Math.random() < .003) o.mesh.material.opacity = o.base * (.4 + Math.random() * .6);
    } else if (o.type === 'twinkle') {
      o.mesh.material.opacity = .7 + Math.sin(time * .8) * .15;
    } else if (o.type === 'billboard') {
      o.mesh.material.emissiveIntensity = .15 + Math.sin(time * 3 + o.phase) * .1;
    } else if (o.type === 'boost') {
      const pulse = .7 + Math.sin(time * 8 + o.phase) * .3;
      o.mesh.material.emissiveIntensity = pulse;
      o.mesh.material.opacity = .5 + pulse * .4;
    }
  }
  if (rainMesh) {
    const targetOpacity = weather.rain * .7;
    rainMesh.material.opacity += (targetOpacity - rainMesh.material.opacity) * .05;
    if (rainMesh.material.opacity > .01 && carPos) {
      const pos = rainMesh.geometry.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= weather.rain * 2;
        if (arr[i + 1] < 0) {
          arr[i] = carPos.x + (Math.random() - .5) * 200;
          arr[i + 1] = 60 + Math.random() * 30;
          arr[i + 2] = carPos.z + (Math.random() - .5) * 200;
        }
      }
      pos.needsUpdate = true;
    }
  }
}

export function getStartPos() {
  return {
    x: trackPts[0].x, z: trackPts[0].z + 8,
    angle: Math.atan2(trackPts[1].x - trackPts[0].x, trackPts[1].z - trackPts[0].z)
  };
}

// Nearest track-point index [0..T_N], and a fractional [0,1) progress around the loop.
export function nearestIdx(pos) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < trackPts.length; i++) {
    const d = (trackPts[i].x - pos.x) ** 2 + (trackPts[i].z - pos.z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
export function trackFrac(pos) { return nearestIdx(pos) / T_N; }

export function checkLap(pos, spd, crossed, lapSt) {
  const d2s = Math.hypot(pos.x - trackPts[0].x, pos.z - trackPts[0].z);
  let newCrossed = crossed, newLapSt = lapSt, lapDone = false, lapTime = 0;
  if (d2s < 22 && !crossed && spd > .3) { newLapSt = performance.now(); newCrossed = true; }
  else if (d2s < 18 && crossed && (performance.now() - lapSt) > 5000) {
    lapTime = performance.now() - lapSt; newLapSt = performance.now(); lapDone = true;
  }
  if (d2s > 35) newCrossed = false;
  return { crossed: newCrossed, lapSt: newLapSt, lapDone, lapTime };
}
