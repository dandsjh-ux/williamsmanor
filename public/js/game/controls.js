// Keyboard + mouse and touch input. The game reads `input` every frame and gets
// one-shot actions through the handlers passed to `attachControls`.

import { prefs, isTouch } from '../prefs.js';

export const input = {
  forward: 0, strafe: 0, jog: false,
  lookX: 0, lookY: 0,          // accumulated look deltas (radians) since the last frame
  interactHeld: false,
  enabled: false,              // false while an overlay, chat or the pause menu is open
};

const keys = new Set();
let handlers = {};

function keyAxis() {
  const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  return [f, s];
}

let touchMove = [0, 0, false];

function refreshAxes() {
  const [f, s] = keyAxis();
  input.forward = f || touchMove[0];
  input.strafe = s || touchMove[1];
  input.jog = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchMove[2];
}

export function attachControls(canvas, h) {
  handlers = h;

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    refreshAxes();
    if (!input.enabled) {
      if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyJ') handlers.back?.(e.code);
      return;
    }
    switch (e.code) {
      case 'KeyE': input.interactHeld = true; handlers.interact?.(); break;
      case 'KeyF': handlers.flashlight?.(); break;
      case 'Tab': case 'KeyJ': handlers.journal?.(); break;
      case 'KeyT': case 'Enter': e.preventDefault(); handlers.chat?.(); break;
      case 'KeyQ': handlers.ping?.(); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': handlers.pingChoice?.(Number(e.code.slice(-1)) - 1); break;
      case 'Escape': handlers.pause?.(); break;
      default: break;
    }
  });
  addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'KeyE') { input.interactHeld = false; handlers.interactUp?.(); }
    refreshAxes();
  });
  addEventListener('blur', () => { keys.clear(); input.interactHeld = false; refreshAxes(); });

  // Mouse look with pointer lock
  canvas.addEventListener('click', () => {
    if (input.enabled && !isTouch && document.pointerLockElement !== canvas) lockPointer(canvas);
  });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas || !input.enabled) return;
    const k = 0.0022 * prefs.mouseSens;
    input.lookX -= e.movementX * k;
    input.lookY -= e.movementY * k * (prefs.invertY ? -1 : 1);
  });
  document.addEventListener('pointerlockchange', () => handlers.lockChange?.(document.pointerLockElement === canvas));

  if (isTouch) attachTouch();
}

export const pointerLocked = () => !!document.pointerLockElement;

/** Ask for pointer lock; browsers refuse without a recent click, which is fine (the hint says "click"). */
export function lockPointer(canvas) {
  try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed right now */ }
}

function attachTouch() {
  const zone = document.getElementById('joy-zone');
  const base = document.getElementById('joy-base');
  const knob = document.getElementById('joy-knob');
  const look = document.getElementById('look-zone');
  const R = 55;
  let joyId = null, cx = 0, cy = 0;

  zone.addEventListener('pointerdown', (e) => {
    if (joyId !== null) return;
    joyId = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    const r = zone.getBoundingClientRect();
    cx = e.clientX; cy = e.clientY;
    base.style.left = `${cx - r.left}px`;
    base.style.top = `${cy - r.top}px`;
    base.style.bottom = 'auto';
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touchMove = [-dy / R, dx / R, d > R * 1.15];
    refreshAxes();
  });
  const joyEnd = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    knob.style.transform = '';
    base.style.left = ''; base.style.top = ''; base.style.bottom = '';
    touchMove = [0, 0, false];
    refreshAxes();
  };
  zone.addEventListener('pointerup', joyEnd);
  zone.addEventListener('pointercancel', joyEnd);

  const lookIds = new Map();
  look.addEventListener('pointerdown', (e) => { look.setPointerCapture(e.pointerId); lookIds.set(e.pointerId, [e.clientX, e.clientY]); });
  look.addEventListener('pointermove', (e) => {
    const last = lookIds.get(e.pointerId);
    if (!last || !input.enabled) return;
    const k = 0.0045 * prefs.touchSens;
    input.lookX -= (e.clientX - last[0]) * k;
    input.lookY -= (e.clientY - last[1]) * k * (prefs.invertY ? -1 : 1);
    lookIds.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const lookEnd = (e) => lookIds.delete(e.pointerId);
  look.addEventListener('pointerup', lookEnd);
  look.addEventListener('pointercancel', lookEnd);

  const btn = (id, down, up) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); down(); });
    if (up) {
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    }
  };
  btn('t-interact', () => { if (!input.enabled) return; input.interactHeld = true; handlers.interact?.(); }, () => { input.interactHeld = false; handlers.interactUp?.(); });
  btn('t-torch', () => input.enabled && handlers.flashlight?.());
  btn('t-journal', () => input.enabled && handlers.journal?.());
  btn('t-chat', () => input.enabled && handlers.chat?.());
  btn('t-ping', () => input.enabled && handlers.ping?.());
  btn('t-pause', () => handlers.pause?.());
}
