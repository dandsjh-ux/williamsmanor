// The investigation: renderer, scene, the local player, teammates, doors, pings,
// chat, the HUD and the pause menu.

import * as THREE from 'three';
import { prefs, isTouch } from '../prefs.js';
import { send, on } from '../net.js';
import * as audio from '../audio.js';
import { $, esc, openModal, closeModal, modalOpen, settingsHTML, wireSettings, controlsTabs, toast } from '../ui.js';
import { buildHouse, updateHouse, AREAS, LEVEL, areaAtPos, areaBrightness, doors, doorById, interactables, staticMeshes, anchors } from './house.js';
import { move, rayBlocked, EYE } from './physics.js';
import { input, attachControls, lockPointer } from './controls.js';
import { Teammates } from './players.js';
import { label } from './textures.js';
import { buildClues, syncNotes, markFound, foundList, updateScribbles, notes } from './clues.js';
import { buildPuzzles, syncPuzzles, onPuzzleState, onPuzzleSolved, updatePuzzles, resetLocal } from './puzzles.js';
import { initDirector, resetDirector, onDirectorEvent, onScribbleAdded, updateDirector, enteredRoom } from './director.js';
import { noteById, NOTES } from '../data/notes.js';

const PINGS = ['Over here', 'Found a note', 'Need a second player', "Something's wrong"];
const WALK = 2.6, JOG = 4.3, STAMINA = 4, BATTERY_SEC = 240;

let renderer, scene, camera, flashlight, roomLights, hemi, team, grain, built = false;
let running = false, lastT = 0, sendAcc = 0;
let room = null, selfId = null, isHost = false;
let timerAt = 0;
let hooks = {};

const me = { x: 0, y: 0, z: 7.5, vy: 0, yaw: 0, pitch: 0, flash: false, area: 'foyer', stamina: STAMINA, battery: 1, bob: 0 };
let chatOpen = false, wheelOpen = false, pausedAt = 0;
let focus = null;               // interactable under the crosshair
let tickSound = null;
const pingMarkers = [];
const batteries = [];

// ---------------------------------------------------------------------------- Setup

function init() {
  const canvas = $('#game-canvas');
  const high = prefs.graphics === 'high';
  renderer = new THREE.WebGLRenderer({ canvas, antialias: high, powerPreference: 'high-performance' });
  renderer.setPixelRatio(high ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1) * 0.75);
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false; // the film grain is drawn over each frame

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.065);

  camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
  camera.rotation.order = 'YXZ';
  camera.add(audio.listener);
  scene.add(camera);

  // Barely any light to see by: a whisper of moonlight everywhere, and a pool of lamplight
  // around the lamp of whichever room you are in. Two lamp lights cross-fade as you walk
  // between rooms, so the room behind you dims instead of snapping off.
  hemi = new THREE.HemisphereLight(0x4a5670, 0x0c0806, 0.07);
  scene.add(hemi);
  roomLights = [0, 1].map(() => {
    const light = new THREE.PointLight(0xffb070, 0, 12, 2);
    scene.add(light);
    return { light, area: null, fade: 0, base: 0 };
  });

  flashlight = new THREE.SpotLight(0xfff1d6, 0, 22, 0.5, 0.62, 1.5);
  flashlight.position.set(0.18, -0.22, 0.05);
  flashlight.target.position.set(0.05, -0.1, -4);
  flashlight.castShadow = high;
  flashlight.shadow.mapSize.set(1024, 1024);
  flashlight.shadow.camera.near = 0.2;
  flashlight.shadow.camera.far = 22;
  flashlight.shadow.bias = -0.0006;
  camera.add(flashlight, flashlight.target);

  buildHouse(scene, { shadows: high });
  buildClues(scene, { read: readNote });
  buildPuzzles({
    scene,
    caption,
    selfId: () => selfId,
    overlayOpened: () => { input.enabled = false; holding = null; if (document.pointerLockElement) document.exitPointerLock(); },
    overlayClosed: () => resumeInput(),
  });
  initDirector({
    scene,
    caption,
    camera: () => camera.position,
    forward: (v) => camera.getWorldDirection(v),
    me: () => me,
    flashOn: () => me.flash && !gardenDark.until,
    inOverlay: () => modalOpen(),
  });
  team = new Teammates(scene, high ? 7 : 3);
  grain = filmGrain();

  for (const d of doors) d.onUse = useDoor;

  attachControls(canvas, {
    interact: () => {
      if (!focus) return;
      const hold = typeof focus.holdMs === 'function' ? focus.holdMs() : focus.holdMs || 0;
      if (hold > 0) holding = { it: focus, t: 0, ms: hold };
      else focus.use();
    },
    interactUp: () => { holding = null; },
    flashlight: toggleFlashlight,
    journal: openJournal,
    chat: openChat,
    ping: () => toggleWheel(),
    pingChoice: (i) => wheelOpen && placePing(i),
    pause: openPause,
    back: (code) => {
      if (code === 'Escape' && performance.now() - pausedAt < 400) return;
      if (modalOpen()) closeModal();
    },
    lockChange: (locked) => {
      $('#click-to-play').classList.toggle('hidden', locked || isTouch || !running || modalOpen());
      if (!locked && running && input.enabled && !chatOpen) openPause();
    },
  });

  for (const b of document.querySelectorAll('#ping-wheel button')) b.onclick = () => placePing(+b.dataset.ping);
  $('#game-chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#game-chat-input').value.trim();
    if (v) send('chat:send', v);
    closeChat();
  });
  $('#game-chat-input').addEventListener('keydown', (e) => { if (e.code === 'Escape') { e.preventDefault(); closeChat(); } });
  $('#game-chat-input').addEventListener('blur', () => setTimeout(() => chatOpen && closeChat(), 50));

  on('state:snapshot', (s) => running && team.onSnapshot(s));
  on('door:state', ({ id, open, drift, slam }) => {
    const d = doorById(id);
    if (!d) return;
    d.setOpen(open);
    d.speed = drift && !slam ? 0.7 : slam ? 14 : 5;
    if (!running) return;
    if (slam) {
      audio.play('door_slam', { at: d.pos, scene, volume: 1, refDistance: 4 });
      if (prefs.captions) caption('[A door slams]');
    } else if (drift && prefs.captions && camera.position.distanceTo(d.pos) < 10) caption('[A door swings slowly shut]');
  });
  on('ping:placed', onPing);
  on('note:found', onNoteFound);
  on('puzzle:state', ({ id, state }) => onPuzzleState(id, state));
  on('puzzle:solved', (e) => running && onPuzzleSolved(e));
  on('director:event', (e) => running && onDirectorEvent(e));
  on('scribble:add', (s) => running && onScribbleAdded(s));
  on('hint:note', ({ text }) => {
    if (!running) return;
    caption(`[Hint] ${text}`, 9000);
    chatLine({ system: true, text: `Hint: ${text}` }, $('#game-chat-log'));
  });

  addEventListener('resize', resize);
  resize();
  built = true;
}

let sizeKey = '';
function resize() {
  if (!renderer) return;
  const w = innerWidth, h = innerHeight;
  sizeKey = `${w}x${h}@${devicePixelRatio}`;
  const high = prefs.graphics === 'high';
  renderer.setPixelRatio(high ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1) * 0.75);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const portrait = isTouch && h > w;
  $('#rotate-prompt').classList.toggle('hidden', !portrait || !running);
}

// ---------------------------------------------------------------------------- Lifecycle

export function startGame({ room: r, selfId: id, saved, hooks: h }) {
  hooks = h || {};
  if (!built) init();
  selfId = id;
  onRoom(r);
  // Spread players out across the foyer so nobody spawns inside anyone else.
  const idx = Math.max(0, r.players.findIndex((p) => p.id === id));
  Object.assign(me, { x: -1.5 + (idx % 4), y: 0, z: 7.5 + Math.floor(idx / 4) * 0.9, vy: 0, yaw: 0, pitch: 0, flash: false, stamina: STAMINA, battery: 1 });
  if (saved && Number.isFinite(saved.x) && saved.area) Object.assign(me, { x: saved.x, y: saved.y, z: saved.z, yaw: saved.yaw, pitch: 0 });
  me.area = areaAtPos(me);
  for (const d of doors) d.setOpen(!!r.doors?.[d.id]);
  setupBatteries(r.settings.batteryDrain);
  $('#bar-battery').classList.toggle('hidden', !r.settings.batteryDrain);
  $('#touch-ui').classList.toggle('hidden', !isTouch);
  $('#game-chat-log').innerHTML = '';
  running = true;
  input.enabled = true;
  resize();
  tickSound = audio.play('clock_tick', { loop: true, at: anchors.clock, scene, volume: 0.55, refDistance: 1.2, rolloff: 1.8 });
  resetDirector();
  resetLocal();
  syncPuzzles(r.puzzles);
  showArea(me.area);
  updateNoteCount();
  if (!r.notes?.[1]) setTimeout(() => running && !notes.get(1).found && caption(`Search the Foyer. ${isTouch ? 'Tap ✋' : 'Press E'} to look closer at things.`, 6000), 2500);
  $('#blackfade').classList.remove('out');
  requestAnimationFrame(() => $('#blackfade').classList.add('out'));
  if (isTouch) {
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } else {
    lockPointer($('#game-canvas'));
  }
  lastT = performance.now();
  requestAnimationFrame(loop);
}

export function stopGame() {
  if (!running) return;
  running = false;
  input.enabled = false;
  closeChat();
  toggleWheel(false);
  if (modalOpen()) closeModal();
  tickSound?.stop(0.5);
  endGardenDark();
  gardenDark.next = 0;
  team?.clear();
  for (const p of pingMarkers.splice(0)) scene.remove(p.obj);
  if (document.pointerLockElement) document.exitPointerLock();
  $('#click-to-play').classList.add('hidden');
  $('#scribble-big').classList.remove('show');
}

export const isRunning = () => running;

// Console access for testing: wm.game.me.x = ... teleports.
export const debug = { me, doors, notes, readNote: (id) => readNote(id), get focus() { return focus; }, get scene() { return scene; }, get renderer() { return renderer; } };

export function onRoom(r) {
  room = r;
  isHost = r.hostId === selfId;
  timerAt = performance.now();
  team?.setRoster(r.players, selfId);
  if (built) {
    syncNotes(r.notes);
    syncPuzzles(r.puzzles);
    for (const s of r.dynScribbles || []) onScribbleAdded(s, false);
    updateNoteCount();
  }
  if (running && modalOpen() && $('#pause-host')) renderHostControls();
}

// ---------------------------------------------------------------------------- Loop

function loop(t) {
  if (!running) return;
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  if (sizeKey !== `${innerWidth}x${innerHeight}@${devicePixelRatio}`) resize(); // window moved to another screen, zoom, rotation
  update(dt);
  renderer.clear();
  renderer.render(scene, camera);
  grain.draw(t);
}

// Film grain and a vignette, drawn over the finished frame. The multiply pass modulates the
// image (darks stay dark); the faint additive pass gives the blacks their speckle.
function filmGrain() {
  const res = new THREE.Vector2();
  const uniforms = { uTime: { value: 0 }, uRes: { value: res } };
  const frag = (body) => `
    uniform float uTime; uniform vec2 uRes;
    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main() {
      vec2 uv = gl_FragCoord.xy / uRes;
      float n = hash(floor(gl_FragCoord.xy) + floor(fract(uTime * 0.37) * 4096.0));
      ${body}
    }`;
  const vert = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const multiply = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, depthTest: false, depthWrite: false,
    fragmentShader: frag(`vec2 d = uv - 0.5; float vig = clamp(1.0 - dot(d, d) * 1.25, 0.0, 1.0);
      gl_FragColor = vec4(vec3(0.5 * vig * (1.0 + (n - 0.5) * 0.24)), 1.0);`),
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
  });
  const add = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, depthTest: false, depthWrite: false, transparent: true,
    fragmentShader: frag('gl_FragColor = vec4(vec3(pow(n, 6.0) * 0.05), 1.0);'),
    blending: THREE.AdditiveBlending,
  });
  const quad = new THREE.PlaneGeometry(2, 2);
  const s = new THREE.Scene();
  const a = new THREE.Mesh(quad, multiply), b = new THREE.Mesh(quad, add);
  a.frustumCulled = b.frustumCulled = false;
  b.renderOrder = 1;
  s.add(a, b);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    draw(t) {
      uniforms.uTime.value = t / 1000;
      renderer.getDrawingBufferSize(res);
      renderer.render(s, cam);
    },
  };
}

const fwd = new THREE.Vector3();

function update(dt) {
  // Look
  me.yaw += input.lookX;
  me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch + input.lookY));
  input.lookX = input.lookY = 0;

  // Move
  let f = input.enabled ? input.forward : 0, s = input.enabled ? input.strafe : 0;
  const len = Math.hypot(f, s);
  if (len > 1) { f /= len; s /= len; }
  const moving = len > 0.1;
  const jogging = moving && input.jog && me.stamina > 0.05 && f > 0;
  me.stamina = jogging ? Math.max(0, me.stamina - dt) : Math.min(STAMINA, me.stamina + dt * 0.6);
  const speed = jogging ? JOG : WALK;
  const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
  const dx = (-sin * f + cos * s) * speed * dt;
  const dz = (-cos * f - sin * s) * speed * dt;
  move(me, dx, dz, dt);
  me.bob += moving ? dt * (jogging ? 11 : 7.5) : 0;

  camera.position.set(me.x, me.y + EYE + Math.sin(me.bob) * (moving ? 0.035 : 0), me.z);
  camera.rotation.set(me.pitch, me.yaw, 0);

  // Flashlight battery
  if (room?.settings.batteryDrain && me.flash) {
    me.battery = Math.max(0, me.battery - dt / BATTERY_SEC);
    if (me.battery <= 0) { me.flash = false; caption('[Your flashlight dies]'); }
  }

  // Room
  const area = areaAtPos(me);
  if (area !== me.area) { me.area = area; showArea(area); enteredRoom(area); }
  const dying = gardenFlashlight(area === 'garden');
  const lit = me.flash && dying > 0;
  flashlight.intensity = lit ? 34 * dying * (me.battery < 0.1 && room?.settings.batteryDrain ? 0.4 + Math.random() * 0.6 : 1) : 0;
  const a = AREAS[area];
  const bright = areaBrightness(area);
  updateRoomLights(area, a.lamp && bright > 0.02 ? bright * (a.chandelier ? 40 : 16) : 0, dt);
  const outside = !!a.outside;
  scene.fog.color.setHex(outside ? 0x05070c : 0x000000);
  scene.fog.density += ((outside ? 0.075 : 0.055) - scene.fog.density) * Math.min(1, dt * 2);
  footstep(moving, jogging, outside);

  for (const d of doors) d.update(dt);
  updateHouse(dt, area === 'staircase' || area === 'foyer');
  team.update(camera.position, dt);
  updateFocus();
  const seen = updateScribbles(dt, camera.position, fwd, lit && input.enabled);
  if (seen && input.enabled) showScribble(seen);
  updatePuzzles(dt, { me, cam: camera.position, fwd, flashOn: lit, hints: room?.settings.whisperHints });
  updateDirector(dt);
  updateHold(dt);
  updatePings(dt);
  updateHud(jogging);

  // Send our state ten times a second
  sendAcc += dt;
  if (sendAcc >= 0.1) {
    sendAcc = 0;
    send('player:move', [me.x, me.y, me.z, me.yaw, me.pitch, lit, me.area, modalOpen() || chatOpen]);
  }
}

// ---------------------------------------------------------------------------- Lamplight

// roomLights[0] lights the room you are in; [1] is the room you just left, fading out.
// Flickers and power cuts still change the current lamp instantly.
function updateRoomLights(area, want, dt) {
  if (roomLights[0].area !== area) {
    roomLights.reverse();
    const [cur, prev] = roomLights;
    prev.base = prev.light.intensity;
    prev.fade = 1;
    if (cur.area !== area) {
      cur.area = area;
      cur.fade = 0;
      if (AREAS[area]?.lamp) cur.light.position.set(...AREAS[area].lamp);
    }
  }
  const [cur, prev] = roomLights;
  cur.fade = Math.min(1, cur.fade + dt * 3);
  cur.light.intensity = want * cur.fade;
  prev.fade = Math.max(0, prev.fade - dt * 3);
  prev.light.intensity = prev.base * prev.fade;
}

// ---------------------------------------------------------------------------- The garden takes your light

// Out in the Garden the flashlight now and then dies for 3-5 seconds while your heart pounds.
// Returns the beam's multiplier: 1 normally, a stutter as it dies, 0 while it is out.
const gardenDark = { next: 0, start: 0, until: 0, hb: null };
function gardenFlashlight(inGarden) {
  const g = gardenDark, now = performance.now();
  if (g.until) {
    if (inGarden && now < g.until) return now - g.start < 450 ? (Math.random() < 0.5 ? 0 : 0.3 + Math.random() * 0.7) : 0;
    endGardenDark();
    if (me.flash) audio.play('flashlight_click', { volume: 0.6 });
    return 1;
  }
  if (!inGarden) { g.next = 0; return 1; }
  if (!g.next) g.next = now + 8000 + Math.random() * 12000;
  if (now < g.next || !me.flash) return 1;
  g.start = now;
  g.until = now + 3000 + Math.random() * 2000;
  g.hb = audio.play('heartbeat', { loop: true, volume: 0.9, fadeIn: 0.3 });
  audio.play('flicker', { volume: 0.45, rate: 1.2 });
  caption('[Your flashlight dies. Your heart pounds.]', 3500);
  return 0.5;
}
function endGardenDark() {
  const g = gardenDark;
  g.hb?.stop(1.2);
  g.hb = null;
  g.until = 0;
  g.next = performance.now() + 15000 + Math.random() * 25000;
}

// ---------------------------------------------------------------------------- Footsteps

// One step each half bob cycle, so the sound lands with the camera's dip.
let stepPhase = 0;
function footstep(moving, jogging, outside) {
  const k = Math.floor(me.bob / Math.PI);
  if (!moving || k === stepPhase) return;
  stepPhase = k;
  const soft = outside ? 0.55 : 1; // grass muffles them
  audio.play('step', { volume: (jogging ? 0.5 : 0.3) * soft, rate: (outside ? 0.78 : 1) * (0.92 + Math.random() * 0.16) });
}

// ---------------------------------------------------------------------------- Interaction

const raycaster = new THREE.Raycaster();
raycaster.far = 2.4;

// Hold-to-use (crank, dig, pry): keep looking at it with Interact held.
let holding = null;
function updateHold(dt) {
  const ring = $('#hold-ring');
  if (holding && (!input.interactHeld || focus !== holding.it || !input.enabled)) holding = null;
  if (!holding) { ring.classList.remove('show'); return; }
  holding.t += dt * 1000;
  ring.classList.add('show');
  ring.style.setProperty('--p', `${Math.min(100, (holding.t / holding.ms) * 100)}%`);
  if (holding.t >= holding.ms) {
    const it = holding.it;
    holding = null;
    ring.classList.remove('show');
    it.use();
  }
}

function updateFocus() {
  camera.getWorldDirection(fwd);
  raycaster.set(camera.position, fwd);
  const active = interactables.filter((i) => i.mesh.visible && (!i.enabled || i.enabled()) && i.prompt() != null);
  const hit = raycaster.intersectObjects(active.map((i) => i.mesh), false)[0];
  let next = null;
  if (hit) {
    const it = active.find((i) => i.mesh === hit.object);
    if (!rayBlocked(camera.position, fwd, hit.distance, hit.point)) next = it;
  }
  focus = next;
  const p = $('#hud-prompt');
  if (focus && input.enabled) {
    p.innerHTML = `${isTouch ? '✋' : '<kbd>E</kbd>'} ${esc(focus.prompt())}`;
    p.classList.add('show');
  } else p.classList.remove('show');
  $('#crosshair').classList.toggle('active', !!focus);
  $('#t-interact').classList.toggle('ready', !!focus);
}

function useDoor(d) {
  if (d.locked) {
    caption(d.lockedText || 'It is locked.');
    audio.play('knock', { at: d.pos, scene, volume: 0.25, rate: 1.6 });
    return;
  }
  send('door:toggle', d.id);
}

function toggleFlashlight() {
  if (room?.settings.batteryDrain && me.battery <= 0) { caption('[The flashlight is dead. Find a spare battery.]'); return; }
  me.flash = !me.flash;
  audio.play('flashlight_click', { volume: 0.8 });
}

function setupBatteries(on) {
  for (const b of batteries.splice(0)) {
    scene.remove(b.mesh);
    const i = interactables.indexOf(b.it);
    if (i >= 0) interactables.splice(i, 1);
  }
  if (!on) return;
  const U = LEVEL.U, C = LEVEL.C;
  const spots = [[3.65, 0.86, 4.8], [-9, 0.79, -0.5], [9.5, 0.81, -0.85], [-11.2, U + 0.86, -6.25], [-13.6, U + 0.91, 1.35], [4.3, C + 2.21, -7]];
  const m = new THREE.MeshLambertMaterial({ color: 0xc9a227, emissive: 0x3a2a08 });
  for (const [x, y, z] of spots) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), m);
    mesh.position.set(x, y + 0.1, z);
    mesh.rotation.z = Math.PI / 2;
    scene.add(mesh);
    const it = {
      mesh,
      prompt: () => 'Pick up battery',
      use: () => {
        me.battery = 1;
        mesh.visible = false;
        audio.play('paper_pickup', { volume: 0.5, rate: 1.6 });
        caption('[Fresh battery]');
      },
    };
    interactables.push(it);
    batteries.push({ mesh, it });
  }
}

// ---------------------------------------------------------------------------- HUD

let areaTimer = null;
function showArea(id) {
  const el = $('#hud-area');
  el.textContent = AREAS[id]?.name || '';
  el.classList.add('show');
  clearTimeout(areaTimer);
  areaTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function caption(text, ms = 3500) {
  const box = $('#hud-captions');
  const d = document.createElement('div');
  d.textContent = text;
  box.append(d);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => d.remove(), ms);
}

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateHud(jogging) {
  const t = room?.timer;
  const el = $('#hud-timer');
  if (t && !t.untimed && t.left != null) {
    const left = t.paused ? t.left : Math.max(0, t.left - (performance.now() - timerAt));
    el.textContent = fmt(left);
    el.classList.toggle('low', left < 120000);
    el.classList.toggle('paused', !!t.paused);
  } else el.textContent = '';
  const st = $('#bar-stamina');
  st.classList.toggle('show', jogging || me.stamina < STAMINA - 0.05);
  st.querySelector('i').style.width = `${(me.stamina / STAMINA) * 100}%`;
  if (room?.settings.batteryDrain) {
    const b = $('#bar-battery');
    b.querySelector('i').style.width = `${me.battery * 100}%`;
    b.classList.toggle('low', me.battery < 0.2);
  }
}

// ---------------------------------------------------------------------------- Chat

export function chatLine(msg, logEl) {
  const d = document.createElement('div');
  if (msg.system) { d.className = 'sys'; d.textContent = msg.text; } else {
    d.innerHTML = `<b style="color:${esc(msg.color)}">${esc(msg.from)}:</b> ${esc(msg.text)}`;
  }
  logEl.append(d);
  while (logEl.children.length > 40) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
  if (logEl.id === 'game-chat-log') setTimeout(() => d.classList.add('old'), 9000);
}

function openChat() {
  chatOpen = true;
  input.enabled = false;
  $('#hud-chat').classList.add('open');
  $('#game-chat-form').classList.remove('hidden');
  setTimeout(() => $('#game-chat-input').focus(), 0);
}

function closeChat() {
  if (!chatOpen) return;
  chatOpen = false;
  $('#game-chat-input').value = '';
  $('#game-chat-form').classList.add('hidden');
  $('#hud-chat').classList.remove('open');
  $('#game-chat-input').blur();
  if (running && !modalOpen()) {
    input.enabled = true;
    if (!isTouch && !document.pointerLockElement) $('#click-to-play').classList.remove('hidden');
  }
}

// ---------------------------------------------------------------------------- Pings

function toggleWheel(force) {
  wheelOpen = force ?? !wheelOpen;
  $('#ping-wheel').classList.toggle('hidden', !wheelOpen);
}

function placePing(kind) {
  toggleWheel(false);
  camera.getWorldDirection(fwd);
  const rc = new THREE.Raycaster(camera.position, fwd, 0.1, 30);
  const hit = rc.intersectObjects(staticMeshes, false)[0];
  const p = hit ? hit.point.addScaledVector(fwd, -0.15) : camera.position.clone().addScaledVector(fwd, 5);
  send('ping:place', { kind, x: p.x, y: p.y, z: p.z });
}

function onPing({ kind, x, y, z, from, color, area }) {
  if (!running) return;
  const tex = label(`${from}: ${PINGS[kind]}`, color, 40);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(0.3 * tex.userData.aspect, 0.3, 1);
  sprite.position.set(x, y + 0.45, z);
  sprite.renderOrder = 11;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
  dot.position.set(x, y, z);
  dot.renderOrder = 11;
  const obj = new THREE.Group();
  obj.add(sprite, dot);
  scene.add(obj);
  pingMarkers.push({ obj, life: 10, mats: [sprite.material, dot.material] });
  chatLine({ system: true, text: `${from}: ${PINGS[kind]} (${AREAS[area]?.name || '?'})` }, $('#game-chat-log'));
}

function updatePings(dt) {
  for (let i = pingMarkers.length - 1; i >= 0; i--) {
    const p = pingMarkers[i];
    p.life -= dt;
    const a = Math.min(1, p.life / 2);
    for (const m of p.mats) m.opacity = a;
    p.obj.children[1].scale.setScalar(1 + Math.sin(p.life * 6) * 0.25);
    if (p.life <= 0) { scene.remove(p.obj); pingMarkers.splice(i, 1); }
  }
}

// ---------------------------------------------------------------------------- Journal and pause

// ---------------------------------------------------------------------------- Notes

function updateNoteCount() {
  const n = foundList().length;
  $('#hud-notes').textContent = `Notes ${n}/${NOTES.length}`;
}

function noteHTML(n, found) {
  const by = found ? `<p class="note-by">Found by <b style="color:${esc(found.color)}">${esc(found.by)}</b></p>` : '';
  return `<div class="note-paper"><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p></div>${by}`;
}

function readNote(id) {
  const entry = notes.get(id);
  const n = noteById(id);
  if (!entry || !n) return;
  audio.play('paper_pickup', { volume: 0.7 });
  if (!entry.found) send('note:find', id);
  input.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
  openModal(noteHTML(n, entry.found), { onClose: resumeInput });
}

function onNoteFound({ id, by, byId, color, at }) {
  markFound(id, { by, byId, color, at });
  updateNoteCount();
  const n = noteById(id);
  if (!running || !n) return;
  const mine = byId === selfId;
  caption(mine ? `[You found a note: ${n.title}]` : `[${by} found a note: ${n.title}]`, 4500);
  chatLine({ system: true, text: `${mine ? 'You' : by} found a note: ${n.title}. It is in everyone's journal.` }, $('#game-chat-log'));
  // If the finder is reading it right now, add the credit line.
  if (mine && modalOpen() && !$('#modal-body .note-by')) $('#modal-body').insertAdjacentHTML('beforeend', `<p class="note-by">Added to everyone's journal.</p>`);
  if (foundList().length === NOTES.length) caption('[Every note has been found. When the clock strikes, put them in order.]', 6000);
}

function openJournal() {
  input.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
  const list = foundList();
  const items = list.map((n) => `
    <details class="journal-item">
      <summary><span>${esc(n.title)}</span><small style="color:${esc(n.found.color)}">${esc(n.found.by)}</small></summary>
      <div class="note-paper"><p>${esc(n.text)}</p></div>
    </details>`).join('');
  openModal(`<h2>Journal</h2>
    <p class="muted">${list.length} of ${NOTES.length} notes found${list.length ? ', in the order your team found them' : ''}.</p>
    ${items || '<p class="muted">Nothing yet. Search the house: every note anyone finds appears here.</p>'}`, { onClose: resumeInput });
}

// A scribble the player looks at fills the screen for two seconds in a shaky hand.
let scribbleTimer = null;
function showScribble(def) {
  const el = $('#scribble-big');
  el.textContent = def.text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(scribbleTimer);
  scribbleTimer = setTimeout(() => el.classList.remove('show'), 2000);
  if (def.scare) {
    const hb = audio.play('heartbeat', { volume: 0.9 });
    setTimeout(() => hb.stop(0.8), 2500);
    audio.play('scratch', { volume: 0.5 });
    caption('[Your heart pounds]');
  }
}

function resumeInput() {
  if (!running) return;
  input.enabled = !chatOpen;
  if (!isTouch && !document.pointerLockElement) $('#click-to-play').classList.remove('hidden');
}

function openPause() {
  if (!running || modalOpen()) return;
  pausedAt = performance.now();
  input.enabled = false;
  toggleWheel(false);
  if (document.pointerLockElement) document.exitPointerLock();
  const body = openModal(`
    <h2>Paused</h2>
    <p class="muted small">The house does not wait: the game keeps running for everyone else.</p>
    <div class="menu-list">
      <button class="btn" id="p-resume">Resume</button>
    </div>
    <div id="pause-host"></div>
    <h3>Settings</h3>
    ${settingsHTML()}
    <h3>Controls</h3>
    <div class="tabs"><button data-tab="keys">Keyboard</button><button data-tab="touch">Touch</button></div>
    <div class="controls-table" id="pause-controls"></div>
    <div class="menu-list"><button class="btn ghost" id="p-leave">Leave the game</button></div>`, { onClose: resumeInput });
  body.querySelector('#p-resume').onclick = () => {
    closeModal();
    if (!isTouch) lockPointer($('#game-canvas'));
  };
  body.querySelector('#p-leave').onclick = () => { closeModal(); hooks.leave?.(); };
  wireSettings(body, () => toast('Graphics change applies after reloading the page.'));
  controlsTabs(body, body.querySelector('#pause-controls'));
  renderHostControls();
}

function renderHostControls() {
  const el = $('#pause-host');
  if (!el) return;
  if (!isHost) { el.innerHTML = ''; return; }
  const paused = room.timer?.paused;
  el.innerHTML = `
    <h3>Host controls</h3>
    <div class="menu-list">
      <button class="btn small" id="h-pause">${paused ? 'Resume the timer' : 'Pause the timer'}</button>
      <button class="btn small" id="h-add">Add 5 minutes</button>
      <button class="btn small" id="h-end">End the investigation now</button>
    </div>
    <h3>Players</h3>
    <ul class="player-list">${room.players.filter((p) => p.id !== selfId).map((p) => `
      <li><span class="dot" style="background:${esc(p.color)}"></span><span class="name ${p.connected ? '' : 'off'}">${esc(p.name)}</span>
      <button class="kick" data-kick="${esc(p.id)}">Remove</button></li>`).join('') || '<li class="muted">Nobody else is here.</li>'}</ul>`;
  el.querySelector('#h-pause').onclick = () => send('host:pause', !paused);
  el.querySelector('#h-add').onclick = () => send('host:addTime');
  el.querySelector('#h-end').onclick = () => { if (confirm('End the investigation for everyone and go to the evidence board?')) send('host:endInvestigation'); };
  for (const b of el.querySelectorAll('[data-kick]')) b.onclick = () => { if (confirm('Remove this player from the room?')) send('host:kick', b.dataset.kick); };
}
