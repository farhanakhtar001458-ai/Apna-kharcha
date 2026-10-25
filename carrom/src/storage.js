/* ==========================================================================
   Apna Carrom — localStorage persistence (settings, resumable match, history).
   All access is guarded so private-browsing / disabled storage never breaks play.
   ========================================================================== */

import { SETTINGS_DEFAULTS, STORAGE_KEYS } from './constants.js';

function available() {
  try {
    if (typeof localStorage === 'undefined') return false;
    const k = '__apna_carrom_probe__';
    localStorage.setItem(k, '1'); localStorage.removeItem(k);
    return true;
  } catch { return false; }
}

function read(key, fallback) {
  if (!available()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function write(key, value) {
  if (!available()) return false;
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function loadSettings() {
  const raw = read(STORAGE_KEYS.settings, {});
  return { ...SETTINGS_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
}

export function saveSettings(settings) {
  return write(STORAGE_KEYS.settings, {
    ...SETTINGS_DEFAULTS, ...settings,
  });
}

export function loadMatch() {
  const m = read(STORAGE_KEYS.match, null);
  return m && m.version === 1 ? m : null;
}

export function saveMatch(payload) {
  return write(STORAGE_KEYS.match, { version: 1, savedAt: Date.now(), ...payload });
}

export function clearMatch() {
  if (!available()) return;
  try { localStorage.removeItem(STORAGE_KEYS.match); } catch { /* ignore */ }
}

export function loadHistory() {
  const h = read(STORAGE_KEYS.history, []);
  return Array.isArray(h) ? h.slice(0, 20) : [];
}

export function pushHistory(entry) {
  const h = loadHistory();
  h.unshift({ ...entry, at: Date.now() });
  return write(STORAGE_KEYS.history, h.slice(0, 20));
}

export function clearHistory() {
  return write(STORAGE_KEYS.history, []);
}

export function clearAll() {
  if (!available()) return;
  try { Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
}
