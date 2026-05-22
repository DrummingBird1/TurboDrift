// js/game.js — Main orchestrator & render loop
import { dbGet, dbSet } from './storage.js';
import { setupAuth, doRegister, doLogin, skipAuth, switchAuthTab } from './auth.js';
import { showPanel, initMenuParticles, toggleSetting, setGfxPreset, loadSettings, saveSettings } from './menu.js';
import { MISSIONS, renderMissions, checkMissions } from './missions.js';
import { ACHS, renderAchievements, checkAchievements } from './achievements.js';
import { ALL_CARS, buildCarModel } from './cars.js';
import { renderShop, getOwnedCars } from './shop.js';
import * as audio from './audio.js';
import * as particles from './particles.js';
import * as world from './world.js';
import { updatePhysics } from './physics.js';
import { updateHUD, updateMinimap, updateDebug } from './hud.js';

// ========== GLOBALS ==========
let scene, camera, renderer, clock;
let carObj = null;
let aiCars = []; // {group, wheels, S, trackIdx}
let ghostObj = null, ghostPath = [], ghostRecording = [], ghostPtr = 0;
let running = false, paused = false, raceStarted = false;
let currentUser = null;
let selCarIdx = 0;
const K = {};
const GFX = { shad:true, part:true, shk:true, spdLines:true, bloom:true, rain:true, debug:false, shadowRes:2048, pixRatio:2, drawDist:.0018, partMax:400, preset:'high' };
const CFG = { sfx:true, eng:true, vol:.6 };
const S = {
  p:null, v:null, a:0, av:0, hp:100, spd:0, gear:1, rpm:0, isDrift:false, dScore:0, driftToSave:0,
  nitro:100, kmh:0, shake:{x:0,y:0}, lapSt:0, bestLap:Infinity, curLap:0, crossed:false, totalLaps:0,
  hpCooldown:0, boostT:0, nitroActive:false, crashFrame:false, totalDist:0,
  gp:null, touch:null
};
const nitroRef = { val: 100 };
let camMode = 0;
let lastStatsFlush = 0;
let pendingStats = { speed:0, drift:0, distance:0 };
let statsCache = null;
let fps = 60, fpsAccum = 0, fpsTicks = 0;

// ========== EXPOSE TO HTML ==========
window.G = {
  showP: (id) => { showPanel(id); if (id === 'pMissions') refreshMissions(); if (id === 'pAch') refreshAch(); if (id === 'pShop') refreshShop(); if (id === 'pCar') renderCarGrid(); if (id === 'pCust') renderCustomization(); if (id === 'pStats') refreshStatsPanel(); },
  selCar: (i) => { selCarIdx = i; renderCarGrid(); },
  switchAuth: switchAuthTab,
  doRegister, doLogin, skipAuth,
  togS: (el) => { toggleSetting(el, GFX, CFG); if (el.id === 'tShd' && renderer) renderer.shadowMap.enabled = GFX.shad; if (el.id === 'tDbg') { const d = document.getElementById('debugO'); if (d) d.style.display = GFX.debug ? 'block' : 'none'; } },
  setGfx: (p) => setGfxPreset(p, GFX, renderer, scene),
  setVol: (v) => { CFG.vol = v / 100; audio.setVolume(CFG.vol); saveSettings(null, CFG); },
  setColor: setCarColor,
  beginRace, resume, toMenu, logout
};

// ========== AUTH ==========
setupAuth(async (username) => {
  currentUser = username;
  let data = await dbGet('user_' + username);
  if (!data) {
    data = { stats: { laps:0, bestLap:null, topSpeed:0, totalDrift:0, races:0, coins:0, distance:0, crashes:0 }, achievements:[], missions:{}, ownedCars:[], customization:{color:null} };
    await dbSet('user_' + username, data);
  }
  statsCache = data;
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainMenu').style.display = 'flex';
  document.getElementById('welcomeUser').innerHTML = 'ברוך הבא, <strong>' + escapeHTML(username) + '</strong>';
  refreshCoins();
  renderCarGrid();
});

function escapeHTML(s) { return String(s).replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#39;' }[c])); }

async function logout() {
  await flushStats();
  currentUser = null; running = false; paused = false;
  statsCache = null;
  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  audio.muteEngine(); audio.stopMusic();
}

// ========== DATA ==========
async function getUserData() {
  if (statsCache) return statsCache;
  const d = await dbGet('user_' + currentUser) ||
    { stats:{laps:0,bestLap:null,topSpeed:0,totalDrift:0,races:0,coins:0,distance:0,crashes:0}, achievements:[], missions:{}, ownedCars:[], customization:{color:null} };
  statsCache = d;
  return d;
}
async function saveUserData(data) { statsCache = data; await dbSet('user_' + currentUser, data); }

async function refreshCoins() {
  const data = await getUserData();
  document.getElementById('coinDisplay').textContent = '🪙 ' + (data.stats.coins || 0);
}

async function refreshMissions() { const data = await getUserData(); renderMissions(document.getElementById('missionList'), data.stats, data.missions); }
async function refreshAch() { const data = await getUserData(); renderAchievements(document.getElementById('achGrid'), data.achievements); }
async function refreshShop() { const data = await getUserData(); renderShop(document.getElementById('shopGrid'), data.ownedCars, data.stats.coins || 0); }

async function refreshStatsPanel() {
  const data = await getUserData();
  const s = data.stats;
  const el = document.getElementById('statsBody');
  if (!el) return;
  el.innerHTML = `
    <div class="srow"><span>מירוצים</span><span class="sval">${s.races}</span></div>
    <div class="srow"><span>הקפות</span><span class="sval">${s.laps}</span></div>
    <div class="srow"><span>הקפה הכי טובה</span><span class="sval">${s.bestLap ? s.bestLap.toFixed(2) + 's' : '—'}</span></div>
    <div class="srow"><span>מהירות מקסימלית</span><span class="sval">${Math.floor(s.topSpeed)} קמ"ש</span></div>
    <div class="srow"><span>נק' דריפט</span><span class="sval">${Math.floor(s.totalDrift)}</span></div>
    <div class="srow"><span>מטבעות</span><span class="sval">🪙 ${s.coins || 0}</span></div>
    <div class="srow"><span>מרחק כולל</span><span class="sval">${Math.floor((s.distance || 0) / 100)} ק"מ</span></div>
    <div class="srow"><span>התנגשויות</span><span class="sval">${s.crashes || 0}</span></div>`;
}

async function renderCustomization() {
  const data = await getUserData();
  const cur = (data.customization && data.customization.color) || ALL_CARS[selCarIdx].col;
  const el = document.getElementById('custBody');
  if (!el) return;
  const colors = [0xcc0000, 0xff6600, 0xffaa00, 0xffee00, 0x00ff88, 0x00aaff, 0x4400ff, 0xff00aa, 0xffffff, 0x111111];
  el.innerHTML = `<div class="stitle" style="font-size:11px;margin:6px 0">CAR COLOR</div>
    <div class="colorGrid">${colors.map(c => `<div class="cdot ${c === cur ? 'sel' : ''}" style="background:#${c.toString(16).padStart(6,'0')}" onclick="G.setColor(${c})"></div>`).join('')}</div>`;
}

async function setCarColor(col) {
  const data = await getUserData();
  data.customization = data.customization || {};
  data.customization.color = col;
  await saveUserData(data);
  renderCustomization();
}

function getCarColor(carIdx, customColor) {
  return customColor !== null && customColor !== undefined ? customColor : ALL_CARS[carIdx].col;
}

function renderCarGrid() {
  const g = document.getElementById('carGrid'); if (!g) return;
  g.innerHTML = '';
  getUserData().then(data => {
    const owned = data.ownedCars || [];
    if (selCarIdx >= ALL_CARS.length || (!owned.includes(ALL_CARS[selCarIdx].id) && ALL_CARS[selCarIdx].price > 0)) {
      selCarIdx = 0; // fallback
    }
    ALL_CARS.forEach((c, i) => {
      const isOwned = c.price === 0 || owned.includes(c.id);
      const d = document.createElement('div');
      d.className = 'carcard' + (i === selCarIdx ? ' sel' : '') + (isOwned ? '' : ' locked');
      d.setAttribute('data-c', i);
      if (isOwned) d.onclick = () => { selCarIdx = i; renderCarGrid(); };
      else d.onclick = () => { showPanel('pShop'); refreshShop(); };
      d.innerHTML = `<div class="ci">${c.icon}</div><div class="cn">${c.n}</div>
        <div class="cs">SPD ${'█'.repeat(c.spd)}${'░'.repeat(5 - c.spd)} GRP ${'█'.repeat(c.grp)}${'░'.repeat(5 - c.grp)}</div>
        ${isOwned ? '' : '<div class="cprice">🪙 ' + c.price + '</div>'}`;
      g.appendChild(d);
    });
  });
}

// Buy car event
document.addEventListener('buy-car', async (e) => {
  const car = e.detail;
  const data = await getUserData();
  if ((data.stats.coins || 0) >= car.price && !data.ownedCars.includes(car.id)) {
    data.stats.coins -= car.price;
    data.ownedCars.push(car.id);
    await saveUserData(data);
    audio.sfx('coin');
    showToast('coinToast', '🪙 רכשת את ' + car.n + '!');
    refreshCoins(); refreshShop(); renderCarGrid();
  }
});

// ===== Stats: batched, throttled =====
function recordRaceFrame() {
  if (S.kmh > pendingStats.speed) pendingStats.speed = S.kmh;
  if (S.driftToSave > 0) { pendingStats.drift += S.driftToSave; S.driftToSave = 0; }
  pendingStats.distance += S.distFrame || 0;
  if (S.crashFrame) pendingStats.crashes = (pendingStats.crashes || 0) + 1;
}

async function flushStats(extra = {}) {
  if (!currentUser) return;
  const data = await getUserData();
  const s = data.stats;
  if (pendingStats.speed > s.topSpeed) s.topSpeed = pendingStats.speed;
  if (pendingStats.drift > 0) s.totalDrift = (s.totalDrift || 0) + pendingStats.drift;
  if (pendingStats.distance > 0) s.distance = (s.distance || 0) + pendingStats.distance;
  if (pendingStats.crashes) s.crashes = (s.crashes || 0) + pendingStats.crashes;
  pendingStats = { speed:0, drift:0, distance:0 };

  if (extra.lap) s.laps++;
  if (extra.lapTime && (!s.bestLap || extra.lapTime < s.bestLap)) s.bestLap = extra.lapTime;
  if (extra.race) s.races++;

  // Missions + achievements
  const newMissions = checkMissions(s, data.missions);
  for (const m of newMissions) {
    s.coins = (s.coins || 0) + m.coins;
    showToast('missionToast', '✓ ' + m.title + ' — 🪙+' + m.coins);
    audio.sfx('coin');
  }
  const newAch = checkAchievements(s, data.achievements);
  for (const a of newAch) { showAchPopup(a); audio.sfx('ach'); }

  data.stats = s;
  await saveUserData(data);
  refreshCoins();
}

function showToast(id, text) {
  const t = document.getElementById(id); if (!t) return;
  t.textContent = text;
  t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
}

function showAchPopup(a) {
  const p = document.getElementById('achPopup'); if (!p) return;
  p.querySelector('.apIcon').textContent = a.icon;
  p.querySelector('.apName').textContent = a.title;
  p.classList.add('show'); setTimeout(() => p.classList.remove('show'), 3500);
}

// ========== 3D INIT ==========
function init3D() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060610, GFX.drawDist);
  scene.background = new THREE.Color(0x060610);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gc'), antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(GFX.pixRatio, window.devicePixelRatio));
  renderer.shadowMap.enabled = GFX.shad;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, .5, 2000);
  clock = new THREE.Clock(false);

  S.p = new THREE.Vector3(0, .5, 0);
  S.v = new THREE.Vector3();

  world.generate(THREE, scene, GFX);
  particles.init(THREE, scene, 800); // pre-allocate big pool
  buildCar();
  buildGhost();

  // Input
  window.addEventListener('keydown', e => {
    K[e.code] = true;
    if (e.code === 'Escape' && running) { paused = !paused; document.getElementById('pauseM').style.display = paused ? 'flex' : 'none'; if (paused) audio.muteEngine(); else clock.start(); }
    if (e.code === 'KeyM' && running) {
      const name = audio.nextTrack();
      const mi = document.getElementById('musicInfo');
      mi.textContent = '♫ ' + name; mi.classList.add('show');
      setTimeout(() => mi.classList.remove('show'), 2000);
    }
    if (e.code === 'KeyR' && running) resetCarPos();
    if (e.code === 'KeyC' && running) camMode = (camMode + 1) % 3;
    if (e.code === 'F3') { GFX.debug = !GFX.debug; const d = document.getElementById('debugO'); if (d) d.style.display = GFX.debug ? 'block' : 'none'; }
  });
  window.addEventListener('keyup', e => K[e.code] = false);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(GFX.pixRatio, window.devicePixelRatio));
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running && !paused) {
      paused = true;
      document.getElementById('pauseM').style.display = 'flex';
      audio.muteEngine();
    }
  });

  window.addEventListener('beforeunload', () => { flushStats(); });

  // Touch (mobile)
  setupTouchControls();

  // Set rain weather softly
  world.setWeather({ rain: 0 });

  renderLoop();
}

function buildCar() {
  if (carObj) scene.remove(carObj.group);
  getUserData().then(data => {
    const C = ALL_CARS[selCarIdx];
    const colorOverride = (data && data.customization && data.customization.color) ?? C.col;
    carObj = buildCarModel(THREE, C, colorOverride);
    const start = world.getStartPos();
    S.p.set(start.x, .5, start.z); S.a = start.angle;
    carObj.group.position.copy(S.p); carObj.group.rotation.y = S.a;
    scene.add(carObj.group);
  }).catch(() => {
    const C = ALL_CARS[selCarIdx];
    carObj = buildCarModel(THREE, C, C.col);
    const start = world.getStartPos();
    S.p.set(start.x, .5, start.z); S.a = start.angle;
    carObj.group.position.copy(S.p); carObj.group.rotation.y = S.a;
    scene.add(carObj.group);
  });
}

function buildGhost() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: .3 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, .75, 4.6), m));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.7, .55, 1.8), m));
  g.visible = false;
  scene.add(g);
  ghostObj = g;
}

function spawnAiCars(count) {
  // remove old
  aiCars.forEach(c => scene.remove(c.group));
  aiCars = [];
  if (count <= 0) return;
  const colors = [0x00aaff, 0xffaa00, 0xff00aa, 0x00ff88];
  for (let i = 0; i < count; i++) {
    const carData = ALL_CARS[1 + (i % (ALL_CARS.length - 1))];
    const built = buildCarModel(THREE, carData, colors[i % colors.length]);
    const start = world.getStartPos();
    built.group.position.set(start.x + (i - count / 2) * 4, .5, start.z + 2);
    built.group.rotation.y = start.angle;
    scene.add(built.group);
    aiCars.push({
      group: built.group, wheels: built.wheels,
      x: built.group.position.x, z: built.group.position.z, a: start.angle,
      spd: 0, targetIdx: 1, lap: 0,
      maxSpd: carData.ms * (.7 + Math.random() * .15)
    });
  }
}

function updateAiCars(dt) {
  for (const ai of aiCars) {
    const target = world.trackPts[ai.targetIdx];
    const dx = target.x - ai.x, dz = target.z - ai.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const tAng = Math.atan2(dx, dz);
    let da = tAng - ai.a;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    ai.a += da * Math.min(1, dt * 2.5);
    ai.spd += (ai.maxSpd - ai.spd) * dt * .5;
    const move = ai.spd * dt * 60;
    ai.x += Math.sin(ai.a) * move;
    ai.z += Math.cos(ai.a) * move;
    ai.group.position.set(ai.x, .5, ai.z);
    ai.group.rotation.y = ai.a;
    ai.wheels.forEach(w => w.rotation.x += ai.spd * 3 * dt * 60);
    if (dist < 10) {
      ai.targetIdx = (ai.targetIdx + 1) % world.trackPts.length;
      if (ai.targetIdx === 0) ai.lap++;
    }
  }
}

function resetCarPos() {
  const start = world.getStartPos();
  S.p.set(start.x, .5, start.z); S.v.set(0, 0, 0); S.spd = 0; S.a = start.angle; S.boostT = 0; S.hp = 100;
}

// ========== CAMERA ==========
function updateCam() {
  const as = Math.abs(S.spd);
  if (camMode === 0) {
    camera.position.lerp(S.p.clone().add(new THREE.Vector3(-Math.sin(S.a) * 13, 5.5 + as * 1.5, -Math.cos(S.a) * 13)), .055);
    camera.lookAt(S.p.clone().add(new THREE.Vector3(Math.sin(S.a) * 8, 1, Math.cos(S.a) * 8)));
  } else if (camMode === 1) {
    camera.position.lerp(S.p.clone().add(new THREE.Vector3(Math.sin(S.a) * 1, 1.55, Math.cos(S.a) * 1)), .15);
    camera.lookAt(S.p.clone().add(new THREE.Vector3(Math.sin(S.a) * 50, .5, Math.cos(S.a) * 50)));
  } else {
    camera.position.lerp(new THREE.Vector3(S.p.x, 55, S.p.z), .08);
    camera.lookAt(S.p);
  }
  camera.position.x += S.shake.x; camera.position.y += S.shake.y;
  camera.fov += (68 + as * 14 + (S.boostT > 0 ? 8 : 0) - camera.fov) * .05;
  camera.updateProjectionMatrix();
}

// ========== PARTICLES ==========
function spawnCarParticles() {
  if (!GFX.part || !carObj) return;
  const as = Math.abs(S.spd);
  if (S.isDrift && as > .3) {
    for (const wi of [2, 3]) {
      const wp = new THREE.Vector3(); carObj.wheels[wi].getWorldPosition(wp);
      particles.spawn(wp, new THREE.Vector3((Math.random() - .5) * .3, .4 + Math.random() * .3, (Math.random() - .5) * .3),
        1, .5 + Math.random() * .4, .2 + Math.random() * .3, new THREE.Color(.55, .55, .6));
    }
  }
  if ((K.ShiftLeft || K.ShiftRight || (S.gp && S.gp.nit) || (S.touch && S.touch.nit)) && nitroRef.val > 0) {
    for (let i = 0; i < 3; i++) {
      const bk = new THREE.Vector3(
        Math.sin(S.a) * -2.3 + S.p.x + (Math.random() - .5) * .4,
        .35,
        Math.cos(S.a) * -2.3 + S.p.z + (Math.random() - .5) * .4
      );
      particles.spawn(bk,
        new THREE.Vector3(-Math.sin(S.a) * 2 + (Math.random() - .5), Math.random() * .5, -Math.cos(S.a) * 2 + (Math.random() - .5)),
        1, 2 + Math.random() * 2, .12 + Math.random() * .2, new THREE.Color(.15, .4, 1));
    }
  }
  // Boost active: green trail
  if (S.boostT > 0) {
    for (let i = 0; i < 2; i++) {
      const bk = new THREE.Vector3(S.p.x + (Math.random() - .5) * 1, .35, S.p.z + (Math.random() - .5) * 1);
      particles.spawn(bk, new THREE.Vector3(0, Math.random() * .5, 0), 1, 1.8, .15, new THREE.Color(0, 1, .5));
    }
  }
}

// ========== GAMEPAD ==========
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < pads.length; i++) {
    const gp = pads[i];
    if (!gp) continue;
    S.gp = {
      thr: gp.buttons[7] ? gp.buttons[7].value : 0,
      brk: gp.buttons[6] ? gp.buttons[6].value : 0,
      trn: -(gp.axes[0] || 0),
      hb: gp.buttons[0] && gp.buttons[0].pressed,
      nit: gp.buttons[1] && gp.buttons[1].pressed
    };
    if (gp.buttons[3] && gp.buttons[3].pressed && !S._gpC) { camMode = (camMode + 1) % 3; S._gpC = true; }
    if (gp.buttons[3] && !gp.buttons[3].pressed) S._gpC = false;
    return;
  }
  S.gp = null;
}

// ========== TOUCH ==========
function setupTouchControls() {
  const tc = document.getElementById('touchControls');
  if (!tc) return;
  if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) {
    tc.style.display = 'none';
    return;
  }
  S.touch = { thr: 0, brk: 0, trn: 0, hb: false, nit: false };

  const bind = (id, on, off, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    const dn = (e) => { e.preventDefault(); on(); };
    const up = (e) => { e.preventDefault(); off(); };
    el.addEventListener('touchstart', dn, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    el.addEventListener('mousedown', dn);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', up);
  };
  bind('tcThr', () => S.touch.thr = 1, () => S.touch.thr = 0);
  bind('tcBrk', () => S.touch.brk = 1, () => S.touch.brk = 0);
  bind('tcLeft', () => S.touch.trn = 1, () => S.touch.trn = 0);
  bind('tcRight', () => S.touch.trn = -1, () => S.touch.trn = 0);
  bind('tcHb', () => S.touch.hb = true, () => S.touch.hb = false);
  bind('tcNit', () => S.touch.nit = true, () => S.touch.nit = false);
}

// ========== RENDER LOOP ==========
function renderLoop() {
  requestAnimationFrame(renderLoop);
  const time = performance.now() * .001;
  world.updateAnimated(time, S.p);

  if (!running || paused) { renderer.render(scene, camera); return; }

  const dt = Math.min(clock.getDelta(), .05);
  fpsAccum += dt; fpsTicks++;
  if (fpsAccum >= .5) { fps = fpsTicks / fpsAccum; fpsAccum = 0; fpsTicks = 0; }
  nitroRef.val = S.nitro;

  pollGamepad();

  const phResult = updatePhysics(dt, S, ALL_CARS[selCarIdx], K, world.colls, nitroRef, audio, CFG.sfx, particles, THREE, GFX, world.boostPads);
  S.nitro = nitroRef.val;

  // Buffer stats; flush periodically (every 2s) or on lap.
  recordRaceFrame();
  if (performance.now() - lastStatsFlush > 2000) { lastStatsFlush = performance.now(); flushStats(); }

  // AI cars update
  updateAiCars(dt);

  // Ghost: record current run, replay best
  if (S.curLap > 0) {
    if (ghostRecording.length < 4000) ghostRecording.push({ x: S.p.x, z: S.p.z, a: S.a, t: performance.now() - S.lapSt });
    if (ghostPath.length > 0) {
      while (ghostPtr < ghostPath.length - 1 && ghostPath[ghostPtr].t < performance.now() - S.lapSt) ghostPtr++;
      const gp = ghostPath[ghostPtr];
      if (gp && ghostObj) {
        ghostObj.visible = true;
        ghostObj.position.set(gp.x, .5, gp.z);
        ghostObj.rotation.y = gp.a;
      }
    } else if (ghostObj) ghostObj.visible = false;
  }

  // Lap check
  const lapResult = world.checkLap(S.p, S.spd, S.crossed, S.lapSt);
  S.crossed = lapResult.crossed; S.lapSt = lapResult.lapSt;
  if (lapResult.lapDone) {
    if (lapResult.lapTime < S.bestLap) {
      S.bestLap = lapResult.lapTime;
      ghostPath = ghostRecording.slice(); // save as new ghost
    }
    ghostRecording = []; ghostPtr = 0;
    S.totalLaps++;
    if (CFG.sfx) audio.sfx('lap');
    flushStats({ lap: true, lapTime: lapResult.lapTime / 1000 });
  }
  if (!S.curLap && S.crossed) S.curLap = 1;

  // Audio
  audio.updateEngine(S.rpm, Math.abs(S.spd), phResult.throttle, S.isDrift, CFG.eng, S.nitroActive);

  // Car visual
  if (carObj) {
    carObj.group.position.copy(S.p); carObj.group.rotation.y = S.a;
    carObj.group.rotation.z += (-S.av * 3.5 - carObj.group.rotation.z) * .1;
    carObj.group.rotation.x += ((K.KeyW || K.ArrowUp ? -.02 : 0) + (K.KeyS || K.ArrowDown ? .03 : 0) - carObj.group.rotation.x) * .08;
    const dts = Math.max(.001, dt);
    carObj.wheels.forEach((w, i) => {
      w.rotation.x += S.spd * 3 * dts * 60;
      // Front wheels steer
      if (i < 2) w.rotation.y = -S.av * 4;
    });
  }

  spawnCarParticles();
  particles.update(dt, GFX.partMax);
  updateCam();
  updateHUD(S, GFX);
  updateMinimap(document.getElementById('mmC').getContext('2d'), world.trackPts, S.p, S.a, world.boostPads,
    (ghostObj && ghostObj.visible) ? ghostObj.position : null, aiCars);

  if (GFX.debug) {
    updateDebug(S, GFX, fps, renderer.info.render, particles.count());
  }

  renderer.render(scene, camera);
}

// ========== RACE START ==========
async function beginRace() {
  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';

  buildCar();
  resetCarPos();
  Object.assign(S, {
    hp:100, nitro:100, gear:1, rpm:0, spd:0, curLap:0, crossed:false, totalLaps:0,
    dScore:0, isDrift:false, hpCooldown:0, boostT:0
  });
  // Don't reset bestLap to Infinity — load from data
  const userData = await getUserData();
  S.bestLap = userData.stats.bestLap ? userData.stats.bestLap * 1000 : Infinity;
  S.v.set(0, 0, 0); nitroRef.val = 100;
  if (carObj) { carObj.group.position.copy(S.p); carObj.group.rotation.y = S.a; }

  // Spawn AI
  spawnAiCars(2);
  ghostRecording = []; ghostPtr = 0;
  if (ghostObj) ghostObj.visible = false;

  const off = new THREE.Vector3(-Math.sin(S.a) * 13, 7, -Math.cos(S.a) * 13);
  camera.position.copy(S.p.clone().add(off)); camera.lookAt(S.p);
  renderer.render(scene, camera);

  if (!audio.isReady()) audio.init(CFG.vol);
  audio.resume();
  raceStarted = true;
  await flushStats({ race: true });

  const ce = document.getElementById('cntD'); ce.style.display = 'block'; ce.style.color = '#fff';
  for (let i = 3; i >= 1; i--) {
    ce.textContent = i; ce.style.animation = 'none'; void ce.offsetWidth; ce.style.animation = 'cpop .5s ease-out';
    audio.sfx('beep', i === 1 ? 880 : 440);
    await new Promise(r => setTimeout(r, 1000));
  }
  ce.textContent = 'GO!'; ce.style.color = '#00ff88'; ce.style.animation = 'none'; void ce.offsetWidth; ce.style.animation = 'cpop .5s ease-out';
  audio.sfx('beep', 1200);
  audio.startDefaultMusic();
  await new Promise(r => setTimeout(r, 700));
  ce.style.display = 'none';

  running = true; clock.start();
  lastStatsFlush = performance.now();
}

function resume() { paused = false; document.getElementById('pauseM').style.display = 'none'; audio.resume(); clock.start(); }

async function toMenu() {
  await flushStats();
  paused = false; running = false;
  audio.stopMusic(); audio.muteEngine();
  document.getElementById('pauseM').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('gc').style.filter = '';
  document.getElementById('mainMenu').style.display = 'flex';
  S.spd = 0; S.v.set(0, 0, 0);
  aiCars.forEach(c => scene.remove(c.group)); aiCars = [];
}

// ========== BOOT ==========
async function boot() {
  await loadSettings(GFX, CFG);
  initMenuParticles();
  init3D();
  // Apply loaded settings to renderer
  if (renderer) {
    renderer.shadowMap.enabled = GFX.shad;
    renderer.setPixelRatio(Math.min(GFX.pixRatio, window.devicePixelRatio));
    if (scene && scene.fog) scene.fog.density = GFX.drawDist;
  }
  audio.setVolume(CFG.vol);
}
boot();
