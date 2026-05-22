// js/auth.js — Registration & login (SHA-256 + salt)
import { dbGet, dbSet } from './storage.js';

function sanitizeUsername(u) {
  return (u || '').trim().replace(/[^a-zA-Z0-9_֐-׿\- ]/g, '').slice(0, 24);
}

function genSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPwd(pwd, salt) {
  const data = new TextEncoder().encode(pwd + ':' + salt + ':td3d');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function setupAuth(onLogin) { window._authOnLogin = onLogin; }

function showMsg(cls, text) {
  const msg = document.getElementById('authMsg');
  msg.className = 'auth-msg ' + cls;
  msg.textContent = text;
}

export async function doRegister() {
  const u = sanitizeUsername(document.getElementById('regUser').value);
  const p = document.getElementById('regPass').value;
  const p2 = document.getElementById('regPass2').value;
  if (!u || u.length < 2) return showMsg('err', 'שם משתמש חייב להכיל 2+ תווים');
  if (p.length < 4) return showMsg('err', 'סיסמה חייבת להכיל 4+ תווים');
  if (p !== p2) return showMsg('err', 'הסיסמאות לא תואמות');
  const existing = await dbGet('user_' + u);
  if (existing) return showMsg('err', 'שם משתמש תפוס');

  const salt = genSalt();
  const hash = await hashPwd(p, salt);
  const data = {
    salt, hash,
    stats: { laps: 0, bestLap: null, topSpeed: 0, totalDrift: 0, races: 0, coins: 0, distance: 0, crashes: 0 },
    achievements: [], missions: {}, ownedCars: [],
    customization: { color: null }, settings: null,
    created: Date.now()
  };
  await dbSet('user_' + u, data);
  showMsg('ok', 'נרשמת בהצלחה!');
  setTimeout(() => window._authOnLogin(u), 500);
}

export async function doLogin() {
  const u = sanitizeUsername(document.getElementById('loginUser').value);
  const p = document.getElementById('loginPass').value;
  if (!u) return showMsg('err', 'הכנס שם משתמש');
  const data = await dbGet('user_' + u);
  if (!data) return showMsg('err', 'שם משתמש או סיסמה שגויים');

  // Legacy plaintext migration
  if (data.pass !== undefined && !data.hash) {
    if (data.pass !== p) return showMsg('err', 'שם משתמש או סיסמה שגויים');
    const salt = genSalt();
    data.hash = await hashPwd(p, salt); data.salt = salt;
    delete data.pass;
    await dbSet('user_' + u, data);
  } else {
    const hash = await hashPwd(p, data.salt || '');
    if (hash !== data.hash) return showMsg('err', 'שם משתמש או סיסמה שגויים');
  }
  window._authOnLogin(u);
}

export function skipAuth() { window._authOnLogin('אורח'); }

export function switchAuthTab(mode) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('authLogin').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('authRegister').style.display = mode === 'register' ? 'block' : 'none';
  const tabs = document.querySelectorAll('.auth-tab');
  tabs[mode === 'login' ? 0 : 1].classList.add('active');
  document.getElementById('authMsg').textContent = '';
}
