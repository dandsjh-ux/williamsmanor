// The 12 notes, the props that hide them, and the writing on the walls.

import * as THREE from 'three';
import { LEVEL, anchors, interactables, followArea, areaBrightness } from './house.js';
import { rayBlocked } from './physics.js';
import { NOTES, noteById } from '../data/notes.js';
import { SCRIBBLES } from '../data/scribbles.js';

const U = LEVEL.U, C = LEVEL.C;
const WARM = new THREE.Color(1, 0.82, 0.6);

// Where each note lies. face: which way the paper faces. prompt: what the interact
// prompt says before anyone has found it. puzzle: milestone 4 hides it until solved.
const SPOTS = {
  1: { area: 'foyer', pos: [2.6, 0.95, 9.4], face: '+z', tilt: 0.25, prompt: 'Search the umbrella stand', proxy: [[2.6, 0.75, 9.4], [0.55, 0.6, 0.55]] },
  2: { area: 'bird', pos: [13.87, U + 1.3, -3.5], face: '-x', prompt: 'Read the pinned note' },
  3: { area: 'master', pos: [-7.78, U + 0.95, -5.24], face: '+z', tilt: 0.5, small: true, prompt: 'Check the dress pocket', proxy: [[-8, U + 1.2, -5.15], [0.75, 1.3, 0.25]] },
  4: { area: 'nursery', pos: [7.4, U + 0.703, 3.6], face: 'up', tilt: 0.4, prompt: 'Lift the music box', proxy: [[7.4, U + 0.78, 3.45], [0.4, 0.25, 0.45]] },
  5: { area: 'drawing', pos: [-13.885, 2.25, 6], face: '+x', tilt: 0.06, puzzle: 'portrait' }, // behind Father's portrait
  6: { area: 'dining', pos: [11, 1.15, 2.16], face: '+z', tilt: 0.1, puzzle: 'dumbwaiter' },
  7: { area: 'conservatory', pos: [9.5, 0.455, -9.35], face: 'up', tilt: -0.4, puzzle: 'fuse' },
  8: { area: 'bird', pos: [11.4, U + 0.012, -4.8], face: 'up', tilt: 0.8, puzzle: 'floorboard' },
  9: { area: 'hall', pos: [8, U + 0.95, -9.87], face: '+z', tilt: -0.05, puzzle: 'eyes' },
  10: { area: 'staircase', pos: [0.6, 1.465, -2.35], face: 'up', tilt: 0.2, puzzle: 'clock' },
  11: { area: 'cellar', pos: [6, C + 0.957, -9], face: 'up', tilt: 1.1, puzzle: 'cellarKey' },
  12: { area: 'garden', pos: null, face: 'up', tilt: 0.3, puzzle: 'roseDig' }, // on the tin box by the white rose
};

const FACE = {
  '+z': [0, 0], '-z': [0, Math.PI], '+x': [0, Math.PI / 2], '-x': [0, -Math.PI / 2], up: [-Math.PI / 2, 0], down: [Math.PI / 2, 0],
};

function orient(mesh, face, tilt = 0) {
  const [rx, ry] = FACE[face];
  mesh.rotation.set(rx, ry, tilt, 'YXZ');
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function litMaterial(area, map, k = 1, extra = {}) {
  const m = new THREE.MeshLambertMaterial({ map, emissive: WARM.clone(), emissiveMap: map, ...extra });
  followArea(area, m, k);
  return m;
}

// ---------------------------------------------------------------------------- Textures

let paperTex = null;
function paper() {
  paperTex ||= canvasTex(128, 170, (ctx, w, h) => {
    ctx.fillStyle = '#e9e0c8'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,90,40,0.18)'; ctx.fillRect(0, 0, w, h * 0.12);
    ctx.strokeStyle = 'rgba(60,80,140,0.25)';
    for (let y = 26; y < h; y += 11) { ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(w - 6, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(30,25,40,0.75)'; ctx.lineWidth = 1.4;
    for (let y = 24; y < h - 14; y += 11) {
      ctx.beginPath();
      let x = 10;
      ctx.moveTo(x, y);
      const end = w - 12 - Math.random() * 30;
      while (x < end) { x += 3 + Math.random() * 5; ctx.lineTo(x, y - Math.random() * 4); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(80,60,30,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.52); ctx.stroke(); // fold
  });
  return paperTex;
}

function dressTex() {
  return canvasTex(160, 300, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w / 2, 4); ctx.lineTo(w / 2, 22); ctx.moveTo(w / 2 - 30, 30); ctx.quadraticCurveTo(w / 2, 6, w / 2 + 30, 30); ctx.stroke(); // hanger
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#bdb7a8'); g.addColorStop(0.5, '#f1ede2'); g.addColorStop(1, '#b3ad9f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 34, 30); ctx.lineTo(w / 2 + 34, 30); ctx.lineTo(w / 2 + 26, 110); ctx.lineTo(w / 2 + 70, h - 6);
    ctx.lineTo(w / 2 - 70, h - 6); ctx.lineTo(w / 2 - 26, 110); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * 6, 115); ctx.lineTo(w / 2 + i * 18, h - 8); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(w / 2 + 34, 190, 14, 0.1, Math.PI - 0.1); ctx.stroke(); // pocket
  });
}

function tallyTex(count) {
  return canvasTex(256, 140, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < count; i++) {
      const x = 18 + i * 25 + (Math.random() - 0.5) * 6;
      ctx.strokeStyle = 'rgba(40,25,10,0.85)'; ctx.lineWidth = 3 + Math.random() * 2;
      ctx.beginPath(); ctx.moveTo(x, 18 + Math.random() * 10); ctx.lineTo(x + (Math.random() - 0.5) * 10, h - 18 - Math.random() * 10); ctx.stroke();
      ctx.strokeStyle = 'rgba(230,210,160,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 2, 22); ctx.lineTo(x + 2, h - 22); ctx.stroke();
    }
  });
}

// Messy handwriting: each letter wobbles. Redrawn once the handwriting font has loaded.
function scribbleTex(s) {
  const font = s.small ? 64 : 96;
  const tallyRows = s.tally ? Math.ceil(s.tally / 20) : 0;
  const c = document.createElement('canvas');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const draw = () => {
    const ctx = c.getContext('2d');
    ctx.font = `${font}px 'Reenie Beanie', cursive`;
    const tw = ctx.measureText(s.text).width;
    c.width = Math.ceil(tw + font * 0.6);
    c.height = Math.ceil(font * 1.35 + tallyRows * font * 0.9);
    ctx.font = `${font}px 'Reenie Beanie', cursive`;
    ctx.textBaseline = 'middle';
    let seed = 0;
    for (const ch of s.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    ctx.fillStyle = s.small ? 'rgba(45,12,8,0.7)' : 'rgba(55,8,6,0.92)';
    let x = font * 0.3;
    for (const ch of s.text) {
      ctx.save();
      ctx.translate(x, font * 0.68 + (rnd() - 0.5) * font * 0.14);
      ctx.rotate((rnd() - 0.5) * 0.2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      x += ctx.measureText(ch).width * (0.98 + rnd() * 0.08);
    }
    if (s.tally) {
      ctx.strokeStyle = 'rgba(55,8,6,0.85)'; ctx.lineWidth = 4;
      for (let i = 0; i < s.tally; i++) {
        const row = Math.floor(i / 20), k = i % 20, group = Math.floor(k / 5), inGroup = k % 5;
        const gx = font * 0.3 + group * font * 1.4, y0 = font * 1.35 + row * font * 0.9, y1 = y0 + font * 0.7;
        ctx.beginPath();
        if (inGroup < 4) { const lx = gx + inGroup * font * 0.22; ctx.moveTo(lx, y0); ctx.lineTo(lx + (rnd() - 0.5) * 6, y1); } else { ctx.moveTo(gx - font * 0.1, y1 - 6); ctx.lineTo(gx + font * 0.8, y0 + 6); }
        ctx.stroke();
      }
    }
    t.needsUpdate = true;
  };
  draw();
  document.fonts?.load(`${font}px 'Reenie Beanie'`).then(draw).catch(() => {});
  t.userData.aspect = () => c.height / c.width;
  return t;
}

// ---------------------------------------------------------------------------- Build

export const notes = new Map();   // id -> { mesh, found, spot }
export const scribbles = [];      // { def, mesh, mat, center, normal, cooldown }
let hooks = {};

function proxyBox(center, size) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  m.position.set(...center);
  return m;
}

function buildProps(scene) {
  // The white dress hanging on the wardrobe (note 3 is in its pocket)
  const dress = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.3), litMaterial('master', dressTex(), 1.2, { transparent: true, alphaTest: 0.05 }));
  dress.position.set(-8, U + 1.25, -5.27);
  scene.add(dress);

  // Scratched lines on the Bird Room wall, behind the bed
  const tally = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), new THREE.MeshLambertMaterial({ map: tallyTex(9), transparent: true, depthWrite: false }));
  tally.position.set(13.88, U + 1.05, -4.6);
  orient(tally, '-x');
  scene.add(tally);

  // The music box in the Nursery
  const wood = new THREE.MeshLambertMaterial({ color: 0x4a2a16 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, 0.17), wood);
  box.position.set(7.4, U + 0.755, 3.4);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.17), new THREE.MeshLambertMaterial({ color: 0x8a6a2a }));
  lid.position.set(0, 0.06, 0);
  const dancer = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 8), new THREE.MeshLambertMaterial({ color: 0xe8dcc8 }));
  dancer.position.set(0, 0.1, 0);
  box.add(lid, dancer);
  scene.add(box);
  anchors.musicBoxMesh = box;

  // Mirrors: Portrait Hall (SHE IS STILL HERE) and the Bathroom (fogged, milestone 4)
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x6b5122 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1e2428, emissive: 0x0b0e10 });
  for (const [x, y, z, face, w, h] of [[-13.9, U + 1.62, -8, '+x', 0.7, 1.0], [-8.6, U + 1.6, 9.9, '-z', 0.6, 0.8]]) {
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, h + 0.1), frameMat);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
    frame.position.set(x, y, z);
    orient(frame, face);
    glass.position.copy(frame.position);
    glass.rotation.copy(frame.rotation);
    glass.translateZ(0.01);
    frame.translateZ(0.005);
    scene.add(frame, glass);
  }

  // The tin box at the foot of the white rose (note 12)
  const wr = anchors.whiteRose;
  const tin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.16), new THREE.MeshLambertMaterial({ color: 0x6d6a60 }));
  tin.position.set(wr.x, 0.05, wr.z + 0.6);
  scene.add(tin);
  anchors.tinBox = tin;
  SPOTS[12].pos = [wr.x, 0.102, wr.z + 0.6];
}

function buildNotes(scene) {
  const geo = new THREE.PlaneGeometry(0.21, 0.28);
  const small = new THREE.PlaneGeometry(0.1, 0.13);
  for (const n of NOTES) {
    const spot = SPOTS[n.id];
    const mat = litMaterial(spot.area, paper(), 1.35, { polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(spot.small ? small : geo, mat);
    mesh.position.set(...spot.pos);
    orient(mesh, spot.face, spot.tilt);
    scene.add(mesh);
    const target = spot.proxy ? proxyBox(...spot.proxy) : proxyBox(spot.pos, [0.42, 0.42, 0.42]);
    scene.add(target);
    const entry = { id: n.id, mesh, target, spot, found: null };
    notes.set(n.id, entry);
    interactables.push({
      mesh: target,
      prompt: () => (entry.found ? `Read "${n.title}"` : spot.prompt || 'Pick up the note'),
      use: () => hooks.read?.(n.id),
    });
  }
}

function buildScribbles(scene) {
  for (const def of SCRIBBLES) {
    const map = scribbleTex(def);
    const h = def.w * map.userData.aspect();
    const mat = new THREE.MeshLambertMaterial({
      map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
      emissive: WARM.clone(), emissiveMap: map, opacity: def.beam ? 0 : 1,
    });
    if (!def.beam) followArea(def.area, mat, 1.1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(def.w, h), mat);
    mesh.position.set(...def.pos);
    orient(mesh, def.face);
    mesh.visible = !def.hidden;
    // Keep the plane's height in step with the real font once it loads.
    const fix = () => { const nh = def.w * map.userData.aspect(); mesh.scale.y = nh / h; };
    document.fonts?.ready.then(() => setTimeout(fix, 50));
    scene.add(mesh);
    const normal = new THREE.Vector3(0, 0, 1).applyEuler(mesh.rotation);
    scribbles.push({ def, mesh, mat, center: mesh.position.clone(), normal, cooldown: 0 });
  }
}

export function buildClues(scene, h) {
  hooks = h;
  buildProps(scene);
  buildNotes(scene);
  buildScribbles(scene);
}

// ---------------------------------------------------------------------------- State

/** Apply the server's found notes: { id: { by, color, at } }. */
export function syncNotes(found = {}) {
  for (const [id, entry] of notes) entry.found = found[id] || null;
}

export function markFound(id, info) {
  const e = notes.get(id);
  if (e) e.found = info;
}

export function foundList() {
  return [...notes.values()].filter((e) => e.found).sort((a, b) => a.found.at - b.found.at).map((e) => ({ ...noteById(e.id), found: e.found }));
}

export function setNoteVisible(id, visible) {
  const e = notes.get(id);
  if (!e) return;
  e.mesh.visible = visible;
  e.target.visible = visible;
}

export function setNotePos(id, pos, face) {
  const e = notes.get(id);
  if (!e) return;
  e.mesh.position.set(...pos);
  if (face) orient(e.mesh, face, e.spot.tilt);
  e.target.position.set(...pos);
}

/** Writing added during the game (the director's dynamic scribbles). */
const dynKeys = new Set();
export function addScribble(scene, def) {
  const key = `${def.text}|${def.pos.join(',')}`;
  if (dynKeys.has(key)) return null;
  dynKeys.add(key);
  const full = { id: `dyn${dynKeys.size}`, w: 1.6, ...def };
  const map = scribbleTex(full);
  const h = full.w * map.userData.aspect();
  const mat = new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, emissive: WARM.clone(), emissiveMap: map });
  if (full.area) followArea(full.area, mat, 1.1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(full.w, h), mat);
  mesh.position.set(...full.pos);
  orient(mesh, full.face);
  scene.add(mesh);
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(mesh.rotation);
  scribbles.push({ def: full, mesh, mat, center: mesh.position.clone(), normal, cooldown: 0 });
  return mesh;
}

export function setScribbleVisible(id, visible) {
  const s = scribbles.find((x) => x.def.id === id);
  if (s) s.mesh.visible = visible;
}

// ---------------------------------------------------------------------------- Per frame

const toS = new THREE.Vector3();
let dwellId = null, dwell = 0, globalCool = 0;

/**
 * Fade in beam-only writing inside the flashlight cone, and report a scribble the
 * player has been looking at for a moment (returns its def once, then cools down).
 */
export function updateScribbles(dt, cam, fwd, flashOn) {
  globalCool = Math.max(0, globalCool - dt);
  let best = null, bestDist = Infinity;
  for (const s of scribbles) {
    s.cooldown = Math.max(0, s.cooldown - dt);
    if (!s.mesh.visible) continue;
    toS.subVectors(s.center, cam);
    const dist = toS.length();
    toS.divideScalar(dist);
    const ang = Math.acos(Math.min(1, fwd.dot(toS)));
    const inBeam = flashOn && ang < 0.45 && dist < 10;
    if (s.def.beam) s.mat.opacity += ((inBeam ? 0.95 : 0) - s.mat.opacity) * Math.min(1, dt * 3);

    const range = s.def.small ? 3.2 : 7.5;
    if (dist > range || s.cooldown > 0) continue;
    if (s.normal.dot(toS) > -0.25) continue;                         // looking at it from behind or edge-on
    if (ang > Math.atan2(s.def.w * 0.5, dist) * 0.9 + 0.06) continue; // not looking at it
    const lit = s.def.beam ? s.mat.opacity > 0.5 : areaBrightness(s.def.area) > 0.05 || inBeam;
    if (!lit) continue;
    if (rayBlocked(cam, toS, dist, s.center)) continue;
    if (dist < bestDist) { best = s; bestDist = dist; }
  }
  if (!best) { dwellId = null; dwell = 0; return null; }
  if (best.def.id !== dwellId) { dwellId = best.def.id; dwell = 0; }
  dwell += dt;
  if (dwell < 0.45 || globalCool > 0) return null;
  best.cooldown = 30;
  globalCool = 3;
  dwell = 0;
  return best.def;
}
