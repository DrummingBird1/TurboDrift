// js/storage.js — Persistent data layer (localStorage + fallback)
const _mem = {};
const PREFIX = 'td3d_';

function hasLS() {
  try { localStorage.setItem('__td__', '1'); localStorage.removeItem('__td__'); return true; }
  catch { return false; }
}
const LS_OK = hasLS();

export async function dbGet(k) {
  if (LS_OK) {
    try {
      const raw = localStorage.getItem(PREFIX + k);
      return raw ? JSON.parse(raw) : null;
    } catch { /* fall through */ }
  }
  // Legacy/fallback path
  if (typeof window !== 'undefined' && window.storage) {
    try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; }
    catch {}
  }
  return _mem[k] ?? null;
}

export async function dbSet(k, v) {
  _mem[k] = v;
  const s = JSON.stringify(v);
  if (LS_OK) {
    try { localStorage.setItem(PREFIX + k, s); return; }
    catch (e) { console.warn('[storage] localStorage failed', e); }
  }
  if (typeof window !== 'undefined' && window.storage) {
    try { await window.storage.set(k, s); } catch {}
  }
}

export async function dbDel(k) {
  delete _mem[k];
  if (LS_OK) { try { localStorage.removeItem(PREFIX + k); } catch {} }
}

export async function dbListUsers() {
  if (!LS_OK) return Object.keys(_mem).filter(k => k.startsWith('user_')).map(k => k.slice(5));
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX + 'user_')) out.push(key.slice(PREFIX.length + 5));
  }
  return out;
}
