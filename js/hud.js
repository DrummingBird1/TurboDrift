// js/hud.js — HUD rendering
let crackDirty = false;
let lastReverse = false;

export function updateHUD(state, gfx) {
  const kmh = Math.abs(state.spd) * 120;
  document.getElementById('spdV').textContent = Math.floor(kmh);
  document.getElementById('gearD').textContent = state.spd < 0 ? 'R' : state.gear;
  document.getElementById('rpmI').style.height = Math.min(100, state.rpm * 100) + '%';
  document.getElementById('nitI').style.width = state.nitro + '%';
  if (state.curLap > 0) document.getElementById('lapT').textContent = fmt(performance.now() - state.lapSt);
  if (state.bestLap < Infinity) document.getElementById('bestT').textContent = 'BEST: ' + fmt(state.bestLap);
  document.getElementById('lapC').textContent = 'LAP: ' + state.totalLaps + (state.raceLaps ? '/' + state.raceLaps : '');

  // Race position (circuit only)
  const posEl = document.getElementById('posInd');
  if (posEl) {
    if (state.raceMode === 'circuit' && state.racePos > 0) {
      posEl.style.opacity = '1';
      posEl.textContent = 'P ' + state.racePos + '/' + state.raceTotal;
      posEl.style.color = state.racePos === 1 ? '#ffd700' : '#fff';
    } else posEl.style.opacity = '0';
  }

  const df = document.getElementById('dftT');
  if (state.isDrift && state.dScore > 50) {
    df.style.opacity = '1';
    df.textContent = '🔥 DRIFT +' + Math.floor(state.dScore);
  } else df.style.opacity = '0';

  // Damage vignette
  const dmg = document.getElementById('dmg');
  if (state.hp < 60) {
    const t = 1 - state.hp / 60;
    dmg.style.boxShadow = `inset 0 0 ${50 * t}px rgba(255,30,30,${.5 * t})`;
  } else dmg.style.boxShadow = 'none';

  // Crash crack overlay
  const crack = document.getElementById('crackOverlay');
  if (crack) {
    if (state.crashFrame && !crackDirty) {
      crack.style.opacity = '0.4';
      crackDirty = true;
      setTimeout(() => { crack.style.opacity = '0'; crackDirty = false; }, 600);
    }
  }

  // Speed lines
  if (gfx.spdLines) document.getElementById('spdLines').style.opacity = Math.min(1, Math.abs(state.spd) / 2);
  else document.getElementById('spdLines').style.opacity = '0';

  // Bloom-ish brightness (CSS fallback only — skip when real post-processing bloom is active)
  if (gfx.bloom && !gfx.realBloom) {
    const bl = Math.min(1.5, Math.abs(state.spd) * .3);
    const nit = state.nitroActive ? 1.15 : 1;
    document.getElementById('gc').style.filter = `brightness(${(1 + bl * .08) * nit}) contrast(${1 + bl * .03}) saturate(${1 + bl * .05})`;
  } else document.getElementById('gc').style.filter = '';

  // Reverse indicator
  const rev = document.getElementById('revInd');
  if (rev) {
    const isRev = state.spd < -0.02;
    if (isRev !== lastReverse) { rev.style.opacity = isRev ? '1' : '0'; lastReverse = isRev; }
  }

  // Health bar
  const hpBar = document.getElementById('hpI');
  if (hpBar) hpBar.style.width = state.hp + '%';

  // Boost active indicator
  const boostInd = document.getElementById('boostInd');
  if (boostInd) boostInd.style.opacity = (state.boostT > 0) ? '1' : '0';
}

export function updateMinimap(ctx, trackPts, pos, angle, boostPads = [], ghostPos = null, aiCars = []) {
  ctx.clearRect(0, 0, 130, 130);
  const sc = .13, cx = 65, cy = 65;

  // Track outline
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2.5; ctx.beginPath();
  trackPts.forEach((p, i) => {
    const x = cx + (p.x - pos.x) * sc, y = cy + (p.z - pos.z) * sc;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath(); ctx.stroke();

  // Boost pads
  ctx.fillStyle = '#00ff88';
  for (const bp of boostPads) {
    const x = cx + (bp.x - pos.x) * sc, y = cy + (bp.z - pos.z) * sc;
    if (x >= 0 && x <= 130 && y >= 0 && y <= 130) {
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Ghost car
  if (ghostPos) {
    ctx.fillStyle = 'rgba(180,180,255,.7)';
    const x = cx + (ghostPos.x - pos.x) * sc, y = cy + (ghostPos.z - pos.z) * sc;
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  // AI cars
  ctx.fillStyle = '#ffaa00';
  for (const ai of aiCars) {
    const x = cx + (ai.x - pos.x) * sc, y = cy + (ai.z - pos.z) * sc;
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  // Player
  ctx.fillStyle = '#ff3333'; ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ff6666'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(angle) * 8, cy + Math.cos(angle) * 8); ctx.stroke();
}

function fmt(ms) {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

export function updateDebug(state, gfx, fps, drawInfo, particleCount) {
  const d = document.getElementById('debugO');
  if (!d || d.style.display === 'none') return;
  d.innerHTML = `
    <div>FPS: ${fps.toFixed(0)}</div>
    <div>Draws: ${drawInfo.calls} | Tri: ${drawInfo.triangles}</div>
    <div>Particles: ${particleCount}</div>
    <div>Pos: ${state.p.x.toFixed(1)}, ${state.p.z.toFixed(1)}</div>
    <div>Spd: ${state.spd.toFixed(2)} (${Math.floor(state.kmh)} km/h)</div>
    <div>Gear: ${state.gear} | RPM: ${state.rpm.toFixed(2)}</div>
    <div>HP: ${state.hp.toFixed(0)} | Drift: ${state.dScore.toFixed(0)}</div>
    <div>Lap: ${state.totalLaps}</div>
  `;
}
