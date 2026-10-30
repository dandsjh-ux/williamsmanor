// Client side of the horror director: plays the server's scares where the server says,
// so everyone hears the same knock from the same spot, and shows captions for them.

import * as THREE from 'three';
import { AREAS, anchors, setAreaLight, staticMeshes } from './house.js';
import { floorAt, rayBlocked } from './physics.js';
import { addScribble } from './clues.js';
import { send } from '../net.js';
import * as audio from '../audio.js';
import { prefs, isTouch } from '../prefs.js';

let H = {};          // { scene, camera, me, caption, flashOn, inOverlay }
const fx = [];       // light effects: { area ('*' = everywhere), until, kind: 'flicker' | 'cut' }
const lastMult = {};
let flickerVal = {}, flickerNext = 0;
let shadow = null, whisper = null;
let cellarWhisperAt = -Infinity; // the Cellar whispers as you come down, at most every 30 s

export function initDirector(hooks) {
  H = hooks;
  // Steven's silhouette (High intensity only)
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.92, fog: false });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.15, 4, 10), m);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), m);
  head.position.y = 1.72;
  g.add(body, head);
  g.visible = false;
  H.scene.add(g);
  shadow = { group: g, mat: m, life: 0, fading: false };
}

export function resetDirector() {
  fx.length = 0;
  for (const id of Object.keys(AREAS)) { setAreaLight(id, 1); lastMult[id] = 1; }
  if (shadow) shadow.group.visible = false;
  stopWhisper();
  cellarWhisperAt = -Infinity;
}

// ---------------------------------------------------------------------------- Captions

/** Where a sound is, in words, relative to the listener. */
function where(pos) {
  const cam = H.camera();
  const dy = pos.y - cam.y;
  if (dy > 2.2) return 'upstairs';
  if (dy < -2.6) return 'downstairs';
  const to = new THREE.Vector3(pos.x - cam.x, 0, pos.z - cam.z);
  if (to.length() < 1.2) return 'right beside you';
  to.normalize();
  const fwd = new THREE.Vector3();
  H.forward(fwd);
  fwd.y = 0; fwd.normalize();
  const dot = fwd.dot(to);
  if (dot < -0.5) return 'behind you';
  const crossY = fwd.x * to.z - fwd.z * to.x;
  if (dot < 0.5) return crossY > 0 ? 'to your right' : 'to your left';
  return 'nearby';
}

function cap(text) {
  if (prefs.captions) H.caption(text, 3500);
}

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ---------------------------------------------------------------------------- Events

export function onDirectorEvent(e) {
  const me = H.me();
  switch (e.type) {
    case 'flicker': {
      const until = performance.now() + e.dur * 1000;
      fx.push({ area: e.area, until, kind: 'flicker' });
      if (e.cut) fx.push({ area: e.area, from: until, until: until + 5000, kind: 'cut' });
      const a = AREAS[e.area];
      if (a?.lamp) audio.play('flicker', { at: v3(a.lamp), scene: H.scene, volume: 0.6, refDistance: 2 });
      if (me.area === e.area) {
        cap('[The lights flicker]');
        if (e.cut && !H.flashOn()) setTimeout(() => cap(`[The lights die. ${isTouch ? 'Tap 🔦' : 'Press F'} for your flashlight]`), e.dur * 1000);
      }
      break;
    }
    case 'knock':
      audio.play('knock', { at: v3(e.pos), scene: H.scene, volume: 1, refDistance: 3 });
      cap(`[Knocking, ${where(v3(e.pos))}]`);
      break;
    case 'footsteps':
      audio.play('footsteps', { at: v3(e.pos), scene: H.scene, volume: 0.9, refDistance: 3 });
      cap(e.behind ? '[Footsteps, behind you]' : `[Footsteps, ${where(v3(e.pos))}]`);
      break;
    case 'whisper':
      if (H.inOverlay()) break;
      startWhisper();
      cap('[Whispering, all around you]');
      break;
    case 'musicbox': {
      const at = anchors.musicBox;
      const h = audio.play('music_box', { at, scene: H.scene, volume: 0.9, refDistance: 2.5, offset: Math.random() * 10 });
      setTimeout(() => h.stop(2), 9000);
      cap(`[A music box plays, ${where(at)}]`);
      break;
    }
    case 'blackout':
      fx.push({ area: '*', until: performance.now() + e.dur * 1000, kind: 'cut' });
      audio.play('flicker', { volume: 0.7 });
      { const hb = audio.play('heartbeat', { volume: 0.7, fadeIn: 1 }); setTimeout(() => hb.stop(2), e.dur * 1000); }
      cap('[Every light in the house goes out]');
      if (!H.flashOn()) setTimeout(() => cap(`[${isTouch ? 'Tap 🔦' : 'Press F'} for your flashlight]`), 900);
      break;
    case 'powercut':
      fx.push({ area: '*', until: performance.now() + e.dur * 1000, kind: 'cut' });
      audio.play('flicker', { volume: 0.5, rate: 0.8 });
      cap('[The power cuts out]');
      break;
    case 'chime':
      audio.play('clock_chime', { at: anchors.clock, scene: H.scene, volume: 1, refDistance: 4 });
      cap(`[The grandfather clock chimes on its own, ${where(anchors.clock)}]`);
      break;
    case 'scribble':
      placeScribble(e.text);
      break;
    case 'shadow':
      if (!H.inOverlay()) showShadow();
      break;
    default: break;
  }
}

/** Sometimes the lamps stutter as you walk into a room (only you see it). The Cellar always whispers. */
export function enteredRoom(area) {
  if (area === 'cellar' && performance.now() - cellarWhisperAt > 30000 && !H.inOverlay()) {
    cellarWhisperAt = performance.now();
    startWhisper();
    cap('[Whispering in the dark below]');
  }
  if (!AREAS[area]?.lamp || Math.random() > 0.25) return;
  fx.push({ area, until: performance.now() + 500 + Math.random() * 700, kind: 'flicker' });
  audio.play('flicker', { at: v3(AREAS[area].lamp), scene: H.scene, volume: 0.35, refDistance: 2 });
}

export function onScribbleAdded(def, live = true) {
  const mesh = addScribble(H.scene, def);
  if (!mesh || !live) return;
  audio.play('scratch', { at: mesh.position.clone(), scene: H.scene, volume: 0.45, refDistance: 1.5 });
  const cam = H.camera();
  if (cam.distanceTo(mesh.position) < 12) cap(`[Faint scratching, ${where(mesh.position)}]`);
}

// The client the director picked finds a wall behind its player and writes there.
function placeScribble(text) {
  const cam = H.camera(), me = H.me();
  const fwd = new THREE.Vector3();
  H.forward(fwd);
  fwd.y = 0; fwd.normalize();
  const tries = [fwd.clone().negate(), new THREE.Vector3(fwd.z, 0, -fwd.x), new THREE.Vector3(-fwd.z, 0, fwd.x)];
  const rc = new THREE.Raycaster();
  rc.far = 7;
  for (const dir of tries) {
    rc.set(cam, dir);
    const hit = rc.intersectObjects(staticMeshes, false)[0];
    if (!hit?.face || hit.distance < 1) continue;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (Math.abs(n.y) > 0.3) continue;
    const face = Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? '+x' : '-x') : (n.z > 0 ? '+z' : '-z');
    const p = hit.point.addScaledVector(n, 0.03);
    send('director:place', { text, pos: [p.x, me.y + 1.5, p.z], face, area: me.area });
    return;
  }
}

// ---------------------------------------------------------------------------- Whisper that circles the listener

function startWhisper() {
  stopWhisper();
  const holder = new THREE.Object3D();
  H.scene.add(holder);
  const h = audio.play('whisper', { at: holder, volume: 0.9, refDistance: 1, fadeIn: 1 });
  whisper = { holder, h, t: 0, life: 9 };
}

function stopWhisper() {
  if (!whisper) return;
  whisper.h.stop(1);
  const holder = whisper.holder;
  setTimeout(() => H.scene.remove(holder), 1200);
  whisper = null;
}

// ---------------------------------------------------------------------------- Shadow figure

function showShadow() {
  const cam = H.camera(), me = H.me();
  const fwd = new THREE.Vector3();
  H.forward(fwd);
  fwd.y = 0; fwd.normalize();
  for (let d = 9; d >= 5; d -= 1) {
    const x = me.x + fwd.x * d, z = me.z + fwd.z * d;
    if (Math.abs(floorAt(x, z, me.y + 0.3) - me.y) > 0.3) continue;
    const target = new THREE.Vector3(x, me.y + 1.5, z);
    const dir = target.clone().sub(cam);
    const len = dir.length();
    if (rayBlocked(cam, dir.normalize(), len, null)) continue;
    shadow.group.position.set(x, me.y, z);
    shadow.group.lookAt(me.x, me.y, me.z);
    shadow.group.visible = true;
    shadow.mat.opacity = 0.92;
    shadow.life = 3;
    shadow.fading = false;
    return;
  }
}

// ---------------------------------------------------------------------------- Per frame

export function updateDirector(dt) {
  const now = performance.now();
  for (let i = fx.length - 1; i >= 0; i--) if (now > fx[i].until) fx.splice(i, 1);

  if (now > flickerNext) {
    flickerNext = now + 60 + Math.random() * 90;
    flickerVal = {};
  }
  for (const id of Object.keys(AREAS)) {
    let m = 1;
    for (const f of fx) {
      if (f.area !== '*' && f.area !== id) continue;
      if (f.from && now < f.from) continue;
      if (f.kind === 'cut') m = 0;
      else m = Math.min(m, (flickerVal[id] ??= Math.random() < 0.45 ? 0.05 : 0.4 + Math.random() * 0.6));
    }
    if (lastMult[id] !== m) { lastMult[id] = m; setAreaLight(id, m); }
  }

  if (whisper) {
    whisper.t += dt;
    const cam = H.camera();
    whisper.holder.position.set(cam.x + Math.cos(whisper.t * 1.3) * 1.4, cam.y, cam.z + Math.sin(whisper.t * 1.3) * 1.4);
    if (whisper.t > whisper.life) stopWhisper();
  }

  if (shadow?.group.visible) {
    shadow.life -= dt;
    const cam = H.camera();
    const to = shadow.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)).sub(cam);
    const dist = to.length();
    const fwd = new THREE.Vector3();
    H.forward(fwd);
    const lit = H.flashOn() && fwd.dot(to.normalize()) > Math.cos(0.45);
    if (lit || dist < 4 || shadow.life <= 0) shadow.fading = true;
    if (shadow.fading) {
      shadow.mat.opacity -= dt * (lit ? 6 : 2);
      if (shadow.mat.opacity <= 0) shadow.group.visible = false;
    }
  }
}
