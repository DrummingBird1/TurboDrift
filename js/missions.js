// js/missions.js — Mission definitions & tracking
export const MISSIONS = [
  { id:'lap1', title:'הקפה ראשונה', desc:'השלם הקפה אחת', icon:'🏁', target:1, stat:'laps', coins:50 },
  { id:'lap5', title:'רץ מרתון', desc:'השלם 5 הקפות', icon:'🔄', target:5, stat:'laps', coins:100 },
  { id:'lap20', title:'אין עצירה', desc:'השלם 20 הקפות', icon:'♾️', target:20, stat:'laps', coins:300 },
  { id:'speed200', title:'מהיר ומסוכן', desc:'הגע ל-200 קמ"ש', icon:'💨', target:200, stat:'topSpeed', coins:75 },
  { id:'speed300', title:'על קצה המחט', desc:'הגע ל-300 קמ"ש', icon:'🚀', target:300, stat:'topSpeed', coins:200 },
  { id:'drift500', title:'דריפטר מתחיל', desc:'צבור 500 נקודות דריפט', icon:'🌀', target:500, stat:'totalDrift', coins:100 },
  { id:'drift5000', title:'מלך הדריפט', desc:'צבור 5,000 נקודות', icon:'🔥', target:5000, stat:'totalDrift', coins:400 },
  { id:'race5', title:'רייסר קבוע', desc:'השלם 5 מירוצים', icon:'🏎️', target:5, stat:'races', coins:150 },
  { id:'bestlap60', title:'הקפה מהירה', desc:'הקפה מתחת ל-60 שניות', icon:'⏱️', target:60, stat:'bestLap', compare:'lt', coins:200 },
  { id:'bestlap45', title:'שובר שיאים', desc:'הקפה מתחת ל-45 שניות', icon:'⚡', target:45, stat:'bestLap', compare:'lt', coins:500 },
];

export function renderMissions(container, stats, completed) {
  container.innerHTML = '';
  MISSIONS.forEach(m => {
    const val = stats[m.stat] || 0;
    const done = completed[m.id] || (m.compare === 'lt' ? (val > 0 && val <= m.target) : val >= m.target);
    const pct = m.compare === 'lt' ? (done ? 100 : (val > 0 ? Math.min(99, (m.target / val) * 100) : 0)) : Math.min(100, (val / m.target) * 100);
    const d = document.createElement('div');
    d.className = 'mission' + (done ? ' done' : '');
    d.innerHTML = `<div class="mtitle">${m.icon} ${m.title}</div><div class="mdesc">${m.desc}</div>
      <div class="mprog"><div class="mbar"><div class="mfill" style="width:${pct}%"></div></div>
      <div class="mval">${done ? '✓' : (m.compare === 'lt' ? (val > 0 ? (val/1000).toFixed(1)+'s' : '-') : Math.floor(val)+'/'+m.target)}</div></div>
      <div class="mreward">🪙 ${m.coins}</div>`;
    container.appendChild(d);
  });
}

export function checkMissions(stats, completed) {
  const newlyDone = [];
  MISSIONS.forEach(m => {
    if (completed[m.id]) return;
    const val = stats[m.stat] || 0;
    const done = m.compare === 'lt' ? (val > 0 && val <= m.target) : val >= m.target;
    if (done) { completed[m.id] = true; newlyDone.push(m); }
  });
  return newlyDone;
}
