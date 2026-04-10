// js/achievements.js — Achievement system
export const ACHS = [
  { id:'first_race', title:'מירוץ ראשון', icon:'🏁', cond: s => s.races >= 1 },
  { id:'speed_demon', title:'שד המהירות', icon:'⚡', cond: s => s.topSpeed >= 250 },
  { id:'drift_master', title:'אמן הדריפט', icon:'🌀', cond: s => s.totalDrift >= 2000 },
  { id:'veteran', title:'ותיק', icon:'🎖️', cond: s => s.races >= 10 },
  { id:'perfectlap', title:'הקפה מושלמת', icon:'💎', cond: s => s.bestLap && s.bestLap <= 50 },
  { id:'nitro_king', title:'מלך הניטרו', icon:'🔥', cond: s => s.topSpeed >= 350 },
  { id:'endurance', title:'סיבולת', icon:'🏆', cond: s => s.laps >= 50 },
  { id:'lap_legend', title:'אגדת המסלול', icon:'👑', cond: s => s.laps >= 100 },
  { id:'max_speed', title:'מקסימום!', icon:'🚀', cond: s => s.topSpeed >= 380 },
  { id:'rich', title:'עשיר', icon:'💰', cond: s => s.coins >= 1000 },
];

export function renderAchievements(container, unlocked) {
  container.innerHTML = '';
  ACHS.forEach(a => {
    const u = unlocked.includes(a.id);
    const d = document.createElement('div');
    d.className = 'ach' + (u ? ' unlocked' : '');
    d.innerHTML = `<div class="aicon">${a.icon}</div><div class="aname">${a.title}</div>`;
    container.appendChild(d);
  });
}

export function checkAchievements(stats, unlocked) {
  const newlyUnlocked = [];
  ACHS.forEach(a => {
    if (!unlocked.includes(a.id) && a.cond(stats)) {
      unlocked.push(a.id);
      newlyUnlocked.push(a);
    }
  });
  return newlyUnlocked;
}
