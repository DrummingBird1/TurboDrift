// js/menu.js — Menu navigation & settings
export function showPanel(id) {
  document.querySelectorAll('.mpanel').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

export function initMenuParticles() {
  const c = document.getElementById('mParts');
  for (let i = 0; i < 30; i++) {
    const d = document.createElement('div'); d.className = 'mpart';
    d.style.cssText = `left:${Math.random()*100}%;animation-duration:${6+Math.random()*10}s;animation-delay:${-Math.random()*10}s;width:${1+Math.random()*3}px;height:${1+Math.random()*3}px;opacity:${.2+Math.random()*.4}`;
    c.appendChild(d);
  }
}

export function toggleSetting(el, gfx, cfg) {
  el.classList.toggle('on');
  const on = el.classList.contains('on');
  const map = {tSfx:['cfg','sfx'],tEng:['cfg','eng'],tShd:['gfx','shad'],tPrt:['gfx','part'],tShk:['gfx','shk'],tSpd:['gfx','spdLines'],tBlm:['gfx','bloom']};
  const m = map[el.id];
  if (m) (m[0]==='gfx'?gfx:cfg)[m[1]] = on;
}

export function setGfxPreset(preset, gfx, renderer, scene) {
  const presets = {
    low:  {shad:false,part:false,bloom:false,spdLines:false,shk:false,shadowRes:512,pixRatio:1,drawDist:.003,partMax:100},
    med:  {shad:true,part:true,bloom:false,spdLines:true,shk:true,shadowRes:1024,pixRatio:1.5,drawDist:.0022,partMax:200},
    high: {shad:true,part:true,bloom:true,spdLines:true,shk:true,shadowRes:2048,pixRatio:2,drawDist:.0018,partMax:400},
    ultra:{shad:true,part:true,bloom:true,spdLines:true,shk:true,shadowRes:4096,pixRatio:2.5,drawDist:.0012,partMax:600}
  };
  Object.assign(gfx, presets[preset]);
  if (renderer) { renderer.shadowMap.enabled = gfx.shad; renderer.setPixelRatio(Math.min(gfx.pixRatio, window.devicePixelRatio)); }
  if (scene && scene.fog) scene.fog.density = gfx.drawDist;
  ['tShd','tPrt','tShk','tSpd','tBlm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const key = {tShd:'shad',tPrt:'part',tShk:'shk',tSpd:'spdLines',tBlm:'bloom'}[id]; el.classList.toggle('on', gfx[key]); }
  });
}
