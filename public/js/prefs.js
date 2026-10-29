// Per-device preferences, profile and rejoin token, kept in localStorage.
// Every access is wrapped: private windows can block storage, and the game must still run.

export const COLORS = ['#e6194b', '#f58231', '#ffe119', '#3cb44b', '#42d4f4', '#4363d8', '#911eb4', '#f032e6'];

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const prefs = load('wm_prefs', {
  volume: 0.8,
  mouseSens: 1,
  touchSens: 1,
  invertY: false,
  captions: true,
  graphics: matchMedia('(pointer: coarse)').matches ? 'low' : 'high',
});

export const profile = load('wm_profile', {
  name: '',
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
});

export function savePrefs() { save('wm_prefs', prefs); }
export function saveProfile() { save('wm_profile', profile); }

export function getToken() {
  let token = null;
  try { token = localStorage.getItem('wm_token'); } catch { /* ignore */ }
  if (!token) {
    token = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
    try { localStorage.setItem('wm_token', token); } catch { /* ignore */ }
  }
  return token;
}

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
