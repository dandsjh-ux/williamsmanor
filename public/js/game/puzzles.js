// The eight note puzzles plus the Study lock and the fogged mirror: their props in the
// house, the 2D overlays they open, and how the house changes once each is solved.
// The server owns every puzzle's state; this file only shows it and sends actions.

import * as THREE from 'three';
import { LEVEL, AREAS, anchors, interactables, mat, followArea, setAreaLight, areaLight, doorById } from './house.js';
import { setNoteVisible, setNotePos, setScribbleVisible } from './clues.js';
import { call } from '../net.js';
import * as audio from '../audio.js';
import { esc, openModal, closeModal } from '../ui.js';

const U = LEVEL.U;
let H = {};            // hooks from the game: caption, scene, camera, me, flashOn, overlayOpened, overlayClosed
let P = {};            // puzzle state from the server
let openId = null;     // which puzzle overlay is open
const anim = [];       // small tweens: { obj, prop, to, speed }

const NOTE_OF = { portrait: 5, dumbwaiter: 6, fuse: 7, floorboard: 8, eyes: 9, clock: 10, cellarKey: 11, roseDig: 12 };

// Puzzles that sit in each room, for the whispered hints when a player is stuck.
const ROOM_PUZZLES = {
  drawing: ['portrait'], kitchen: ['dumbwaiter', 'cellarKey'], dining: ['dumbwaiter'], cellar: ['fuse'], conservatory: ['fuse'],
  bird: ['floorboard'], hall: ['eyes'], foyer: ['clock'], staircase: ['clock'], garden: ['roseDig'], study: ['studyLock'], bathroom: ['mirror'],
};
const HINTS = {
  portrait: ['Father watches over the fireplace… and he is hiding something.', 'Look closely at his portrait. A corner of paper pokes out of the canvas.'],
  dumbwaiter: ['The little lift between the Kitchen and the Dining Room still works.', 'Crank it up, set the latch, then run to the Dining Room hatch. Two can do it faster.'],
  fuse: ['The Conservatory has no power. The fuse box is in the Cellar.', 'Turn the wire pieces until power runs from the MAINS to the CONSERVATORY terminal.'],
  floorboard: ['She hid something under the floor, near the bed.', 'Walk slowly over the boards. Listen for one that sounds hollow.'],
  eyes: ['One of the old photographs is watching you.', 'Shine your light on each face in the Portrait Hall. Whose eyes follow you?'],
  clock: ["Father's clock knows the way down.", 'Twelve, twelve, twelve. Set both hands to midnight.'],
  cellarKey: ['The Cellar is locked. Someone keeps the key close to the stove.', 'Search the Kitchen drawers.'],
  roseDig: ['White for her, red for the rest.', 'Find the one white rose bush and dig.'],
  studyLock: ['A number opens the brass lock. Someone was counting.', 'How many times did he say sorry?'],
  mirror: ['The bathroom mirror is fogged up. Wipe it.'],
};

// ---------------------------------------------------------------------------- Helpers

function act(id, action, data) {
  return call('puzzle:action', { id, action, data }).then((r) => {
    if (r?.msg) H.caption(r.msg, 4000);
    return r;
  });
}

function add(it) {
  interactables.push(it);
  return it;
}

function box(w, h, d, material, pos) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(...pos);
  m.castShadow = true;
  H.scene.add(m);
  return m;
}

function proxy(center, size) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  m.position.set(...center);
  H.scene.add(m);
  return m;
}

function tween(obj, prop, to, speed = 3) {
  anim.push({ obj, prop, to, speed });
}

function overlay(id, html, onRender) {
  openId = id;
  H.overlayOpened();
  const body = openModal(`<div class="puzzle">${html}</div>`, { onClose: () => { openId = null; H.overlayClosed(); } });
  onRender?.(body);
  return body;
}

const solved = (id) => !!P[id]?.solved;

// ---------------------------------------------------------------------------- Build

const props = {};

export function buildPuzzles(hooks) {
  H = hooks;
  const scene = H.scene;

  // 1. Father's portrait: spot the paper hidden in the canvas; the note is behind the frame.
  const father = anchors.portraits.father;
  props.father = father;
  add({ mesh: father, prompt: () => (solved('portrait') ? null : "Examine Father's portrait"), use: openPortrait });

  // 2. Dumbwaiter: crank and latch in the Kitchen, hatch in the Dining Room.
  const metal = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  followArea('kitchen', metal, 0.6);
  const crank = new THREE.Group();
  crank.position.set(12.05, 1.3, 1.82);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 16), metal);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12), metal);
  handle.position.set(0.12, 0, -0.06);
  handle.rotation.x = Math.PI / 2;
  crank.add(wheel, handle);
  scene.add(crank);
  props.crank = crank;
  add({
    mesh: proxy([12.05, 1.3, 1.8], [0.4, 0.4, 0.3]),
    holdMs: () => (P.dumbwaiter?.raised ? 0 : 2500),
    prompt: () => {
      const s = P.dumbwaiter;
      if (!s || s.solved) return null;
      if (!s.raised) return 'Turn the crank (hold)';
      if (!(s.latchLeft > 0)) return 'Set the latch';
      return null;
    },
    use: () => {
      const s = P.dumbwaiter;
      if (!s.raised) { audio.play('knock', { at: crank, volume: 0.6, rate: 0.7 }); act('dumbwaiter', 'raise'); } else act('dumbwaiter', 'latch').then(() => audio.play('lock_open', { at: crank, volume: 0.6 }));
    },
  });
  add({
    mesh: proxy([11, 1.35, 2.25], [1.2, 0.9, 0.2]),
    prompt: () => (solved('dumbwaiter') ? null : 'Open the hatch'),
    use: () => act('dumbwaiter', 'hatch'),
  });

  // 3. Fuse box in the Cellar
  add({ mesh: proxy([13.75, LEVEL.C + 1.6, -7.6], [0.3, 0.9, 0.9]), prompt: () => (solved('fuse') ? null : 'Open the fuse box'), use: openFuse });

  // 4. Floorboards in the Bird Room: one sounds hollow.
  props.boards = [];
  const plank = mat('bird', 'floor');
  for (let i = 0; i < 6; i++) {
    const x = 10.3 + i * 0.26;
    const b = box(0.25, 0.014, 1.8, plank, [x, U + 0.007, -4.7]);
    b.castShadow = false;
    props.boards.push(b);
    add({
      mesh: b,
      holdMs: () => 1500,
      enabled: () => !solved('floorboard') && heardHollow.has(i),
      prompt: () => 'Pry up the loose board (hold)',
      use: () => act('floorboard', 'pry', { i }),
    });
  }

  // 5. The watching portrait: on one of the two photographs, the eyes follow your light.
  props.eyes = [];
  anchors.portraits.hall.forEach((p, i) => {
    const e = { portrait: p, home: p.position.clone(), patches: [], look: new THREE.Vector2(), drawn: new THREE.Vector2() };
    props.eyes.push(e);
    p.material.map.userData.ready.then((map) => buildEyePatches(e, map, anchors.portraits.hallEyes[i]));
    add({
      mesh: p,
      prompt: () => (solved('eyes') ? null : 'Examine the portrait'),
      use: () => act('eyes', 'open', { i }),
    });
  });

  // 6. The grandfather clock: a face showing the shared hands, and a stair tread that opens.
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = faceCanvas.height = 128;
  props.clockCanvas = faceCanvas;
  props.clockTex = new THREE.CanvasTexture(faceCanvas);
  props.clockTex.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshLambertMaterial({ map: props.clockTex, emissive: 0xffd9a8, emissiveMap: props.clockTex, transparent: true });
  followArea('foyer', faceMat, 1.2);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), faceMat);
  face.position.copy(anchors.clock).add(new THREE.Vector3(0.025, 0.1, 0));
  face.rotation.y = Math.PI / 2;
  scene.add(face);
  add({ mesh: face, prompt: () => (solved('clock') ? null : 'Look at the clock'), use: openClock });
  const tread = mat('staircase', 'floor');
  props.lid = box(0.62, 0.025, 0.42, tread, [0.6, 1.47, -2.35]);

  // 7. Six Kitchen drawers; one holds the cellar key.
  props.drawers = [];
  const front = mat('kitchen', 'wood');
  const keyMat = new THREE.MeshLambertMaterial({ color: 0x5a4a30, emissive: 0x2a2010 });
  for (let i = 0; i < 6; i++) {
    const d = box(0.6, 0.24, 0.05, front, [8.35 + i * 0.66, 0.62, 1.375]);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), keyMat);
    knob.position.set(0, 0, -0.035);
    d.add(knob);
    props.drawers.push(d);
    add({
      mesh: d,
      prompt: () => (P.cellarKey?.opened.includes(i) ? null : 'Open the drawer'),
      use: () => { audio.play('knock', { at: d, volume: 0.3, rate: 1.5 }); act('cellarKey', 'drawer', { i }); },
    });
  }
  props.key = box(0.16, 0.02, 0.05, keyMat, [0, 0, 0]);
  props.key.visible = false;

  // 8. Rose bushes: dig at the white one.
  props.mounds = [];
  const soil = new THREE.MeshLambertMaterial({ color: 0x2a1c12 });
  followArea('garden', soil, 1);
  anchors.roseBushes.forEach((b, i) => {
    add({
      mesh: proxy([b.x, 0.5, b.z], [1.1, 1.0, 1.1]),
      holdMs: () => 3000,
      prompt: () => (solved('roseDig') || P.roseDig?.dug.includes(i) ? null : 'Dig here (hold)'),
      use: () => act('roseDig', 'dig', { i }),
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.08, 10), soil);
    m.position.set(b.x, 0.04, b.z + 0.65);
    m.visible = false;
    scene.add(m);
    props.mounds.push(m);
  });
  props.tin = anchors.tinBox;

  // 9. The brass lock and Steven's ledger on the Study desk
  const brass = new THREE.MeshLambertMaterial({ color: 0xb08a3a, emissive: 0x2a1e08 });
  followArea('study', brass, 0.5);
  props.lockbox = box(0.3, 0.12, 0.22, brass, [anchors.studyDesk.x - 0.4, anchors.studyDesk.y + 0.06, anchors.studyDesk.z]);
  const ledgerMat = new THREE.MeshLambertMaterial({ color: 0x3a1a12 });
  followArea('study', ledgerMat, 0.6);
  props.ledger = box(0.26, 0.04, 0.34, ledgerMat, [anchors.studyDesk.x + 0.35, anchors.studyDesk.y + 0.02, anchors.studyDesk.z]);
  add({ mesh: props.lockbox, prompt: () => (solved('studyLock') ? null : 'Try the brass lock'), use: openLock });
  add({ mesh: props.ledger, prompt: () => (solved('studyLock') ? "Read Steven's ledger" : 'A ledger, locked in a brass clasp'), use: () => (solved('studyLock') ? openLedger() : openLock()) });

  // 10. The fogged bathroom mirror
  props.fogMat = new THREE.MeshLambertMaterial({ color: 0x9aa3a6, emissive: 0x3a4044, transparent: true, opacity: 0.85 });
  followArea('bathroom', props.fogMat, 0.4);
  props.fog = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), props.fogMat);
  props.fog.position.set(-8.6, U + 1.6, 9.84);
  props.fog.rotation.y = Math.PI;
  scene.add(props.fog);
  add({ mesh: props.fog, prompt: () => (solved('mirror') ? null : 'Wipe the mirror'), use: openMirror });
}

// ---------------------------------------------------------------------------- State -> house

export function syncPuzzles(all = {}) {
  P = JSON.parse(JSON.stringify(all));
  if (P.dumbwaiter) P.dumbwaiter.latchAt = performance.now();
  applyAll(false);
  if (openId && openId !== 'clock') rerender(openId); // the clock keeps the hands the player is dragging
}

export function onPuzzleState(id, state) {
  P[id] = state;
  if (id === 'dumbwaiter') P.dumbwaiter.latchAt = performance.now();
  apply(id, true);
  if (openId === id) rerender(id);
  stuck.progress(id);
}

export function onPuzzleSolved({ id, by, byId }) {
  if (P[id]) P[id].solved = true;
  apply(id, true);
  const mine = byId === H.selfId();
  const names = { portrait: "Father's portrait", dumbwaiter: 'the dumbwaiter', fuse: 'the fuse box', floorboard: 'the loose floorboard', eyes: 'the watching portrait', clock: 'the grandfather clock', cellarKey: 'the cellar key', roseDig: 'the white rose', studyLock: 'the brass lock', mirror: 'the mirror' };
  H.caption(`[${mine ? 'You' : by} solved ${names[id]}]`, 4000);
  if (openId === id) setTimeout(() => openId === id && closeModal(), id === 'portrait' || id === 'fuse' ? 2500 : 1200);
  if (id === 'fuse') {
    H.caption('[The fuse box hums. Power runs up through the walls to the Conservatory.]', 5000);
    audio.play('flicker', { volume: 0.5, rate: 0.9 });
  }
  if (id === 'clock') audio.play('clock_chime', { at: anchors.clock, scene: H.scene, volume: 1, refDistance: 3 });
  else if (id !== 'mirror') audio.play('lock_open', { volume: 0.7 });
}

function applyAll(live) {
  for (const id of Object.keys(P)) apply(id, live);
}

function apply(id, live) {
  const s = P[id];
  if (!s) return;
  const note = NOTE_OF[id];
  if (note && note !== 11) setNoteVisible(note, s.solved);
  switch (id) {
    case 'portrait': {
      const p = props.father;
      const z = anchors.fatherPortrait.z + (s.solved ? 1.15 : 0);
      if (live) tween(p.position, 'z', z); else p.position.z = z;
      p.rotation.z = s.solved ? 0.08 : 0;
      break;
    }
    case 'fuse':
      AREAS.conservatory.powered = s.solved;
      setAreaLight('conservatory', areaLight.conservatory ?? 1);
      break;
    case 'floorboard': {
      const b = props.boards[s.which];
      setNotePos(8, [b.position.x, U + 0.016, -4.7], 'up');
      if (s.solved) { b.rotation.z = 1.2; b.position.y = U + 0.13; b.position.x = 10.3 + s.which * 0.26 + 0.12; }
      break;
    }
    case 'eyes': {
      const e = props.eyes[s.which];
      if (!e) break;
      setNotePos(9, [e.home.x, e.home.y, -9.885], '+z');
      if (s.solved) {
        const p = e.portrait;
        if (live) { tween(p.position, 'x', e.home.x + 0.75); tween(p.rotation, 'y', 0.9); } else { p.position.x = e.home.x + 0.75; p.rotation.y = 0.9; }
        p.position.z = e.home.z + 0.3;
        e.look.set(0, 0);
        for (const pt of e.patches) drawEye(pt, 0, 0);
      }
      break;
    }
    case 'clock':
      drawClockFace();
      if (s.solved) { if (live) tween(props.lid.rotation, 'x', -1.4); else props.lid.rotation.x = -1.4; props.lid.position.z = -2.55; props.lid.position.y = 1.62; }
      break;
    case 'cellarKey':
      s.opened.forEach((i) => { const d = props.drawers[i]; if (live) tween(d.position, 'z', 1.375 - 0.3); else d.position.z = 1.375 - 0.3; });
      if (s.solved) {
        const d = props.drawers[s.which];
        props.key.visible = true;
        d.add(props.key);
        props.key.position.set(0, 0.13, 0.1);
      }
      if (doorById('cellar')) doorById('cellar').locked = !s.solved;
      break;
    case 'roseDig':
      s.dug.forEach((i) => { props.mounds[i].visible = true; });
      if (props.tin) props.tin.visible = s.solved;
      if (s.solved) props.mounds[7].visible = true;
      break;
    case 'mirror':
      props.fog.visible = !s.solved;
      setScribbleVisible('mirror', s.solved);
      break;
    default: break;
  }
}

// ---------------------------------------------------------------------------- The watching portrait

const WARM = new THREE.Color(1, 0.82, 0.6);

// Small patches cut from the photograph and laid over each eye. At rest they match the
// photo exactly; on the watching portrait the iris inside is redrawn shifted toward you.
function buildEyePatches(e, map, eyes) {
  const src = map.userData.canvas;
  const { width: PW, height: PH } = e.portrait.geometry.parameters;
  for (const eye of eyes) {
    const [cx, cy, k] = map.userData.toCanvas(eye.x, eye.y);
    const rx = eye.rx * k, ry = eye.ry * k, ri = eye.ri * k;
    const pw = Math.ceil(rx * 2.6), ph = Math.ceil(ry * 3.4);
    const x0 = Math.round(cx - pw / 2), y0 = Math.round(cy - ph / 2);
    const c = document.createElement('canvas');
    c.width = pw; c.height = ph;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, x0, y0, pw, ph, 0, 0, pw, ph);
    // The white of the eye: the brightest third of the pixels in the opening, around the iris
    const px = ctx.getImageData(0, 0, pw, ph).data, lum = [];
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const ex = (x - (cx - x0)) / rx, ey = (y - (cy - y0)) / ry, d = Math.hypot(x - (cx - x0), y - (cy - y0));
        if (ex * ex + ey * ey > 1 || d < ri) continue;
        const i = (y * pw + x) * 4;
        lum.push([px[i] + px[i + 1] + px[i + 2], px[i], px[i + 1], px[i + 2]]);
      }
    }
    lum.sort((a, b) => b[0] - a[0]);
    const top = lum.slice(0, Math.max(1, Math.floor(lum.length / 3)));
    const avg = [1, 2, 3].map((j) => Math.round(top.reduce((s, v) => s + v[j], 0) / top.length));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.MeshLambertMaterial({ map: tex, emissive: WARM.clone(), emissiveMap: tex, polygonOffset: true, polygonOffsetFactor: -2 });
    followArea('hall', m, 1.05);
    const patch = new THREE.Mesh(new THREE.PlaneGeometry((pw / src.width) * PW, (ph / src.height) * PH), m);
    patch.position.set(((x0 + pw / 2) / src.width - 0.5) * PW, (0.5 - (y0 + ph / 2) / src.height) * PH, 0.002);
    e.portrait.add(patch);
    e.patches.push({ ctx, tex, src, x0, y0, pw, ph, cx: cx - x0, cy: cy - y0, rx, ry, ri, white: `rgb(${avg.join(',')})` });
  }
}

function drawEye(pt, dx, dy) {
  const { ctx, src, x0, y0, pw, ph, cx, cy, rx, ry, ri } = pt;
  ctx.drawImage(src, x0, y0, pw, ph, 0, 0, pw, ph);
  if (Math.abs(dx) + Math.abs(dy) > 0.05) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ri * 1.2);
    g.addColorStop(0, pt.white); g.addColorStop(0.75, pt.white); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - ri * 1.3, cy - ri * 1.3, ri * 2.6, ri * 2.6);
    ctx.beginPath(); ctx.arc(cx + dx, cy + dy, ri, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(src, x0, y0, pw, ph, dx, dy, pw, ph);
    ctx.restore();
  }
  pt.tex.needsUpdate = true;
}

// ---------------------------------------------------------------------------- Per frame

const heardHollow = new Set();
let lastBoard = -1;
const tmp = new THREE.Vector3();
let dust = null;

const stuck = {
  area: null, t: 0, hint: {},
  progress(id) { if (ROOM_PUZZLES[this.area]?.includes(id)) this.t = 0; },
};

export function resetLocal() {
  heardHollow.clear();
  lastBoard = -1;
  stuck.area = null; stuck.t = 0; stuck.hint = {};
}

export function updatePuzzles(dt, { me, cam, fwd, flashOn, hints }) {
  for (let i = anim.length - 1; i >= 0; i--) {
    const a = anim[i];
    a.obj[a.prop] += (a.to - a.obj[a.prop]) * Math.min(1, dt * a.speed);
    if (Math.abs(a.to - a.obj[a.prop]) < 0.002) { a.obj[a.prop] = a.to; anim.splice(i, 1); }
  }

  // The crank spins while the dumbwaiter is going up.
  if (P.dumbwaiter?.raised && !P.dumbwaiter.solved) props.crank.rotation.z += dt * 0.5;

  // Dumbwaiter latch countdown for whoever is watching it
  const dw = P.dumbwaiter;
  if (dw && dw.latchLeft > 0 && !dw.solved) {
    const left = dw.latchLeft - (performance.now() - (dw.latchAt || 0));
    const sec = Math.ceil(left / 1000);
    if (sec > 0 && sec !== dw.shown && (me.area === 'kitchen' || me.area === 'dining' || me.area === 'foyer')) { dw.shown = sec; if (sec <= 10 && sec % 2 === 0) H.caption(`[The latch creaks… ${sec}]`, 1200); }
  }

  // Bird Room floorboards: one knocks hollow underfoot.
  const fb = P.floorboard;
  if (fb && me.area === 'bird' && !fb.solved) {
    let on = -1;
    props.boards.forEach((b, i) => { if (Math.abs(me.x - b.position.x) < 0.13 && Math.abs(me.z - b.position.z) < 0.9) on = i; });
    if (on !== lastBoard && on >= 0) {
      if (on === fb.which) {
        audio.play('knock', { at: props.boards[on], volume: 0.9, rate: 0.55 });
        heardHollow.add(on);
        H.caption('[A hollow knock underfoot]', 3000);
        puffDust(props.boards[on].position);
      }
    }
    lastBoard = on;
  } else lastBoard = -1;
  if (dust) {
    dust.life -= dt;
    dust.points.position.y += dt * 0.15;
    dust.points.material.opacity = Math.max(0, dust.life / 1.5) * 0.7;
    if (dust.life <= 0) { H.scene.remove(dust.points); dust = null; }
  }

  // Eyes follow you, but only on the right portrait and only in your light.
  const ey = P.eyes;
  const e = ey && !ey.solved ? props.eyes[ey.which] : null;
  if (e?.patches.length) {
    tmp.subVectors(e.portrait.position, cam).normalize();
    const lit = flashOn && fwd.dot(tmp) > Math.cos(0.45) && cam.distanceTo(e.portrait.position) < 9;
    const local = e.portrait.worldToLocal(tmp.copy(cam));
    const tx = lit ? THREE.MathUtils.clamp(local.x / Math.max(0.8, local.z), -1, 1) : 0;
    const ty = lit ? THREE.MathUtils.clamp(-local.y / Math.max(0.8, local.z), -1, 1) : 0;
    e.look.x += (tx - e.look.x) * Math.min(1, dt * 5);
    e.look.y += (ty - e.look.y) * Math.min(1, dt * 5);
    if (Math.abs(e.look.x - e.drawn.x) + Math.abs(e.look.y - e.drawn.y) > 0.015) {
      e.drawn.copy(e.look);
      for (const pt of e.patches) drawEye(pt, e.look.x * pt.ri * 1.3, e.look.y * pt.ri * 0.45);
    }
  }

  // Whispered hints after three minutes stuck in a room with an unsolved puzzle.
  if (stuck.area !== me.area) { stuck.area = me.area; stuck.t = 0; }
  const here = (ROOM_PUZZLES[me.area] || []).filter((id) => P[id] && !P[id].solved);
  if (hints && here.length) {
    stuck.t += dt;
    if (stuck.t > 180) {
      stuck.t = 0;
      const id = here[0];
      const n = stuck.hint[id] || 0;
      const text = HINTS[id][Math.min(n, HINTS[id].length - 1)];
      stuck.hint[id] = n + 1;
      audio.play('whisper', { volume: 0.25 });
      H.caption(`[A whisper] “${text}”`, 7000);
    }
  }
}

function puffDust(pos) {
  const g = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push(pos.x + (Math.random() - 0.5) * 0.3, pos.y + Math.random() * 0.3, pos.z + (Math.random() - 0.5) * 1.5);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfae90, size: 0.03, transparent: true, opacity: 0.7, depthWrite: false }));
  H.scene.add(points);
  if (dust) H.scene.remove(dust.points);
  dust = { points, life: 1.5 };
}

// ---------------------------------------------------------------------------- Overlays

function rerender(id) {
  ({ fuse: renderFuse, clock: renderClock })[id]?.();
}

// Father's portrait: sweep a pool of light over it and click the paper hidden in the canvas.
function openPortrait() {
  const [sx, sy] = P.portrait.spot;
  overlay('portrait', `<h2>Father's portrait</h2><p class="muted">Something about this painting is not right. Look closely, and click where it hides something.</p>
    <div class="spot-pic" id="pz-spot">
      <svg class="spot-clue" style="left:${sx * 100}%;top:${sy * 100}%" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M6 30 L33 12" class="slit"/><path d="M14 25 L30 14 L27 24 Z" class="paper"/><path d="M19 22 l5 -3 M20 24 l4 -2" class="ink"/>
      </svg>
      <div class="spot-dark"></div>
    </div><p class="fuse-status" id="pz-spot-msg"></p>`, (body) => {
    const el = body.querySelector('#pz-spot');
    const at = (e) => {
      const r = el.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    };
    const light = (e) => {
      const [x, y] = at(e);
      el.style.setProperty('--lx', `${x * 100}%`);
      el.style.setProperty('--ly', `${y * 100}%`);
    };
    el.addEventListener('pointermove', light);
    el.addEventListener('pointerdown', (e) => {
      light(e);
      const [x, y] = at(e);
      act('portrait', 'search', { x: +x.toFixed(3), y: +y.toFixed(3) }).then((r) => {
        if (r?.solved) { el.classList.add('found'); audio.play('paper_pickup', { volume: 0.6 }); }
        body.querySelector('#pz-spot-msg').textContent = r?.solved ? 'A folded page, slipped through a cut in the canvas. Something is behind the frame.' : r?.msg || '';
      });
    });
  });
}

// Fuse box
const BASE = { I: 10, L: 3, T: 11 };
const rotMask = (m, r) => { for (let i = 0; i < r; i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
// Power enters tile 4 (second row) from the left and must leave tile 11 (third row) to the right.
const FUSE_IN = 4, FUSE_OUT = 11;
function poweredSet(types, rot) {
  const mask = (i) => rotMask(BASE[types[i]], rot[i]);
  const on = new Set();
  let out = false;
  if (!(mask(FUSE_IN) & 8)) return { on, out };
  on.add(FUSE_IN);
  const q = [FUSE_IN];
  while (q.length) {
    const t = q.shift(), m = mask(t), r = Math.floor(t / 4), c = t % 4;
    if (t === FUSE_OUT && (m & 2)) out = true;
    for (const [d, dr, dc] of [[1, -1, 0], [2, 0, 1], [4, 1, 0], [8, 0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (!(m & d) || nr < 0 || nr > 3 || nc < 0 || nc > 3) continue;
      const nt = nr * 4 + nc;
      if (on.has(nt) || !(mask(nt) & rotMask(d, 2))) continue;
      on.add(nt); q.push(nt);
    }
  }
  return { on, out };
}
function openFuse() {
  overlay('fuse', `<h2>Fuse box</h2><p class="muted">Click the wire pieces to turn them. Lead the power from <b>MAINS</b> to <b>CONSERVATORY</b>: lit wire carries power.</p>
    <div class="fuse-wrap" id="pz-fuse"></div><p class="fuse-status" id="pz-fuse-status"></p>`);
  renderFuse();
}
function renderFuse() {
  const el = document.getElementById('pz-fuse');
  if (!el) return;
  const s = P.fuse;
  const { on, out } = poweredSet(s.types, s.rot);
  const done = s.solved || out;
  const tiles = s.types.map((t, i) => {
    const m = rotMask(BASE[t], s.rot[i]);
    const seg = [[1, '50,50 50,0'], [2, '50,50 100,50'], [4, '50,50 50,100'], [8, '50,50 0,50']].filter(([d]) => m & d).map(([, p]) => `<polyline points="${p}"/>`).join('');
    const r = Math.floor(i / 4) + 1, c = (i % 4) + 2;
    return `<button class="ftile ${on.has(i) ? 'on' : ''}" style="grid-row:${r};grid-column:${c}" data-i="${i}" aria-label="Wire piece"><svg viewBox="0 0 100 100">${seg}<circle cx="50" cy="50" r="7"/></svg></button>`;
  }).join('');
  const rIn = Math.floor(FUSE_IN / 4) + 1, rOut = Math.floor(FUSE_OUT / 4) + 1;
  el.innerHTML = `<div class="fuse">
    <div class="fuse-term in on" style="grid-row:${rIn};grid-column:1"><span>⚡</span><small>MAINS</small></div>
    ${tiles}
    <div class="fuse-term out ${done ? 'on' : ''}" style="grid-row:${rOut};grid-column:6"><span>${done ? '💡' : '○'}</span><small>CONSERV.</small></div>
  </div>`;
  document.getElementById('pz-fuse-status').textContent = done ? 'Power is flowing. The Conservatory lights hum on.' : `Power reaches ${on.size} of 16 pieces.`;
  if (s.solved) return;
  for (const b of el.querySelectorAll('[data-i]')) b.onclick = () => { audio.play('flashlight_click', { volume: 0.4, rate: 0.7 }); act('fuse', 'rotate', { i: +b.dataset.i }); };
}

// Grandfather clock
function drawClockFace() {
  const s = P.clock;
  const c = props.clockCanvas;
  if (!c || !s) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#e4d8b8'; ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3a2a14'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#2a1a0a'; ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i - 1], 64 + Math.sin(a) * 48, 64 - Math.cos(a) * 48); }
  const hand = (a, len, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + Math.sin(a) * len, 64 - Math.cos(a) * len); ctx.stroke(); };
  ctx.strokeStyle = '#120a04';
  hand(((s.h % 12) + s.m / 60) / 12 * Math.PI * 2, 28, 5);
  hand((s.m / 60) * Math.PI * 2, 42, 3);
  props.clockTex.needsUpdate = true;
}
let clockDraft = null;
function openClock() {
  clockDraft = { h: P.clock.h, m: P.clock.m };
  overlay('clock', `<h2>The grandfather clock</h2><p class="muted">Drag the hands to set the time. The long hand moves the minutes, the short hand the hours.</p>
    <svg class="clockface" id="pz-clock" viewBox="-110 -110 220 220"></svg><p class="clock-read" id="pz-clock-read"></p>`, (body) => {
    const svg = body.querySelector('#pz-clock');
    let drag = null;
    const angle = (e) => {
      const r = svg.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      return (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
    };
    svg.addEventListener('pointerdown', (e) => {
      try { svg.setPointerCapture(e.pointerId); } catch { /* pointer gone */ }
      const a = angle(e);
      const ha = (((clockDraft.h % 12) + clockDraft.m / 60) / 12) * Math.PI * 2, ma = (clockDraft.m / 60) * Math.PI * 2;
      const diff = (p, q) => Math.abs(Math.atan2(Math.sin(p - q), Math.cos(p - q)));
      drag = diff(a, ma) <= diff(a, ha) ? 'm' : 'h';
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const a = angle(e);
      if (drag === 'm') clockDraft.m = (Math.round((a / (Math.PI * 2)) * 12) % 12) * 5;
      else clockDraft.h = Math.round((a / (Math.PI * 2)) * 12) % 12 || 12;
      renderClock(true);
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      audio.play('flashlight_click', { volume: 0.4, rate: 0.6 });
      act('clock', 'set', { h: clockDraft.h, m: clockDraft.m });
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  });
  renderClock(true);
}
function renderClock(fromDraft) {
  const svg = document.getElementById('pz-clock');
  if (!svg) return;
  const s = fromDraft && clockDraft ? clockDraft : (clockDraft = { h: P.clock.h, m: P.clock.m });
  const nums = Array.from({ length: 12 }, (_, i) => { const a = ((i + 1) / 12) * Math.PI * 2; return `<text x="${Math.sin(a) * 80}" y="${-Math.cos(a) * 80}">${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i]}</text>`; }).join('');
  const hand = (a, len, w, cls) => `<line class="${cls}" x1="0" y1="0" x2="${Math.sin(a) * len}" y2="${-Math.cos(a) * len}" stroke-width="${w}"/>`;
  svg.innerHTML = `<circle r="104" class="rim"/><circle r="98" class="dial"/>${nums}
    ${hand((((s.h % 12) + s.m / 60) / 12) * Math.PI * 2, 50, 9, 'hh')}${hand((s.m / 60) * Math.PI * 2, 78, 5, 'mh')}<circle r="6" class="pin"/>`;
  document.getElementById('pz-clock-read').textContent = P.clock.solved ? 'The clock strikes twelve.' : '';
}

// Brass dial lock
function openLock() {
  const code = [0, 0];
  overlay('studyLock', `<h2>A brass lock</h2><p class="muted">Two number wheels hold the ledger's clasp shut.</p>
    <div class="dial">${[0, 1].map((w) => `<div class="wheel"><button data-w="${w}" data-d="1">▲</button><span id="pz-w${w}">0</span><button data-w="${w}" data-d="-1">▼</button></div>`).join('')}</div>
    <button class="btn" id="pz-try">Try the lock</button>`, (body) => {
    for (const b of body.querySelectorAll('[data-w]')) {
      b.onclick = () => {
        const w = +b.dataset.w;
        code[w] = (code[w] + +b.dataset.d + 10) % 10;
        body.querySelector(`#pz-w${w}`).textContent = code[w];
        audio.play('flashlight_click', { volume: 0.3, rate: 1.4 });
      };
    }
    body.querySelector('#pz-try').onclick = () => act('studyLock', 'try', { code: code[0] * 10 + code[1] }).then((r) => { if (r?.solved) setTimeout(openLedger, 1300); });
  });
}

export const LEDGER = [
  ['8 Sept', 'Honey. Sleeping drops from Father\'s cabinet.'],
  ['10 Sept', 'Nails and boards for the little window.'],
  ['13 Sept', "Mother's music box, oiled. She will like it."],
  ['16 Sept', 'A spade. Six rose bushes, white.'],
  ['18 Sept', 'Thirty-seven candles.'],
  ['1 Oct', 'Police. Polite. They will not come back.'],
  ['22 Oct', 'Posted the letter. Melisa is happy now.'],
  ['29 Oct', 'Paper, two hundred sheets. Ink, black. She still has so much to say.'],
];

export function ledgerHTML() {
  return `<div class="note-paper ledger"><h3>Household ledger — S. W. IV</h3>${LEDGER.map(([d, t]) => `<p><b>${esc(d)}</b> — ${esc(t)}</p>`).join('')}</div>`;
}

function openLedger() {
  overlay('ledger', `<h2>Steven's ledger</h2><p class="muted">Look closely.</p>${ledgerHTML()}`);
  audio.play('paper_pickup', { volume: 0.6 });
}

// Fogged mirror
function openMirror() {
  overlay('mirror', `<h2>The bathroom mirror</h2><p class="muted">Rub away the fog.</p>
    <div class="mirror-wrap"><div class="mirror-under">I write I write I write</div><canvas id="pz-fog" width="300" height="400"></canvas></div>`, (body) => {
    const c = body.querySelector('#pz-fog');
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 300, 400);
    g.addColorStop(0, 'rgba(205,212,214,0.97)'); g.addColorStop(1, 'rgba(170,180,184,0.97)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 300, 400);
    for (let i = 0; i < 200; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.4})`; ctx.beginPath(); ctx.arc(Math.random() * 300, Math.random() * 400, Math.random() * 3, 0, 7); ctx.fill(); }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000'; // fully opaque, so each stroke clears the fog completely
    let down = false, done = false;
    const wipe = (e) => {
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 300, y = ((e.clientY - r.top) / r.height) * 400;
      ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
    };
    const check = () => {
      if (done) return;
      const data = ctx.getImageData(0, 0, 300, 400).data;
      let clear = 0, total = 0;
      for (let i = 3; i < data.length; i += 4 * 37) { total++; if (data[i] < 60) clear++; }
      if (clear / total > 0.5) { done = true; act('mirror', 'wipe'); }
    };
    c.addEventListener('pointerdown', (e) => { down = true; try { c.setPointerCapture(e.pointerId); } catch { /* pointer gone */ } wipe(e); });
    c.addEventListener('pointermove', (e) => { if (down) wipe(e); });
    c.addEventListener('pointerup', () => { down = false; check(); });
  });
}
