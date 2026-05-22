// js/cars.js — Car data & 3D model builders
export const ALL_CARS = [
  { id:'viper',   n:'VIPER GT',    col:0xcc0000, acc:.04,  ms:2.8, grip:.18, dft:.8,  icon:'🏎️', spd:4, grp:3, price:0 },
  { id:'dking',   n:'DRIFT KING',  col:0x0066cc, acc:.035, ms:2.5, grip:.22, dft:1.2, icon:'🚗', spd:3, grp:5, price:0 },
  { id:'thunder', n:'THUNDER X',   col:0xff6600, acc:.048, ms:3.2, grip:.14, dft:.6,  icon:'🏁', spd:5, grp:2, price:0 },
  { id:'phantom', n:'PHANTOM',     col:0x8800cc, acc:.042, ms:3.0, grip:.19, dft:.9,  icon:'👻', spd:4, grp:4, price:300 },
  { id:'shadow',  n:'SHADOW RS',   col:0x111111, acc:.05,  ms:3.4, grip:.15, dft:.7,  icon:'🖤', spd:5, grp:3, price:600 },
  { id:'neon',    n:'NEON BLITZ',  col:0x00ff88, acc:.038, ms:2.7, grip:.24, dft:1.1, icon:'💚', spd:3, grp:5, price:500 },
  { id:'inferno', n:'INFERNO',     col:0xff2200, acc:.052, ms:3.5, grip:.12, dft:.5,  icon:'🔥', spd:5, grp:2, price:900 },
  { id:'golden',  n:'GOLDEN AGE',  col:0xddaa00, acc:.044, ms:3.1, grip:.2,  dft:.85, icon:'👑', spd:4, grp:4, price:1500 },
];

// Helper: create mesh with position/properties (avoids Object.assign trap on readonly Vector3)
function mk(THREE, geo, mat, x, y, z, props = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  for (const k in props) m[k] = props[k];
  return m;
}

export function buildCarModel(THREE, carData, colorOverride) {
  const car = new THREE.Group();
  const color = colorOverride !== null && colorOverride !== undefined ? colorOverride : carData.col;
  const bm = new THREE.MeshStandardMaterial({ color, roughness: .12, metalness: .88 });
  const dm = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: .8, roughness: .2 });

  // Main body
  car.add(mk(THREE, new THREE.BoxGeometry(2.2, .75, 4.6), bm, 0, .6, 0, { castShadow: true }));
  // Front slope
  const fr = new THREE.Mesh(new THREE.BoxGeometry(2, .3, 1.2), bm);
  fr.position.set(0, .85, 2); fr.rotation.x = -.2; car.add(fr);
  // Rear block
  car.add(mk(THREE, new THREE.BoxGeometry(2.1, .4, .8), bm, 0, .85, -2));
  // Cabin
  car.add(mk(THREE, new THREE.BoxGeometry(1.7, .55, 1.8), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .05, metalness: .5, transparent: true, opacity: .55 }), 0, 1.2, -.2));
  // Windshield
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.65, .5), new THREE.MeshStandardMaterial({ color: 0x4488cc, transparent: true, opacity: .35, metalness: .9, roughness: .05 }));
  ws.position.set(0, 1.15, .72); ws.rotation.x = .35; car.add(ws);
  // Hood scoop
  car.add(mk(THREE, new THREE.BoxGeometry(.5, .12, .7), dm, 0, 1.05, 1.3));
  // Spoiler
  car.add(mk(THREE, new THREE.BoxGeometry(2.2, .06, .5), dm, 0, 1.35, -2.2));
  [-0.7, 0.7].forEach(x => car.add(mk(THREE, new THREE.BoxGeometry(.08, .4, .08), dm, x, 1.15, -2.2)));
  // Side skirts
  [-1.15, 1.15].forEach(x => car.add(mk(THREE, new THREE.BoxGeometry(.15, .3, 3.5), dm, x, .35, 0)));
  // Front bumper detail
  car.add(mk(THREE, new THREE.BoxGeometry(1.8, .15, .2), dm, 0, .4, 2.35));
  // Rear diffuser
  car.add(mk(THREE, new THREE.BoxGeometry(1.6, .1, .3), dm, 0, .3, -2.3));

  // Wheels — holders allow spin (X) + steering (Y) without conflict
  const wheels = [];
  const wm = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: .4, metalness: .6 });
  const rm = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: .9, roughness: .15 });
  [[-1.15, .38, 1.45], [1.15, .38, 1.45], [-1.15, .38, -1.45], [1.15, .38, -1.45]].forEach(([x, y, z]) => {
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .32, 14), wm);
    w.rotation.z = Math.PI / 2; w.castShadow = true;
    holder.add(w);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .33, 5), rm);
    r.rotation.z = Math.PI / 2; holder.add(r);
    car.add(holder); wheels.push(holder);
  });

  // Headlights + spot
  const hlights = [];
  [-0.7, 0.7].forEach(x => {
    car.add(mk(THREE, new THREE.CircleGeometry(.18, 8), new THREE.MeshBasicMaterial({ color: 0xffffee }), x, .7, 2.31));
    const sl = new THREE.SpotLight(0xffffdd, 3, 80, .35, .5);
    sl.position.set(x, .7, 2.35);
    const tgt = new THREE.Object3D(); tgt.position.set(x, 0, 15); car.add(tgt);
    sl.target = tgt; sl.castShadow = true; sl.shadow.mapSize.set(512, 512);
    car.add(sl); hlights.push(sl);
  });

  // Tail lights
  [-0.8, 0.8].forEach(x => car.add(mk(THREE, new THREE.BoxGeometry(.35, .12, .04), new THREE.MeshBasicMaterial({ color: 0xff0000 }), x, .65, -2.31)));
  // Exhaust
  [-0.4, 0.4].forEach(x => {
    const eg = new THREE.Mesh(new THREE.CircleGeometry(.08, 8), new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: .5 }));
    eg.position.set(x, .32, -2.31); eg.rotation.y = Math.PI; car.add(eg);
  });
  // Underglow
  const glow = new THREE.PointLight(color, .6, 5); glow.position.set(0, .1, 0); car.add(glow);

  return { group: car, wheels, hlights };
}
