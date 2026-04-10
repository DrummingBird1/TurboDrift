// js/auth.js — Registration & login
import { dbGet, dbSet } from './storage.js';

export function setupAuth(onLogin) {
  window._authOnLogin = onLogin;
}

export async function doRegister() {
  const u = document.getElementById('regUser').value.trim();
  const p = document.getElementById('regPass').value;
  const p2 = document.getElementById('regPass2').value;
  const msg = document.getElementById('authMsg');
  if (!u || u.length < 2) { msg.className='auth-msg err'; msg.textContent='שם משתמש חייב להכיל 2+ תווים'; return; }
  if (p.length < 4) { msg.className='auth-msg err'; msg.textContent='סיסמה חייבת להכיל 4+ תווים'; return; }
  if (p !== p2) { msg.className='auth-msg err'; msg.textContent='הסיסמאות לא תואמות'; return; }
  const existing = await dbGet('user_' + u);
  if (existing) { msg.className='auth-msg err'; msg.textContent='שם משתמש תפוס'; return; }
  const data = { pass:p, stats:{laps:0,bestLap:null,topSpeed:0,totalDrift:0,races:0,coins:0}, achievements:[], missions:{}, ownedCars:[] };
  await dbSet('user_'+u, data);
  msg.className='auth-msg ok'; msg.textContent='נרשמת בהצלחה!';
  setTimeout(() => window._authOnLogin(u), 600);
}

export async function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const msg = document.getElementById('authMsg');
  if (!u) { msg.className='auth-msg err'; msg.textContent='הכנס שם משתמש'; return; }
  const data = await dbGet('user_'+u);
  if (!data || data.pass !== p) { msg.className='auth-msg err'; msg.textContent='שם משתמש או סיסמה שגויים'; return; }
  window._authOnLogin(u);
}

export function skipAuth() { window._authOnLogin('אורח'); }

export function switchAuthTab(mode) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('authLogin').style.display = mode==='login'?'block':'none';
  document.getElementById('authRegister').style.display = mode==='register'?'block':'none';
  const tabs = document.querySelectorAll('.auth-tab');
  tabs[mode==='login'?0:1].classList.add('active');
  document.getElementById('authMsg').textContent = '';
}
