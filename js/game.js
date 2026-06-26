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
let scene, camera, renderer, clock, composer, bloomPass;
let carObj = null;
let aiCars = [];
let ghostObj = null, ghostPath = [], ghostRecording = [], ghostPtr = 0;
let running = false, paused = false, raceStarted = false;
let currentUser = null;
let selCarIdx = 0, selTrackIdx = 0;
const K = {};
const GFX = { shad:true, part:true, shk:true, spdLines:true, bloom:true, rain:true, debug:false, realBloom:false, shadowRes:2048, pixRatio:2, drawDist:.0018, partMax:400, preset:'high' };
const CFG = { sfx:true, eng:true, vol:.6 };
const CTRL = { fov:68, steer:1.0, invert:false, diff:'medium' };
const DIFF = { easy:{ base:.62, band:.10 }, medium:{ base:.74, band:.16 }, hard:{ base:.86, band:.22 } };
const S = {
  p:null, v:null, a:0, av:0, hp:100, spd:0, gear:1, rpm:0, isDrift:false, dScore:0, driftToSave:0,
  nitro:100, kmh:0, shake:{x:0,y:0}, lapSt:0, bestLap:Infinity, curLap:0, crossed:false, totalLaps:0,
  hpCooldown:0, boostT:0, nitroActive:false, crashFrame:false, totalDist:0,
  gp:null, touch:null, raceLaps:0, racePos:0, raceTotal:0, raceMode:'circuit',
  steerMul:1.0, steerInv:false
};
const RACE = { mode:'circuit', laps:3, active:false, finished:false, startTime:0 };
const CHAMP = { active:false, round:0, order:[0,1,2], pts:{ player:0, ai:[0,0,0] } };
const CHAMP_PTS = [10, 6, 4, 2]; // points for 1st..4th
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
  selTrack, setLaps, setMode,
  switchAuth: switchAuthTab,
  doRegister, doLogin, skipAuth,
  togS: (el) => { toggleSetting(el, GFX, CFG); if (el.id === 'tShd' && renderer) renderer.shadowMap.enabled = GFX.shad; if (el.id === 'tDbg') { const d = document.getElementById('debugO'); if (d) d.style.display = GFX.debug ? 'block' : 'none'; } if (el.id === 'tBlm') applyBloomState(); },
  setGfx: (p) => { setGfxPreset(p, GFX, renderer, scene); applyBloomState(); },
  setVol: (v) => { CFG.vol = v / 100; audio.setVolume(CFG.vol); saveSettings(null, CFG); },
  setColor: setCarColor,
  setFov: (v) => { CTRL.fov = +v; const o = document.getElementById('fovVal'); if (o) o.textContent = Math.round(v); saveCtrl(); },
  setSteer: (v) => { CTRL.steer = +v / 100; const o = document.getElementById('steerVal'); if (o) o.textContent = (+v / 100).toFixed(2) + '×'; saveCtrl(); },
  setInvert: (el) => { el.classList.toggle('on'); CTRL.invert = el.classList.contains('on'); saveCtrl(); },
  setDiff,
  beginRace, resume, toMenu, logout, restartRace, raceAgain, nextChampRace
};

function saveCtrl() { saveSettings(null, null, CTRL); }

// ========== AUTH ==========
setupAuth(async (username) => {
  currentUser = username;
  let data = await dbGet('user_' + username);
  if (!data) {
    data = { stats: { laps:0, bestLap:null, topSpeed:0, totalDrift:0, races:0, coins:0, distance:0, crashes:0 }, achievements:[], missions:{}, ownedCars:[], customization:{color:null}, bestLapByTrack:{} };
    await dbSet('user_' + username, data);
  }
  if (!data.bestLapByTrack) data.bestLapByTrack = {};
  statsCache = data;
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainMenu').style.display = 'flex';
  document.getElementById('welcomeUser').innerHTML = 'ברוך הבא, <strong>' + escapeHTML(username) + '</strong>';
  refreshCoins();
  renderCarGrid();
  renderTrackSelect();
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
    { stats:{laps:0,bestLap:null,topSpeed:0,totalDrift:0,races:0,coins:0,distance:0,crashes:0}, achievements:[], missions:{}, ownedCars:[], customization:{color:null}, bestLapByTrack:{} };
  if (!d.bestLapByTrack) d.bestLapByTrack = {};
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
  const recs = world.TRACKS.map(t => {
    const v = data.bestLapByTrack[t.id];
    return `<div class="srow"><span>${t.icon} ${t.name}</span><span class="sval">${v ? v.toFixed(2) + 's' : '—'}</span></div>`;
  }).join('');
  el.innerHTML = `
    <div class="srow"><span>מירוצים</span><span class="sval">${s.races}</span></div>
    <div class="srow"><span>הקפות</span><span class="sval">${s.laps}</span></div>
    <div class="srow"><span>מהירות מקסימלית</span><span class="sval">${Math.floor(s.topSpeed)} קמ"ש</span></div>
    <div class="srow"><span>נק' דריפט</span><span class="sval">${Math.floor(s.totalDrift)}</span></div>
    <div class="srow"><span>מטבעות</span><span class="sval">🪙 ${s.coins || 0}</span></div>
    <div class="srow"><span>מרחק כולל</span><span class="sval">${Math.floor((s.distance || 0) / 100)} ק"מ</span></div>
    <div class="srow"><span>התנגשויות</span><span class="sval">${s.crashes || 0}</span></div>
    <div class="stitle" style="font-size:11px;margin:12px 0 4px">🏁 שיאי הקפה</div>
    ${recs}`;
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
  buildCar();
}

function renderCarGrid() {
  const g = document.getElementById('carGrid'); if (!g) return;
  g.innerHTML = '';
  getUserData().then(data => {
    const owned = data.ownedCars || [];
    if (selCarIdx >= ALL_CARS.length || (!owned.includes(ALL_CARS[selCarIdx].id) && ALL_CARS[selCarIdx].price > 0)) {
      selCarIdx = 0;
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

// ===== Track / mode / laps select =====
function renderTrackSelect() {
  const champ = RACE.mode === 'championship';
  const tg = document.getElementById('trackGrid');
  if (tg) {
    tg.innerHTML = '';
    world.TRACKS.forEach((t, i) => {
      const d = document.createElement('div');
      d.className = 'trackcard' + (i === selTrackIdx && !champ ? ' sel' : '') + (champ ? ' dim' : '');
      d.onclick = () => { if (!champ) G.selTrack(i); };
      d.innerHTML = `<div class="ti">${t.icon}</div><div class="tn">${t.name}</div>`;
      tg.appendChild(d);
    });
  }
  const lr = document.getElementById('lapsRow'); if (lr) lr.style.opacity = champ ? '.4' : '1';
  const tl = document.getElementById('trackLabel'); if (tl) tl.textContent = champ ? '🏆 כל המסלולים (סדרה)' : '🏁 מסלול';
  document.querySelectorAll('#lapsRow .seg').forEach(b => b.classList.toggle('on', +b.dataset.v === RACE.laps));
  document.querySelectorAll('#modeRow .seg').forEach(b => b.classList.toggle('on', b.dataset.v === RACE.mode));
  document.querySelectorAll('#diffRow .seg').forEach(b => b.classList.toggle('on', b.dataset.v === CTRL.diff));
}

function selTrack(i) {
  if (i === selTrackIdx) return;
  selTrackIdx = i;
  world.generate(THREE, scene, GFX, selTrackIdx);
  clearSkids();
  buildCar();
  renderTrackSelect();
}

function setLaps(n) { RACE.laps = n; renderTrackSelect(); }
function setMode(m) { RACE.mode = m; if (m === 'championship') RACE.laps = 3; renderTrackSelect(); }
function setDiff(d) { CTRL.diff = d; saveCtrl(); renderTrackSelect(); }

function applyCtrlUI() {
  const fs = document.getElementById('fovSlider'); if (fs) { fs.value = CTRL.fov; const o = document.getElementById('fovVal'); if (o) o.textContent = Math.round(CTRL.fov); }
  const ss = document.getElementById('steerSlider'); if (ss) { ss.value = Math.round(CTRL.steer * 100); const o = document.getElementById('steerVal'); if (o) o.textContent = CTRL.steer.toFixed(2) + '×'; }
  const inv = document.getElementById('tInv'); if (inv) inv.classList.toggle('on', !!CTRL.invert);
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
  if (extra.lapTime && extra.trackId) {
    const cur = data.bestLapByTrack[extra.trackId];
    if (!cur || extra.lapTime < cur) data.bestLapByTrack[extra.trackId] = extra.lapTime;
  }
  if (extra.race) s.races++;
  if (extra.coins) s.coins = (s.coins || 0) + extra.coins;

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

  world.generate(THREE, scene, GFX, selTrackIdx);
  particles.init(THREE, scene, 800);
  buildCar();
  buildGhost();
  initSkids();
  setupComposer();

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

  window.addEventListener('resize', onResize);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running && !paused) {
      paused = true;
      document.getElementById('pauseM').style.display = 'flex';
      audio.muteEngine();
    }
  });

  window.addEventListener('beforeunload', () => { flushStats(); });

  setupTouchControls();
  renderLoop();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(GFX.pixRatio, window.devicePixelRatio));
  if (composer) { composer.setSize(window.innerWidth, window.innerHeight); }
}

// ========== BLOOM ==========
function setupComposer() {
  if (!(THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass)) { GFX.realBloom = false; return; }
  try {
    composer = new THREE.EffectComposer(renderer);
    if (composer.setPixelRatio) composer.setPixelRatio(Math.min(GFX.pixRatio, window.devicePixelRatio));
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.5, 0.75);
    composer.addPass(bloomPass);
    composer.setSize(window.innerWidth, window.innerHeight);
    GFX.realBloom = GFX.bloom;
  } catch (e) { composer = null; bloomPass = null; GFX.realBloom = false; }
}
function applyBloomState() { GFX.realBloom = !!(composer && GFX.bloom); }

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

// ===== SKID MARKS (pooled, fade over time) =====
let skidPool = [], skidPtr = 0;
function initSkids() {
  const geo = new THREE.PlaneGeometry(0.5, 0.5);
  for (let i = 0; i < 260; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x080808, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.045; m.visible = false;
    scene.add(m); skidPool.push(m);
  }
}
function layStripe() {
  if (!carObj || !skidPool.length) return;
  for (const wi of [2, 3]) {
    const wp = new THREE.Vector3(); carObj.wheels[wi].getWorldPosition(wp);
    const m = skidPool[skidPtr];
    skidPtr = (skidPtr + 1) % skidPool.length;
    m.position.set(wp.x, 0.045, wp.z);
    m.material.opacity = 0.5;
    m.visible = true;
  }
}
function fadeSkids(dt) {
  for (const m of skidPool) {
    if (m.visible) { m.material.opacity -= dt * 0.05; if (m.material.opacity <= 0) m.visible = false; }
  }
}
function clearSkids() { for (const m of skidPool) { m.visible = false; m.material.opacity = 0; } }

function spawnAiCars(count) {
  aiCars.forEach(c => scene.remove(c.group));
  aiCars = [];
  if (count <= 0) return;
  const colors = [0x00aaff, 0xffaa00, 0xff00aa, 0x00ff88];
  const d = DIFF[CTRL.diff] || DIFF.medium;
  for (let i = 0; i < count; i++) {
    const carData = ALL_CARS[1 + (i % (ALL_CARS.length - 1))];
    const built = buildCarModel(THREE, carData, colors[i % colors.length]);
    const start = world.getStartPos();
    built.group.position.set(start.x + (i - count / 2) * 4, .5, start.z + 2);
    built.group.rotation.y = start.angle;
    scene.add(built.group);
    const baseMax = carData.ms * (d.base + Math.random() * .10);
    aiCars.push({
      group: built.group, wheels: built.wheels,
      x: built.group.position.x, z: built.group.position.z, a: start.angle,
      spd: 0, targetIdx: 1, lap: 0,
      maxSpd: baseMax, baseMax, band: d.band, idx: i
    });
  }
}

function updateAiCars(dt) {
  const playerProg = S.totalLaps + world.trackFrac(S.p);
  for (const ai of aiCars) {
    // Rubber-banding: ease maxSpd toward base, nudged by gap to player
    const aiProg = ai.lap + ai.targetIdx / world.trackPts.length;
    const gap = playerProg - aiProg; // >0 player ahead → AI catches up
    const factor = 1 + ai.band * Math.max(-0.6, Math.min(1, gap));
    ai.maxSpd = ai.baseMax * factor;

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

// Live race position (circuit only)
function computePosition() {
  const playerProg = S.totalLaps + world.trackFrac(S.p);
  let ahead = 0;
  for (const ai of aiCars) {
    const aiProg = ai.lap + ai.targetIdx / world.trackPts.length;
    if (aiProg > playerProg) ahead++;
  }
  S.racePos = ahead + 1;
  S.raceTotal = aiCars.length + 1;
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
  camera.fov += (CTRL.fov + as * 14 + (S.boostT > 0 ? 8 : 0) - camera.fov) * .05;
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
  if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) { tc.style.display = 'none'; return; }
  S.touch = { thr: 0, brk: 0, trn: 0, hb: false, nit: false };
  const bind = (id, on, off) => {
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

function renderFrame() {
  if (composer && GFX.realBloom) {
    if (bloomPass) bloomPass.strength = 0.7 + Math.min(.5, Math.abs(S.spd) * .12) + (S.boostT > 0 ? .35 : 0);
    composer.render();
  } else renderer.render(scene, camera);
}

// ========== RENDER LOOP ==========
function renderLoop() {
  requestAnimationFrame(renderLoop);
  const time = performance.now() * .001;
  world.updateAnimated(time, S.p);

  if (!running || paused) { renderFrame(); return; }

  const dt = Math.min(clock.getDelta(), .05);
  fpsAccum += dt; fpsTicks++;
  if (fpsAccum >= .5) { fps = fpsTicks / fpsAccum; fpsAccum = 0; fpsTicks = 0; }
  nitroRef.val = S.nitro;

  pollGamepad();
  S.steerMul = CTRL.steer; S.steerInv = CTRL.invert;

  const phResult = updatePhysics(dt, S, ALL_CARS[selCarIdx], K, world.colls, nitroRef, audio, CFG.sfx, particles, THREE, GFX, world.boostPads);
  S.nitro = nitroRef.val;

  // Skid marks while drifting
  if (GFX.part && S.isDrift && Math.abs(S.spd) > .4) layStripe();

  recordRaceFrame();
  if (performance.now() - lastStatsFlush > 2000) { lastStatsFlush = performance.now(); flushStats(); }

  updateAiCars(dt);
  if ((RACE.mode === 'circuit' || RACE.mode === 'championship') && aiCars.length) computePosition();

  // Ghost record/replay
  if (S.curLap > 0) {
    if (ghostRecording.length < 4000) ghostRecording.push({ x: S.p.x, z: S.p.z, a: S.a, t: performance.now() - S.lapSt });
    if (ghostPath.length > 0) {
      while (ghostPtr < ghostPath.length - 1 && ghostPath[ghostPtr].t < performance.now() - S.lapSt) ghostPtr++;
      const gp = ghostPath[ghostPtr];
      if (gp && ghostObj) { ghostObj.visible = true; ghostObj.position.set(gp.x, .5, gp.z); ghostObj.rotation.y = gp.a; }
    } else if (ghostObj) ghostObj.visible = false;
  }

  // Lap check
  const lapResult = world.checkLap(S.p, S.spd, S.crossed, S.lapSt);
  S.crossed = lapResult.crossed; S.lapSt = lapResult.lapSt;
  if (lapResult.lapDone) {
    if (lapResult.lapTime < S.bestLap) { S.bestLap = lapResult.lapTime; ghostPath = ghostRecording.slice(); }
    ghostRecording = []; ghostPtr = 0;
    S.totalLaps++;
    if (CFG.sfx) audio.sfx('lap');
    flushStats({ lap: true, lapTime: lapResult.lapTime / 1000, trackId: world.getTrack().id });
    if (RACE.active && RACE.mode !== 'free' && S.totalLaps >= RACE.laps) { finishRace(); }
  }
  if (!S.curLap && S.crossed) S.curLap = 1;

  audio.updateEngine(S.rpm, Math.abs(S.spd), phResult.throttle, S.isDrift, CFG.eng, S.nitroActive);

  if (carObj) {
    carObj.group.position.copy(S.p); carObj.group.rotation.y = S.a;
    carObj.group.rotation.z += (-S.av * 3.5 - carObj.group.rotation.z) * .1;
    carObj.group.rotation.x += ((K.KeyW || K.ArrowUp ? -.02 : 0) + (K.KeyS || K.ArrowDown ? .03 : 0) - carObj.group.rotation.x) * .08;
    const dts = Math.max(.001, dt);
    carObj.wheels.forEach((w, i) => { w.rotation.x += S.spd * 3 * dts * 60; if (i < 2) w.rotation.y = -S.av * 4; });
  }

  spawnCarParticles();
  particles.update(dt, GFX.partMax);
  fadeSkids(dt);
  updateCam();
  updateHUD(S, GFX);
  updateMinimap(document.getElementById('mmC').getContext('2d'), world.trackPts, S.p, S.a, world.boostPads,
    (ghostObj && ghostObj.visible) ? ghostObj.position : null, aiCars);

  if (GFX.debug) updateDebug(S, GFX, fps, renderer.info.render, particles.count());

  renderFrame();
}

// ========== RACE START ==========
async function beginRace() {
  // Championship: fresh start from the menu resets the series; mid-series continues.
  if (RACE.mode === 'championship') {
    if (!RACE._champContinue) {
      CHAMP.active = true; CHAMP.round = 0; CHAMP.pts = { player: 0, ai: [0, 0, 0] }; CHAMP.order = [0, 1, 2];
    }
    const idx = CHAMP.order[CHAMP.round];
    if (idx !== selTrackIdx) { selTrackIdx = idx; world.generate(THREE, scene, GFX, idx); }
  }
  RACE._champContinue = false;

  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('raceResults').style.display = 'none';
  document.getElementById('hud').style.display = 'block';

  clearSkids();
  buildCar();
  resetCarPos();
  Object.assign(S, {
    hp:100, nitro:100, gear:1, rpm:0, spd:0, curLap:0, crossed:false, totalLaps:0,
    dScore:0, isDrift:false, hpCooldown:0, boostT:0, racePos:0
  });
  S.raceLaps = RACE.mode === 'free' ? 0 : RACE.laps;
  S.raceMode = RACE.mode;
  const userData = await getUserData();
  const trackBest = userData.bestLapByTrack[world.getTrack().id];
  S.bestLap = trackBest ? trackBest * 1000 : Infinity;
  S.v.set(0, 0, 0); nitroRef.val = 100;
  if (carObj) { carObj.group.position.copy(S.p); carObj.group.rotation.y = S.a; }

  spawnAiCars(RACE.mode === 'circuit' || RACE.mode === 'championship' ? 3 : 0);
  ghostRecording = []; ghostPtr = 0;
  if (ghostObj) ghostObj.visible = false;

  RACE.active = true; RACE.finished = false; RACE.startTime = performance.now();

  const off = new THREE.Vector3(-Math.sin(S.a) * 13, 7, -Math.cos(S.a) * 13);
  camera.position.copy(S.p.clone().add(off)); camera.lookAt(S.p);
  renderFrame();

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
  RACE.startTime = performance.now();
  lastStatsFlush = performance.now();
}

function finalOrder() {
  const racers = [{ id: 'player', prog: S.totalLaps + world.trackFrac(S.p) }];
  aiCars.forEach((ai, i) => racers.push({ id: 'ai', aiIdx: i, prog: ai.lap + ai.targetIdx / world.trackPts.length }));
  racers.sort((a, b) => b.prog - a.prog);
  return racers;
}

function champStandingsHTML() {
  const rows = [{ name: 'אתה', pts: CHAMP.pts.player, me: true }];
  CHAMP.pts.ai.forEach((p, i) => rows.push({ name: 'יריב ' + (i + 1), pts: p }));
  rows.sort((a, b) => b.pts - a.pts);
  const medal = ['🥇', '🥈', '🥉', '4.'];
  return rows.map((r, i) => `<div style="${r.me ? 'color:#ffd700;font-weight:700' : ''}">${medal[i] || (i + 1 + '.')} ${r.name} — ${r.pts} נק'</div>`).join('');
}

async function finishRace() {
  if (RACE.finished) return;
  RACE.finished = true; RACE.active = false; running = false;
  audio.muteEngine(); audio.stopMusic();

  const totalMs = performance.now() - RACE.startTime;
  const rrPrimary = document.getElementById('rrPrimary');
  let place = 1, coins = 0;

  if (RACE.mode === 'championship') {
    const order = finalOrder();
    place = order.findIndex(r => r.id === 'player') + 1;
    order.forEach((r, pos) => {
      const pts = CHAMP_PTS[pos] || 0;
      if (r.id === 'player') CHAMP.pts.player += pts; else CHAMP.pts.ai[r.aiIdx] += pts;
    });
    coins = 40 + (place === 1 ? 60 : place === 2 ? 30 : 0);

    const isLast = CHAMP.round >= CHAMP.order.length - 1;
    if (isLast) {
      const standings = [{ name: 'player', pts: CHAMP.pts.player }, ...CHAMP.pts.ai.map(p => ({ name: 'ai', pts: p }))].sort((a, b) => b.pts - a.pts);
      const champWon = standings[0].name === 'player' && standings[0].pts >= Math.max(...CHAMP.pts.ai, 0);
      coins += champWon ? 300 : 100;
      CHAMP.active = false;
      document.getElementById('rrPlace').textContent = champWon ? '🏆 אלוף!' : '🏁 האליפות הסתיימה';
      if (rrPrimary) { rrPrimary.textContent = 'RACE AGAIN'; rrPrimary.setAttribute('onclick', 'G.raceAgain()'); }
      if (champWon) audio.sfx('ach'); else audio.sfx('lap');
    } else {
      document.getElementById('rrPlace').textContent = `🏆 סבב ${CHAMP.round + 1}/${CHAMP.order.length} — מקום ${place}`;
      if (rrPrimary) { rrPrimary.textContent = 'NEXT RACE →'; rrPrimary.setAttribute('onclick', 'G.nextChampRace()'); }
      audio.sfx('lap');
    }
    await flushStats({ coins });
    document.getElementById('rrTime').textContent = 'זמן: ' + fmtTime(totalMs);
    document.getElementById('rrBest').innerHTML = champStandingsHTML();
    document.getElementById('rrCoins').textContent = '🪙 +' + coins;
  } else {
    if (rrPrimary) { rrPrimary.textContent = 'RACE AGAIN'; rrPrimary.setAttribute('onclick', 'G.raceAgain()'); }
    if (RACE.mode === 'circuit') { computePosition(); place = S.racePos; coins = place === 1 ? 250 : place === 2 ? 150 : place === 3 ? 100 : 60; }
    else if (RACE.mode === 'timetrial') {
      const userData = await getUserData();
      const prevBest = userData.bestLapByTrack[world.getTrack().id];
      coins = 80 + (S.bestLap < Infinity && (!prevBest || S.bestLap / 1000 <= prevBest) ? 120 : 0);
    }
    await flushStats({ coins });
    const placeText = RACE.mode === 'circuit'
      ? (place === 1 ? '🥇 מקום 1' : place === 2 ? '🥈 מקום 2' : place === 3 ? '🥉 מקום 3' : 'מקום ' + place)
      : '🏁 הושלם';
    document.getElementById('rrPlace').textContent = placeText;
    document.getElementById('rrTime').textContent = 'זמן כולל: ' + fmtTime(totalMs);
    document.getElementById('rrBest').textContent = 'הקפה מהירה: ' + (S.bestLap < Infinity ? fmtTime(S.bestLap) : '—');
    document.getElementById('rrCoins').textContent = '🪙 +' + coins;
    if (RACE.mode === 'circuit' && place === 1) audio.sfx('ach'); else audio.sfx('lap');
  }

  document.getElementById('hud').style.display = 'none';
  document.getElementById('gc').style.filter = '';
  document.getElementById('raceResults').style.display = 'flex';
}

function nextChampRace() {
  document.getElementById('raceResults').style.display = 'none';
  CHAMP.round++;
  RACE._champContinue = true;
  beginRace();
}

function fmtTime(ms) {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(c).padStart(2,'0')}`;
}

function resume() { paused = false; document.getElementById('pauseM').style.display = 'none'; audio.resume(); clock.start(); }

function restartRace() {
  document.getElementById('pauseM').style.display = 'none';
  RACE.active = false; RACE.finished = false; running = false;
  beginRace();
}

function raceAgain() {
  document.getElementById('raceResults').style.display = 'none';
  beginRace();
}

async function toMenu() {
  await flushStats();
  paused = false; running = false; RACE.active = false; CHAMP.active = false;
  audio.stopMusic(); audio.muteEngine();
  document.getElementById('pauseM').style.display = 'none';
  document.getElementById('raceResults').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('gc').style.filter = '';
  document.getElementById('mainMenu').style.display = 'flex';
  showPanel('pMain');
  S.spd = 0; S.v.set(0, 0, 0);
  aiCars.forEach(c => scene.remove(c.group)); aiCars = [];
  if (ghostObj) ghostObj.visible = false;
}

// ========== BOOT ==========
async function boot() {
  await loadSettings(GFX, CFG, CTRL);
  initMenuParticles();
  init3D();
  applyBloomState();
  applyCtrlUI();
  if (renderer) {
    renderer.shadowMap.enabled = GFX.shad;
    renderer.setPixelRatio(Math.min(GFX.pixRatio, window.devicePixelRatio));
    if (scene && scene.fog) scene.fog.density = GFX.drawDist;
  }
  audio.setVolume(CFG.vol);
}
boot();
