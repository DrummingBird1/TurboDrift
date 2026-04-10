// js/game.js — Main orchestrator & render loop
import { dbGet, dbSet } from './storage.js';
import { setupAuth, doRegister, doLogin, skipAuth, switchAuthTab } from './auth.js';
import { showPanel, initMenuParticles, toggleSetting, setGfxPreset } from './menu.js';
import { MISSIONS, renderMissions, checkMissions } from './missions.js';
import { ACHS, renderAchievements, checkAchievements } from './achievements.js';
import { ALL_CARS, buildCarModel } from './cars.js';
import { renderShop, getOwnedCars } from './shop.js';
import * as audio from './audio.js';
import * as particles from './particles.js';
import * as world from './world.js';
import { updatePhysics } from './physics.js';
import { updateHUD, updateMinimap } from './hud.js';

// ========== GLOBALS ==========
let scene, camera, renderer, clock;
let carObj = null; // { group, wheels, hlights }
let running = false, paused = false, raceStarted = false;
let currentUser = null;
let selCarIdx = 0;
const K = {};
const GFX = { shad:true,part:true,shk:true,spdLines:true,bloom:true,shadowRes:2048,pixRatio:2,drawDist:.0018,partMax:400 };
const CFG = { sfx:true, eng:true, vol:.6 };
const S = { p:null, v:null, a:0, av:0, hp:100, spd:0, gear:1, rpm:0, isDrift:false, dScore:0, driftToSave:0,
  nitro:100, kmh:0, shake:{x:0,y:0}, lapSt:0, bestLap:Infinity, curLap:0, crossed:false, totalLaps:0 };
const nitroRef = { val: 100 };
let camMode = 0;

// ========== EXPOSE TO HTML ==========
window.G = {
  showP: (id) => { showPanel(id); if(id==='pMissions') refreshMissions(); if(id==='pAch') refreshAch(); if(id==='pShop') refreshShop(); },
  selCar: (i) => { const owned = getAvailableCars(); if(i < owned.length){ selCarIdx = i; renderCarGrid(); } },
  switchAuth: switchAuthTab,
  doRegister, doLogin, skipAuth,
  togS: (el) => { toggleSetting(el, GFX, CFG); if(el.id==='tShd'&&renderer) renderer.shadowMap.enabled=GFX.shad; },
  setGfx: (p) => setGfxPreset(p, GFX, renderer, scene),
  setVol: (v) => { CFG.vol=v/100; audio.setVolume(CFG.vol); },
  beginRace, resume, toMenu, logout
};

// ========== AUTH ==========
setupAuth(async (username) => {
  currentUser = username;
  let data = await dbGet('user_'+username);
  if (!data) { data = {pass:'',stats:{laps:0,bestLap:null,topSpeed:0,totalDrift:0,races:0,coins:0},achievements:[],missions:{},ownedCars:[]}; await dbSet('user_'+username, data); }
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainMenu').style.display = 'flex';
  document.getElementById('welcomeUser').innerHTML = 'ברוך הבא, <strong>'+username+'</strong>';
  refreshCoins();
  renderCarGrid();
});

function logout() {
  currentUser=null; running=false; paused=false;
  document.getElementById('mainMenu').style.display='none';
  document.getElementById('hud').style.display='none';
  document.getElementById('authScreen').style.display='flex';
}

// ========== DATA ==========
async function getUserData() { return await dbGet('user_'+currentUser) || {stats:{laps:0,bestLap:null,topSpeed:0,totalDrift:0,races:0,coins:0},achievements:[],missions:{},ownedCars:[]}; }
async function saveUserData(data) { await dbSet('user_'+currentUser, data); }

async function refreshCoins() {
  const data = await getUserData();
  document.getElementById('coinDisplay').textContent = '🪙 ' + (data.stats.coins||0);
}

async function refreshMissions() { const data = await getUserData(); renderMissions(document.getElementById('missionList'), data.stats, data.missions); }
async function refreshAch() { const data = await getUserData(); renderAchievements(document.getElementById('achGrid'), data.achievements); }
async function refreshShop() { const data = await getUserData(); renderShop(document.getElementById('shopGrid'), data.ownedCars, data.stats.coins||0); }

function getAvailableCars() {
  // For now return first 3 + any owned
  return ALL_CARS.filter(c => c.price === 0);
}

function renderCarGrid() {
  const g = document.getElementById('carGrid');
  g.innerHTML = '';
  getUserData().then(data => {
    const owned = data.ownedCars || [];
    ALL_CARS.forEach((c, i) => {
      const isOwned = c.price === 0 || owned.includes(c.id);
      if (!isOwned) return;
      const d = document.createElement('div');
      d.className = 'carcard' + (i === selCarIdx ? ' sel' : '');
      d.setAttribute('data-c', i);
      d.onclick = () => { selCarIdx = i; renderCarGrid(); };
      d.innerHTML = `<div class="ci">${c.icon}</div><div class="cn">${c.n}</div><div class="cs">SPD ${'█'.repeat(c.spd)}${'░'.repeat(5-c.spd)} GRP ${'█'.repeat(c.grp)}${'░'.repeat(5-c.grp)}</div>`;
      g.appendChild(d);
    });
  });
}

// Buy car event
document.addEventListener('buy-car', async (e) => {
  const car = e.detail;
  const data = await getUserData();
  if ((data.stats.coins||0) >= car.price && !data.ownedCars.includes(car.id)) {
    data.stats.coins -= car.price;
    data.ownedCars.push(car.id);
    await saveUserData(data);
    audio.sfx('coin');
    showToast('coinToast', '🪙 רכשת את ' + car.n + '!');
    refreshCoins(); refreshShop(); renderCarGrid();
  }
});

async function updateStats(updates) {
  if (!currentUser) return;
  const data = await getUserData();
  const s = data.stats;
  if (updates.lap) s.laps++;
  if (updates.lapTime && (!s.bestLap || updates.lapTime < s.bestLap)) s.bestLap = updates.lapTime;
  if (updates.speed && updates.speed > s.topSpeed) s.topSpeed = updates.speed;
  if (updates.drift) s.totalDrift += updates.drift;
  if (updates.race) s.races++;

  // Check missions and award coins
  const newMissions = checkMissions(s, data.missions);
  for (const m of newMissions) {
    s.coins = (s.coins||0) + m.coins;
    showToast('missionToast', '✓ ' + m.title + ' — 🪙+' + m.coins);
  }

  // Check achievements
  const newAch = checkAchievements(s, data.achievements);
  for (const a of newAch) showAchPopup(a);

  data.stats = s;
  await saveUserData(data);
  refreshCoins();
}

function showToast(id, text) {
  const t = document.getElementById(id); t.textContent = text;
  t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
}

function showAchPopup(a) {
  const p = document.getElementById('achPopup');
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

  camera = new THREE.PerspectiveCamera(68, window.innerWidth/window.innerHeight, .5, 2000);
  clock = new THREE.Clock(false);

  S.p = new THREE.Vector3(0, .5, 0);
  S.v = new THREE.Vector3();

  world.generate(THREE, scene, GFX);
  particles.init(THREE, scene, GFX.partMax);
  buildCar();

  window.addEventListener('keydown', e => {
    K[e.code] = true;
    if (e.code === 'Escape' && running) { paused = !paused; document.getElementById('pauseM').style.display = paused ? 'flex' : 'none'; if (!paused) clock.start(); }
    if (e.code === 'KeyM' && running) {
      const name = audio.nextTrack();
      const mi = document.getElementById('musicInfo');
      mi.textContent = '♫ ' + name; mi.classList.add('show');
      setTimeout(() => mi.classList.remove('show'), 2000);
    }
    if (e.code === 'KeyR' && running) resetCarPos();
    if (e.code === 'KeyC' && running) camMode = (camMode + 1) % 3;
  });
  window.addEventListener('keyup', e => K[e.code] = false);
  window.addEventListener('resize', () => { camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

  renderLoop();
}

function buildCar() {
  if (carObj) scene.remove(carObj.group);
  const C = ALL_CARS[selCarIdx];
  carObj = buildCarModel(THREE, C);
  const start = world.getStartPos();
  S.p.set(start.x, .5, start.z); S.a = start.angle;
  carObj.group.position.copy(S.p); carObj.group.rotation.y = S.a;
  scene.add(carObj.group);
}

function resetCarPos() {
  const start = world.getStartPos();
  S.p.set(start.x, .5, start.z); S.v.set(0,0,0); S.spd = 0; S.a = start.angle;
}

// ========== CAMERA ==========
function updateCam() {
  const as = Math.abs(S.spd);
  if (camMode === 0) {
    camera.position.lerp(S.p.clone().add(new THREE.Vector3(-Math.sin(S.a)*13, 5.5+as*1.5, -Math.cos(S.a)*13)), .055);
    camera.lookAt(S.p.clone().add(new THREE.Vector3(Math.sin(S.a)*8, 1, Math.cos(S.a)*8)));
  } else if (camMode === 1) {
    camera.position.lerp(S.p.clone().add(new THREE.Vector3(Math.sin(S.a)*1, 1.55, Math.cos(S.a)*1)), .15);
    camera.lookAt(S.p.clone().add(new THREE.Vector3(Math.sin(S.a)*50, .5, Math.cos(S.a)*50)));
  } else {
    camera.position.lerp(new THREE.Vector3(S.p.x, 55, S.p.z), .08); camera.lookAt(S.p);
  }
  camera.position.x += S.shake.x; camera.position.y += S.shake.y;
  camera.fov += (68 + as * 14 - camera.fov) * .05; camera.updateProjectionMatrix();
}

// ========== PARTICLE SPAWNING ==========
function spawnCarParticles() {
  if (!GFX.part || !carObj) return;
  const as = Math.abs(S.spd);
  if (S.isDrift && as > .3) {
    for (const wi of [2, 3]) {
      const wp = new THREE.Vector3(); carObj.wheels[wi].getWorldPosition(wp);
      particles.spawn(wp, new THREE.Vector3((Math.random()-.5)*.3, .4+Math.random()*.3, (Math.random()-.5)*.3), 1, .5+Math.random()*.4, .2+Math.random()*.3, new THREE.Color(.55,.55,.6));
    }
  }
  if ((K.ShiftLeft||K.ShiftRight) && nitroRef.val > 0) {
    for (let i=0;i<3;i++) {
      const bk = new THREE.Vector3(Math.sin(S.a)*-2.3+S.p.x+(Math.random()-.5)*.4, .35, Math.cos(S.a)*-2.3+S.p.z+(Math.random()-.5)*.4);
      particles.spawn(bk, new THREE.Vector3(-Math.sin(S.a)*2+(Math.random()-.5), Math.random()*.5, -Math.cos(S.a)*2+(Math.random()-.5)), 1, 2+Math.random()*2, .12+Math.random()*.2, new THREE.Color(.15,.4,1));
    }
  }
}

// ========== RENDER LOOP ==========
function renderLoop() {
  requestAnimationFrame(renderLoop);
  const time = performance.now() * .001;
  world.updateAnimated(time);

  if (!running || paused) { renderer.render(scene, camera); return; }

  const dt = Math.min(clock.getDelta(), .05);
  nitroRef.val = S.nitro;

  const phResult = updatePhysics(dt, S, ALL_CARS[selCarIdx], K, world.colls, nitroRef, audio, CFG.sfx, particles, THREE, GFX);
  S.nitro = nitroRef.val;

  // Update stats
  updateStats({ speed: S.kmh });
  if (S.driftToSave > 0) { updateStats({ drift: S.driftToSave }); S.driftToSave = 0; }

  // Lap check
  const lapResult = world.checkLap(S.p, S.spd, S.crossed, S.lapSt);
  S.crossed = lapResult.crossed; S.lapSt = lapResult.lapSt;
  if (lapResult.lapDone) {
    if (lapResult.lapTime < S.bestLap) S.bestLap = lapResult.lapTime;
    S.totalLaps++;
    updateStats({ lap: true, lapTime: lapResult.lapTime / 1000 });
  }
  if (!S.curLap && S.crossed) S.curLap = 1;

  // Audio
  audio.updateEngine(S.rpm, Math.abs(S.spd), phResult.throttle, S.isDrift, CFG.eng);

  // Car visual
  carObj.group.position.copy(S.p); carObj.group.rotation.y = S.a;
  carObj.group.rotation.z += (-S.av * 3.5 - carObj.group.rotation.z) * .1;
  carObj.group.rotation.x += ((K.KeyW||K.ArrowUp ? -.02 : 0) + (K.KeyS||K.ArrowDown ? .03 : 0) - carObj.group.rotation.x) * .08;
  carObj.wheels.forEach(w => w.rotation.x += S.spd * 3);

  spawnCarParticles();
  particles.update(dt, GFX.partMax);
  updateCam();
  updateHUD(S, GFX);
  updateMinimap(document.getElementById('mmC').getContext('2d'), world.trackPts, S.p, S.a);

  renderer.render(scene, camera);
}

// ========== RACE START ==========
async function beginRace() {
  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';

  buildCar();
  resetCarPos();
  Object.assign(S, { hp:100, nitro:100, gear:1, rpm:0, spd:0, curLap:0, crossed:false, totalLaps:0, dScore:0, isDrift:false, bestLap:Infinity });
  S.v.set(0,0,0); nitroRef.val = 100;
  carObj.group.position.copy(S.p); carObj.group.rotation.y = S.a;

  // Position camera
  const off = new THREE.Vector3(-Math.sin(S.a)*13, 7, -Math.cos(S.a)*13);
  camera.position.copy(S.p.clone().add(off)); camera.lookAt(S.p);
  renderer.render(scene, camera);

  if (!audio.isReady()) audio.init(CFG.vol);
  raceStarted = true;
  updateStats({ race: true });

  // Countdown
  const ce = document.getElementById('cntD'); ce.style.display = 'block'; ce.style.color = '#fff';
  for (let i = 3; i >= 1; i--) {
    ce.textContent = i; ce.style.animation = 'none'; void ce.offsetWidth; ce.style.animation = 'cpop .5s ease-out';
    audio.sfx('beep', i===1?880:440);
    await new Promise(r => setTimeout(r, 1000));
  }
  ce.textContent = 'GO!'; ce.style.color = '#00ff88'; ce.style.animation = 'none'; void ce.offsetWidth; ce.style.animation = 'cpop .5s ease-out';
  audio.sfx('beep', 1200);
  audio.startDefaultMusic();
  await new Promise(r => setTimeout(r, 700));
  ce.style.display = 'none';

  running = true; clock.start();
}

function resume() { paused = false; document.getElementById('pauseM').style.display = 'none'; clock.start(); }

function toMenu() {
  paused = false; running = false;
  audio.stopMusic();
  document.getElementById('pauseM').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('gc').style.filter = '';
  document.getElementById('mainMenu').style.display = 'flex';
  S.spd = 0; S.v.set(0,0,0);
}

// ========== BOOT ==========
initMenuParticles();
init3D();
