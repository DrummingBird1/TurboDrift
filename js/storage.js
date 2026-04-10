// js/storage.js — Persistent data layer
const _mem = {};
export async function dbGet(k) {
  try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; }
  catch { return _mem[k] || null; }
}
export async function dbSet(k, v) {
  _mem[k] = v;
  try { await window.storage.set(k, JSON.stringify(v)); } catch {}
}
