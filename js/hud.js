// js/hud.js — HUD rendering
export function updateHUD(state, gfx) {
  const kmh = Math.abs(state.spd) * 120;
  document.getElementById('spdV').textContent = Math.floor(kmh);
  document.getElementById('gearD').textContent = state.spd < 0 ? 'R' : state.gear;
  document.getElementById('rpmI').style.height = Math.min(100, state.rpm * 100) + '%';
  document.getElementById('nitI').style.width = state.nitro + '%';
  if (state.curLap > 0) document.getElementById('lapT').textContent = fmt(performance.now() - state.lapSt);
  if (state.bestLap < Infinity) document.getElementById('bestT').textContent = 'BEST: ' + fmt(state.bestLap);
  document.getElementById('lapC').textContent = 'LAP: ' + state.totalLaps;
  const df = document.getElementById('dftT');
  if (state.isDrift && state.dScore > 50) { df.style.opacity = '1'; df.textContent = '🔥 DRIFT +' + Math.floor(state.dScore); }
  else df.style.opacity = '0';
  document.getElementById('dmg').style.boxShadow = state.hp < 50 ? `inset 0 0 ${30*(1-state.hp/50)}px rgba(255,0,0,${.4*(1-state.hp/50)})` : 'none';
  if (gfx.spdLines) document.getElementById('spdLines').style.opacity = Math.min(1, Math.abs(state.spd) / 2);
  else document.getElementById('spdLines').style.opacity = '0';
  if (gfx.bloom) { const bl = Math.min(1.5, Math.abs(state.spd) * .3); document.getElementById('gc').style.filter = `brightness(${1+bl*.08}) contrast(${1+bl*.03})`; }
  else document.getElementById('gc').style.filter = '';
}

export function updateMinimap(ctx, trackPts, pos, angle) {
  ctx.clearRect(0, 0, 130, 130);
  const sc = .13, cx = 65, cy = 65;
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2.5; ctx.beginPath();
  trackPts.forEach((p, i) => { const x = cx + (p.x - pos.x) * sc, y = cy + (p.z - pos.z) * sc; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.closePath(); ctx.stroke();
  ctx.fillStyle = '#ff3333'; ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ff6666'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(angle) * 8, cy + Math.cos(angle) * 8); ctx.stroke();
}

function fmt(ms) {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(c).padStart(2,'0')}`;
}
