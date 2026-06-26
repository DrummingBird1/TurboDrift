// js/menu.js — Menu navigation & settings
import { dbGet, dbSet } from './storage.js';

export function showPanel(id) {
  document.querySelectorAll('.mpanel').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

export function initMenuParticles() {
  const c = document.getElementById('mParts');
  if (!c) return;
  for (let i = 0; i < 30; i++) {
    const d = document.createElement('div'); d.className = 'mpart';
    d.style.cssText = `left:${Math.random() * 100}%;animation-duration:${6 + Math.random() * 10}s;animation-delay:${-Math.random() * 10}s;width:${1 + Math.random() * 3}px;height:${1 + Math.random() * 3}px;opacity:${.2 + Math.random() * .4}`;
    c.appendChild(d);
  }
}

const TOG_MAP = { tSfx:['cfg','sfx'], tEng:['cfg','eng'], tShd:['gfx','shad'], tPrt:['gfx','part'], tShk:['gfx','shk'], tSpd:['gfx','spdLines'], tBlm:['gfx','bloom'], tRain:['gfx','rain'], tDbg:['gfx','debug'] };

export function toggleSetting(el, gfx, cfg) {
  el.classList.toggle('on');
  const on = el.classList.contains('on');
  const m = TOG_MAP[el.id];
  if (m) (m[0] === 'gfx' ? gfx : cfg)[m[1]] = on;
  saveSettings(gfx, cfg);
}

const PRESETS = {
  low:   { shad:false, part:false, bloom:false, spdLines:false, shk:false, rain:false, shadowRes:512,  pixRatio:1,    drawDist:.003,  partMax:100 },
  med:   { shad:true,  part:true,  bloom:false, spdLines:true,  shk:true,  rain:true,  shadowRes:1024, pixRatio:1.5,  drawDist:.0022, partMax:200 },
  high:  { shad:true,  part:true,  bloom:true,  spdLines:true,  shk:true,  rain:true,  shadowRes:2048, pixRatio:2,    drawDist:.0018, partMax:400 },
  ultra: { shad:true,  part:true,  bloom:true,  spdLines:true,  shk:true,  rain:true,  shadowRes:4096, pixRatio:2.5,  drawDist:.0012, partMax:600 }
};

export function setGfxPreset(preset, gfx, renderer, scene) {
  const p = PRESETS[preset]; if (!p) return;
  Object.assign(gfx, p);
  gfx.preset = preset;
  if (renderer) {
    renderer.shadowMap.enabled = gfx.shad;
    renderer.setPixelRatio(Math.min(gfx.pixRatio, window.devicePixelRatio));
  }
  if (scene && scene.fog) scene.fog.density = gfx.drawDist;
  document.querySelectorAll('.gfx-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === preset || (preset === 'med' && b.textContent.toLowerCase() === 'medium')));
  ['tShd','tPrt','tShk','tSpd','tBlm','tRain'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const key = { tShd:'shad', tPrt:'part', tShk:'shk', tSpd:'spdLines', tBlm:'bloom', tRain:'rain' }[id];
    el.classList.toggle('on', !!gfx[key]);
  });
  saveSettings(gfx, null);
}

export async function loadSettings(gfx, cfg, ctrl) {
  const saved = await dbGet('settings_global');
  if (!saved) return;
  if (saved.gfx) Object.assign(gfx, saved.gfx);
  if (saved.cfg) Object.assign(cfg, saved.cfg);
  if (saved.ctrl && ctrl) Object.assign(ctrl, saved.ctrl);
  // Sync toggles UI
  ['tSfx','tEng','tShd','tPrt','tShk','tSpd','tBlm','tRain'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const m = TOG_MAP[id]; if (!m) return;
    const on = (m[0] === 'gfx' ? gfx : cfg)[m[1]];
    el.classList.toggle('on', !!on);
  });
}

let saveTimer = null;
export function saveSettings(gfx, cfg, ctrl) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const cur = await dbGet('settings_global') || {};
    if (gfx) cur.gfx = { ...(cur.gfx || {}), ...gfx };
    if (cfg) cur.cfg = { ...(cur.cfg || {}), ...cfg };
    if (ctrl) cur.ctrl = { ...(cur.ctrl || {}), ...ctrl };
    await dbSet('settings_global', cur);
  }, 300);
}
