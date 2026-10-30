// Builds Williams Manor. Static geometry is batched per material (one draw call each);
// every room has its own materials so its "lamp light" can flicker or die on its own.
// Room light is faked with emissive maps (cheap, no light leaking through walls) plus one
// moving point light for the room you are in; the flashlights are real spotlights.
//
// Coordinates: metres. x runs west -> east, z runs north -> south (front door at z = +10).
// Levels: cellar y = -3.4, ground y = 0, upper y = 3.4. Rooms are 3.2 m tall.

import * as THREE from 'three';
import { tex, portrait, painting, plaque } from './textures.js';
import { buildGarden, buildPlants, updateGarden } from './garden.js';
import { prefs } from '../prefs.js';

export const LEVEL = { C: -3.4, G: 0, U: 3.4 };
const H = 3.2;          // room height
const DOOR_H = 2.2;     // door opening height
const T = 0.2;          // wall thickness
const HIGH = prefs.graphics === 'high';
const GLOW = 0.55;      // how much of a room's lamp light is baked into its surfaces

// --------------------------------------------------------------------------
// Areas. rects are [x0, x1, z0, z1]. light = lamp brightness (0 = pitch dark).
// wall 'manor' = panelled wainscot + wallpaper [paper, pattern, wood, motif]. moulding adds
// 3D skirting, chair rail and cornice ('skirt' = skirting only).

const GRAND_WALL = ['manor', ['#1b2c29', '#2d4741', '#24150b', 'damask']];
export const AREAS = {
  foyer:        { name: 'Foyer', level: 'G', rects: [[-4, 4, 2, 10]], light: 0.5, lamp: [0, 5.0, 6], chandelier: true, moulding: 'full',
                  wall: GRAND_WALL, floor: ['parquet', ['#4a2e1b']], ceil: ['coffer', ['#1f130b', '#2c2119']], drape: ['velvet', ['#2c0f12']] },
  staircase:    { name: 'Grand Staircase', level: 'G', rects: [[-4, 4, -10, 2]], light: 0.42, lamp: [0, 5.0, -2], chandelier: true, moulding: 'full',
                  wall: GRAND_WALL, floor: ['parquet', ['#432a19']], ceil: ['coffer', ['#1f130b', '#2c2119']] },
  drawing:      { name: 'Drawing Room', level: 'G', rects: [[-14, -4, 2, 10]], light: 0.45, lamp: [-9, 2.7, 6], moulding: 'full',
                  wall: ['manor', ['#3a1614', '#55241e', '#2a1a10', 'damask']], floor: ['parquet', ['#55361f']], ceil: ['plaster', ['#6c6354']], drape: ['velvet', ['#1f2a1c']] },
  library:      { name: 'Library', level: 'G', rects: [[-14, -4, -4, 2]], light: 0.4, lamp: [-9, 2.7, -1], moulding: 'full',
                  wall: ['manor', ['', '', '#3a2416', 'wood']], floor: ['carpet', ['#4a1414', '#6a2a1a']], ceil: ['coffer', ['#24160c', '#2e2118']] },
  study:        { name: 'Study', level: 'G', rects: [[-14, -4, -10, -4]], light: 0.38, lamp: [-9, 2.7, -7], moulding: 'full',
                  wall: ['manor', ['', '', '#331f13', 'wood']], floor: ['wood', ['#3b2516']], ceil: ['coffer', ['#24160c', '#2e2118']] },
  dining:       { name: 'Dining Room', level: 'G', rects: [[4, 14, 2, 10]], light: 0.45, lamp: [9, 2.7, 6], moulding: 'full',
                  wall: ['manor', ['#151f2c', '#233349', '#24160c', 'damask']], floor: ['parquet', ['#55361f']], ceil: ['coffer', ['#1f130b', '#2c2119']], drape: ['velvet', ['#3a2a12']] },
  kitchen:      { name: 'Kitchen', level: 'G', rects: [[4, 14, -4, 2]], light: 0.5, lamp: [9, 2.7, -0.5], moulding: 'skirt',
                  wall: ['tiles', ['#c9c0a3', '#8a8169', 6]], floor: ['checker', ['#2a2622', '#b3a991']], ceil: ['plaster', ['#8f8676']] },
  conservatory: { name: 'Conservatory', level: 'G', rects: [[4, 14, -10, -4]], light: 0.45, powered: false, lamp: [9, 2.7, -7],
                  wall: ['glass', []], floor: ['tiles', ['#7a3f2a', '#3a2418', 4]], ceil: ['glass', []] },
  hall:         { name: 'Portrait Hall', level: 'U', rects: [[-14, 14, -10, -6], [-6, -4, -6, 10], [4, 6, -6, 10]], light: 0.38, lamp: [0, 6.1, -8], moulding: 'full',
                  wall: ['manor', ['#28192b', '#3e2742', '#24160c', 'damask']], floor: ['carpet', ['#3d1010', '#5e2a14']], ceil: ['plaster', ['#6c6354']], drape: ['velvet', ['#3a1218']] },
  master:       { name: 'Master Bedroom', level: 'U', rects: [[-14, -6, -6, 2]], light: 0.36, lamp: [-10, 6.1, -2], moulding: 'full',
                  wall: ['manor', ['#4b2e33', '#3d2529', '#2a1a10', 'stripes']], floor: ['wood', ['#4d311d']], ceil: ['plaster', ['#756c5e']] },
  bathroom:     { name: 'Bathroom', level: 'U', rects: [[-14, -6, 2, 10]], light: 0.42, lamp: [-10, 6.1, 6], moulding: 'skirt',
                  wall: ['tiles', ['#cfd2c8', '#8d928a', 8]], floor: ['tiles', ['#e3e0d4', '#55524a', 12]], ceil: ['plaster', ['#8f887a']], drape: ['velvet', ['#4a4a42']] },
  bird:         { name: 'Bird Room', level: 'U', rects: [[6, 14, -6, 2]], light: 0, moulding: 'full',
                  wall: ['manor', ['', '', '#3a2a1a', 'birds']], floor: ['wood', ['#4a3420']], ceil: ['plaster', ['#6b6355']] },
  nursery:      { name: 'Nursery', level: 'U', rects: [[6, 14, 2, 10]], light: 0, moulding: 'full',
                  wall: ['manor', ['', '', '#4a3a2a', 'nursery']], floor: ['wood', ['#57402a']], ceil: ['plaster', ['#7a7366']], drape: ['velvet', ['#4d4446']] },
  cellar:       { name: 'Cellar', level: 'C', rects: [[4, 14, -10, 2]], light: 0,
                  wall: ['stone', ['#58544d']], floor: ['flagstone', []], ceil: ['wood', ['#2e2016']] },
  garden:       { name: 'Garden', level: 'G', rects: [[-18, 18, -30, -10]], light: 0.1, outside: true, tint: 0x6f86b0,
                  wall: ['brick', []], floor: ['grass', []], ceil: ['plain', ['#000']] },
};

const HOUSE = [-14, 14, -10, 10];
const VOID = [-4, 4, -6, 10]; // the double-height grand hall: no upper floor here

const inRect = (r, x, z) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3];

export function levelOf(y) {
  return y < -1.7 ? 'C' : y > 1.7 ? 'U' : 'G';
}

export function areaAt(level, x, z) {
  for (const [id, a] of Object.entries(AREAS)) {
    if (a.level !== level) continue;
    for (const r of a.rects) if (inRect(r, x, z)) return id;
  }
  return null;
}

export function areaAtPos(p) {
  // Players on the cellar steps still count as being in the kitchen until they are halfway down.
  return areaAt(levelOf(p.y), p.x, p.z) || areaAt('G', p.x, p.z) || 'garden';
}

// Which room a wall face belongs to, for choosing its wallpaper.
function matArea(level, x, z) {
  const a = areaAt(level, x, z);
  if (a) return a;
  if (level === 'U' && inRect(VOID, x, z)) return areaAt('G', x, z);
  return 'garden';
}

// --------------------------------------------------------------------------
// Materials, one set per room

const WARM = new THREE.Color(1, 0.82, 0.6);
const areaMats = {}; // areaId -> [{ mat, k }]
const matCache = new Map();
export const areaLight = {}; // areaId -> current multiplier (flicker / power)

const SCALE = {
  roses: 1, checker: 2, tiles: 2, stone: 2.5, flagstone: 2.5, grass: 3, carpet: 3, wood: 2.4, damask: 1.6, stripes: 1.6, birds: 1.4, nursery: 1.6,
  panel: 2, plaster: 3, glass: 2.4, brick: 2.5, plain: 2, manor: 3.4, parquet: 2.4, coffer: 2.2, gilt: 1, velvet: 1, runner: 1.4, sheet: 1.2, bark: 1.5,
};
const SIZE = { manor: HIGH ? 1024 : 512, parquet: 512, coffer: 512 };

function painter([kind, args]) {
  return tex(kind, args, SCALE[kind] || 2, SIZE[kind] || 256);
}

const PROP_DEFS = {
  wood: ['wood', ['#3a2414']],
  darkwood: ['wood', ['#24160c']],
  trim: ['wood', ['#24160c']],
  fabric: ['fabric', ['#4a1d1d']],
  green: ['fabric', ['#22352a']],
  linen: ['fabric', ['#b9b2a2']],
  sheet: ['sheet', []],
  metal: ['plain', ['#2c2c2c']],
  stone: ['stone', ['#6a655c']],
  soot: ['stone', ['#1e1b18']],
  books: ['books', []],
  white: ['plain', ['#d8d4c8']],
  door: ['panel', ['#3a2414']],
  hedge: ['grass', []],
  board: ['boards', []],
  runner: ['runner', ['#4a1012', '#8a6a30']],
  drape: ['velvet', ['#3a1416']],
  gilt: ['gilt', []],
};

export function mat(area, kind) {
  const key = `${area}|${kind}`;
  if (matCache.has(key)) return matCache.get(key);
  const a = AREAS[area];
  const def = a[kind] || PROP_DEFS[kind] || PROP_DEFS.wood;
  const map = painter(def);
  const m = new THREE.MeshLambertMaterial({ map, emissive: a.tint ? new THREE.Color(a.tint) : WARM, emissiveMap: map, emissiveIntensity: 0 });
  // The garden is lit by a faint moon; rooms by their lamps.
  (areaMats[area] ||= []).push({ mat: m, k: 1 });
  matCache.set(key, m);
  return m;
}

/** Register an extra material (portraits, avatars) to follow a room's light. */
export function followArea(area, m, k = 1) {
  m.emissive ||= WARM.clone();
  (areaMats[area] ||= []).push({ mat: m, k });
}

const lampMeshes = {}; // areaId -> [mesh]
const LAMP_ON = new THREE.Color(1, 0.78, 0.45);
const LAMP_OFF = new THREE.Color(0.06, 0.05, 0.04);

/** Apply a room's light level: base brightness * multiplier (0 = off). */
export function setAreaLight(area, mult) {
  const a = AREAS[area];
  areaLight[area] = mult;
  const powered = a.powered !== false;
  const v = (powered ? a.light : 0) * mult;
  for (const { mat: m, k } of areaMats[area] || []) m.emissiveIntensity = v * k * GLOW;
  for (const lm of lampMeshes[area] || []) lm.material.color.copy(v > 0.02 ? LAMP_ON : LAMP_OFF).multiplyScalar(v > 0.02 ? 0.6 + mult * 0.4 : 1);
}

export function areaBrightness(area) {
  const a = AREAS[area];
  if (!a) return 0;
  return (a.powered !== false ? a.light : 0) * (areaLight[area] ?? 1);
}

// --------------------------------------------------------------------------
// Geometry batching

class Batch {
  constructor() { this.groups = new Map(); }

  quad(m, pts, n, uvs) {
    let g = this.groups.get(m);
    if (!g) this.groups.set(m, (g = { pos: [], nrm: [], uv: [], idx: [] }));
    const base = g.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      g.pos.push(...pts[i]);
      g.nrm.push(...n);
      g.uv.push(...uvs[i]);
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Axis-aligned box. faces: { px, nx, py, ny, pz, nz } -> material or null (skip). */
  box(x0, y0, z0, x1, y1, z1, faces) {
    const s = (m) => m.map?.userData.scale || 2;
    const f = faces;
    if (f.px) { const k = s(f.px); this.quad(f.px, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[-z1 / k, y0 / k], [-z0 / k, y0 / k], [-z0 / k, y1 / k], [-z1 / k, y1 / k]]); }
    if (f.nx) { const k = s(f.nx); this.quad(f.nx, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0 / k, y0 / k], [z1 / k, y0 / k], [z1 / k, y1 / k], [z0 / k, y1 / k]]); }
    if (f.pz) { const k = s(f.pz); this.quad(f.pz, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0 / k, y0 / k], [x1 / k, y0 / k], [x1 / k, y1 / k], [x0 / k, y1 / k]]); }
    if (f.nz) { const k = s(f.nz); this.quad(f.nz, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[-x1 / k, y0 / k], [-x0 / k, y0 / k], [-x0 / k, y1 / k], [-x1 / k, y1 / k]]); }
    if (f.py) { const k = s(f.py); this.quad(f.py, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[x0 / k, -z1 / k], [x1 / k, -z1 / k], [x1 / k, -z0 / k], [x0 / k, -z0 / k]]); }
    if (f.ny) { const k = s(f.ny); this.quad(f.ny, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0 / k, z0 / k], [x1 / k, z0 / k], [x1 / k, z1 / k], [x0 / k, z1 / k]]); }
  }

  /** A box with every face in one material. */
  solid(m, x0, y0, z0, x1, y1, z1) {
    this.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), { px: m, nx: m, py: m, ny: m, pz: m, nz: m });
  }

  build(scene, shadows) {
    for (const [m, g] of this.groups) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setIndex(g.idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = shadows;
      mesh.castShadow = shadows;
      mesh.matrixAutoUpdate = false;
      mesh.userData.static = true;
      scene.add(mesh);
      staticMeshes.push(mesh);
    }
  }
}

// --------------------------------------------------------------------------
// Exports filled in by build()

export const colliders = [];   // { x0, x1, y0, y1, z0, z1, active }
export const surfaces = [];    // { x0, x1, z0, z1, y } or with ramp: { axis, a0, y0, a1, y1 }
export const doors = [];       // Door objects
export const interactables = []; // { mesh, prompt(), use(), holdMs }
export const staticMeshes = []; // for raycasts (line of sight, pings)
export const anchors = {};     // named positions for later milestones (clock, umbrella stand ...)

export function addCollider(x0, y0, z0, x1, y1, z1) {
  const c = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1), active: true };
  colliders.push(c);
  return c;
}

// --------------------------------------------------------------------------
// Walls: [level, axis, c, from, to, gaps[[centre, width]], kind]
// axis 'x' = the wall runs along x at z = c; axis 'z' = runs along z at x = c.

const WALLS = [
  // Ground floor (walls go up to 3.4 so they close the gap under the upper floor)
  ['G', 'x', 10, -14, 14, [[0, 1.6]]],
  ['G', 'x', -10, -14, 14, [[-2.5, 1.2], [9, 1.4]]],
  ['G', 'z', -14, -10, 10],
  ['G', 'z', 14, -10, 10],
  ['G', 'z', -4, -10, 10, [[6, 1.4], [-1, 1.4]]],
  ['G', 'z', 4, -10, 10, [[6, 1.4], [-1, 1.4]]],
  ['G', 'x', 2, -14, -4, [[-9, 1.4]]],
  ['G', 'x', -4, -14, -4, [[-9, 1.2]]],
  ['G', 'x', 2, 4, 14, [[7, 1.2]]],
  ['G', 'x', -4, 4, 14, [[5.2, 1.2]]],
  ['G', 'z', 7, -4, -2.6, [[-3.3, 1.4]]],           // cellar door frame
  ['G', 'x', -6, -1.3, 1.3, [], 'under'],             // under the landing, behind the stairs
  // Upper floor
  ['U', 'x', -10, -14, 14],
  ['U', 'x', 10, -14, 14],
  ['U', 'z', -14, -10, 10],
  ['U', 'z', 14, -10, 10],
  ['U', 'x', -6, -14, -6],
  ['U', 'x', -6, 6, 14],
  ['U', 'z', -6, -6, 10, [[-2, 1.2], [6, 1.2]]],
  ['U', 'z', 6, -6, 10, [[-2, 1.2], [6, 1.2]]],
  ['U', 'x', 2, -14, -6],
  ['U', 'x', 2, 6, 14],
  // Gallery balustrades around the grand hall
  ['U', 'z', -4, -6, 10, [], 'rail'],
  ['U', 'z', 4, -6, 10, [], 'rail'],
  ['U', 'x', -6, -4, -1.3, [], 'rail'],
  ['U', 'x', -6, 1.3, 4, [], 'rail'],
  // Cellar
  ['C', 'x', -10, 4, 14],
  ['C', 'x', 2, 4, 14],
  ['C', 'z', 4, -10, 2],
  ['C', 'z', 14, -10, 2],
  ['C', 'x', -2.6, 7, 13, [], 'under'],               // under the cellar steps
  ['C', 'z', 7, -4, -2.6, [], 'under'],
  // Kitchen rails around the cellar stair opening
  ['G', 'x', -2.6, 7, 13, [], 'rail'],
  ['G', 'z', 13, -4, -2.6, [], 'rail'],
];

const balusters = {}; // areaId -> [[x, y, z, height]] turned spindles, built as one instanced mesh per room

function wallPiece(batch, level, axis, c, a0, a1, y0, y1, kind) {
  if (a1 - a0 < 0.01) return;
  if (kind === 'rail') { railPiece(batch, level, axis, c, a0, a1); return; }
  const [x0, x1, z0, z1] = axis === 'x' ? [a0, a1, c - T / 2, c + T / 2] : [c - T / 2, c + T / 2, a0, a1];
  const mid = (a0 + a1) / 2;
  const side = (d) => matArea(level, axis === 'x' ? mid : c + d, axis === 'x' ? c + d : mid);
  const pa = side(0.5), na = side(-0.5);
  const plus = mat(pa, 'wall'), minus = mat(na, 'wall');
  const faces = axis === 'x'
    ? { pz: plus, nz: minus, px: plus, nx: plus }
    : { px: plus, nx: minus, pz: plus, nz: plus };
  batch.box(x0, y0, z0, x1, y1, z1, faces);
  addCollider(x0, y0, z0, x1, y1, z1);
  trims(batch, level, axis, c + T / 2, a0, a1, y0, 1, pa);
  trims(batch, level, axis, c - T / 2, a0, a1, y0, -1, na);
}

// Skirting, chair rail and a stepped cornice in dark wood, standing proud of the wall.
function trims(batch, level, axis, face, a0, a1, y0, dir, area) {
  const style = AREAS[area]?.moulding;
  if (!style) return;
  const L = LEVEL[level], top = L + H;
  const m = mat(area, 'trim');
  const bands = style === 'skirt'
    ? [[L, L + 0.15, 0.022]]
    : [[L, L + 0.19, 0.028], [L + 0.93, L + 1.03, 0.034], [top - 0.17, top, 0.05], [top - 0.07, top, 0.09], [top - 0.21, top - 0.17, 0.02]];
  const out = axis === 'x' ? (dir > 0 ? 'pz' : 'nz') : (dir > 0 ? 'px' : 'nx');
  const ends = axis === 'x' ? ['px', 'nx'] : ['pz', 'nz'];
  for (const [b0, b1, d] of bands) {
    if (b0 < y0 - 0.001) continue; // a lintel over a door only gets the cornice
    const f1 = face + dir * d;
    const [x0, x1, z0, z1] = axis === 'x' ? [a0, a1, Math.min(face, f1), Math.max(face, f1)] : [Math.min(face, f1), Math.max(face, f1), a0, a1];
    batch.box(x0, b0, z0, x1, b1, z1, { [out]: m, py: m, ny: m, [ends[0]]: m, [ends[1]]: m });
  }
}

// An open balustrade: handrail, plinth and turned spindles (the collider stays solid).
function railPiece(batch, level, axis, c, a0, a1) {
  const L = LEVEL[level];
  const mid = (a0 + a1) / 2;
  const at = (d) => (axis === 'x' ? areaAt(level, mid, c + d) : areaAt(level, c + d, mid));
  const area = at(0.5) || at(-0.5) || matArea(level, axis === 'x' ? mid : c + 0.5, axis === 'x' ? c + 0.5 : mid);
  const m = mat(area, 'trim');
  const bar = (y0, y1, t) => (axis === 'x' ? batch.solid(m, a0, y0, c - t / 2, a1, y1, c + t / 2) : batch.solid(m, c - t / 2, y0, a0, c + t / 2, y1, a1));
  bar(L + 0.92, L + 1.0, 0.11);
  bar(L, L + 0.09, 0.13);
  const n = Math.max(1, Math.round((a1 - a0) / 0.16));
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + 0.5) * (a1 - a0)) / n;
    (balusters[area] ||= []).push(axis === 'x' ? [a, L + 0.09, c, 0.83] : [c, L + 0.09, a, 0.83]);
  }
  if (axis === 'x') addCollider(a0, L, c - 0.06, a1, L + 1.0, c + 0.06);
  else addCollider(c - 0.06, L, a0, c + 0.06, L + 1.0, a1);
}

function buildWalls(batch) {
  // Cut walls wherever a room starts or ends, so each stretch gets the right wallpaper.
  const breaks = { x: new Set(), z: new Set() };
  for (const a of Object.values(AREAS)) for (const r of a.rects) { breaks.x.add(r[0]); breaks.x.add(r[1]); breaks.z.add(r[2]); breaks.z.add(r[3]); }
  const piece = (level, axis, c, a0, a1, y0, y1, kind) => {
    const cuts = [...breaks[axis]].filter((b) => b > a0 + 0.01 && b < a1 - 0.01).sort((p, q) => p - q);
    let cur = a0;
    for (const b of [...cuts, a1]) { wallPiece(batch, level, axis, c, cur, b, y0, y1, kind); cur = b; }
  };
  for (const [level, axis, c, from, to, gaps = [], kind = 'wall'] of WALLS) {
    const L = LEVEL[level];
    const top = kind === 'rail' ? L + 1.0 : level === 'G' ? 3.4 : L + H;
    const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
    let cur = from;
    for (const [centre, width] of sorted) {
      const g0 = centre - width / 2, g1 = centre + width / 2;
      piece(level, axis, c, cur, g0, L, top, kind);
      piece(level, axis, c, g0, g1, L + DOOR_H, top, kind); // lintel
      cur = g1;
    }
    piece(level, axis, c, cur, to, L, top, kind);
  }
}

// --------------------------------------------------------------------------
// Floors and ceilings: slabs cut on a grid so every cell knows the room above and below.

function gridCells(rectList) {
  const xs = new Set(), zs = new Set();
  for (const r of rectList) { xs.add(r[0]); xs.add(r[1]); zs.add(r[2]); zs.add(r[3]); }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  const cells = [];
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) cells.push([X[i], X[i + 1], Z[j], Z[j + 1]]);
  return cells;
}

const HOLES = { G: [[7, 13, -4, -2.6]] }; // the cellar stair opening in the kitchen floor

function buildSlabs(batch) {
  const houseRects = Object.values(AREAS).filter((a) => !a.outside).flatMap((a) => a.rects);
  const allRects = [...houseRects, ...HOLES.G, VOID];
  const cells = gridCells(allRects);
  const centre = (c) => [(c[0] + c[1]) / 2, (c[2] + c[3]) / 2];

  for (const cell of cells) {
    const [cx, cz] = centre(cell);
    if (!inRect(HOUSE, cx, cz)) continue;

    // Ground floor slab: top = ground room, bottom = cellar ceiling
    const g = areaAt('G', cx, cz);
    const hole = HOLES.G.some((h) => inRect(h, cx, cz));
    if (g && !hole) {
      const c = areaAt('C', cx, cz);
      batch.box(cell[0], -0.2, cell[2], cell[1], 0, cell[3], { py: mat(g, 'floor'), ny: c ? mat(c, 'ceil') : null });
      surfaces.push({ x0: cell[0], x1: cell[1], z0: cell[2], z1: cell[3], y: 0 });
    }

    // Upper floor slab: top = upper room, bottom = ground ceiling (none over the grand hall)
    const u = areaAt('U', cx, cz);
    if (u) {
      batch.box(cell[0], 3.2, cell[2], cell[1], 3.4, cell[3], { py: mat(u, 'floor'), ny: g ? mat(g, 'ceil') : null });
      surfaces.push({ x0: cell[0], x1: cell[1], z0: cell[2], z1: cell[3], y: 3.4 });
    }

    // Roof: ceiling of the upper floor and of the double-height grand hall
    const roofArea = u || (inRect(VOID, cx, cz) ? g : null);
    if (roofArea) batch.box(cell[0], 6.6, cell[2], cell[1], 6.8, cell[3], { ny: mat(roofArea, 'ceil') });

    // Cellar floor
    const c = areaAt('C', cx, cz);
    if (c) {
      batch.box(cell[0], -3.6, cell[2], cell[1], -3.4, cell[3], { py: mat(c, 'floor') });
      surfaces.push({ x0: cell[0], x1: cell[1], z0: cell[2], z1: cell[3], y: -3.4 });
    }
  }

  // Slab edges around the gallery, seen from the grand hall: a carved fascia with a moulding
  const edge = mat('staircase', 'trim');
  batch.box(-4.1, 3.2, -6, -3.9, 3.4, 10, { px: edge });
  batch.box(3.9, 3.2, -6, 4.1, 3.4, 10, { nx: edge });
  batch.solid(edge, -3.9, 3.12, -6, -3.82, 3.2, 10);
  batch.solid(edge, 3.82, 3.12, -6, 3.9, 3.2, 10);

  // Garden lawn
  batch.box(-18, -0.2, -30, 18, 0, -10, { py: mat('garden', 'floor') });
  surfaces.push({ x0: -18, x1: 18, z0: -30, z1: -10, y: 0 });
}

// --------------------------------------------------------------------------
// Stairs

function newel(batch, m, x, y, z) {
  batch.solid(m, x - 0.09, y, z - 0.09, x + 0.09, y + 1.12, z + 0.09);
  batch.solid(m, x - 0.11, y + 1.12, z - 0.11, x + 0.11, y + 1.18, z + 0.11);
  batch.solid(m, x - 0.06, y + 1.18, z - 0.06, x + 0.06, y + 1.3, z + 0.06);
}

function buildStairs(batch, scene) {
  // Grand staircase: rises north from z = 0 (ground) to z = -6 (upper landing)
  const steps = 14, run = 6 / steps, rise = 3.4 / steps;
  const tread = mat('staircase', 'floor'), side = mat('staircase', 'trim'), runner = mat('staircase', 'runner');
  for (let i = 0; i < steps; i++) {
    const z1 = -i * run, z0 = z1 - run, top = (i + 1) * rise;
    batch.box(-1.25, 0, z0, 1.25, top, z1, { py: tread, pz: side, px: side, nx: side });
    // A red runner up the middle; the clock's tread (step 5) has its lid where the runner would be.
    const xr = i === 5 ? 0.27 : 0.65;
    batch.box(-0.65, top, z0, xr, top + 0.012, z1, { py: runner });
    batch.box(-0.65, i * rise, z1, xr, top + 0.012, z1 + 0.012, { pz: runner });
  }
  surfaces.push({ x0: -1.25, x1: 1.25, z0: -6, z1: 0, axis: 'z', a0: 0, y0: 0, a1: -6, y1: 3.4 });
  addCollider(-1.4, 0, -6, -1.25, 4.6, 0);
  addCollider(1.25, 0, -6, 1.4, 4.6, 0);

  // Banisters: a closed string, turned spindles and a handrail on each side
  const len = Math.hypot(6, 3.4), angle = Math.atan2(3.4, 6);
  for (const x of [-1.32, 1.32]) {
    for (const [h, w, dy] of [[0.08, 0.1, 0.92], [0.3, 0.12, 0.12]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, len + 0.1), side);
      bar.position.set(x, 1.7 + dy, -3);
      bar.rotation.x = angle;
      bar.castShadow = HIGH;
      scene.add(bar);
      staticMeshes.push(bar);
    }
    for (let i = 0; i < steps; i++) {
      for (const f of [0.25, 0.75]) {
        const z = -(i + f) * run, line = (-z / 6) * 3.4;
        (balusters.staircase ||= []).push([x, line + 0.27, z, 0.65]);
      }
    }
    newel(batch, side, x, 0, 0.12);
    addCollider(x - 0.1, 0, 0.02, x + 0.1, 1.3, 0.22);
  }
  // Newels where the gallery rails turn
  const hallTrim = mat('hall', 'trim');
  for (const [x, z] of [[-1.32, -6], [1.32, -6], [-4, -6], [4, -6], [-4, 9.9], [4, 9.9]]) newel(batch, hallTrim, x, 3.4, z);

  // Cellar steps: run along the kitchen's north wall, from x = 7 (kitchen floor) down to x = 13
  const cSteps = 12, cRun = 6 / cSteps, cRise = 3.4 / cSteps;
  const st = mat('cellar', 'wall');
  for (let i = 0; i < cSteps; i++) {
    const x0 = 7 + i * cRun;
    batch.box(x0, -3.4, -4, x0 + cRun, -(i + 1) * cRise, -2.6, { py: st, px: st, pz: st, nz: st });
  }
  surfaces.push({ x0: 7, x1: 13, z0: -4, z1: -2.6, axis: 'x', a0: 7, y0: 0, a1: 13, y1: -3.4 });
  addCollider(7, -3.4, -4.08, 13, -0.2, -3.95); // north side of the cellar steps
}

function buildBalusters(scene) {
  const profile = [[0.03, 0], [0.03, 0.06], [0.021, 0.08], [0.017, 0.16], [0.03, 0.3], [0.034, 0.4], [0.02, 0.54], [0.015, 0.68], [0.024, 0.8], [0.016, 0.88], [0.027, 0.93], [0.027, 1]];
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), HIGH ? 8 : 6);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const [area, list] of Object.entries(balusters)) {
    const inst = new THREE.InstancedMesh(geo, mat(area, 'trim'), list.length);
    list.forEach(([x, y, z, h], i) => inst.setMatrixAt(i, m4.compose(p.set(x, y, z), q, sc.set(1, h, 1))));
    inst.castShadow = HIGH;
    inst.receiveShadow = HIGH;
    scene.add(inst);
  }
}

// --------------------------------------------------------------------------
// Doors

class Door {
  constructor(scene, { id, level, axis, x, z, width = 1.2, locked = false, lockedText = '', area, swing = 1 }) {
    this.id = id;
    this.locked = locked;
    this.lockedText = lockedText;
    this.open = false;
    this.angle = 0;
    this.swing = swing;
    const L = LEVEL[level];
    const m = mat(area, 'door');
    this.pivot = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? width - 0.04 : 0.07, DOOR_H - 0.03, axis === 'x' ? 0.07 : width - 0.04), m);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a2a }));
    if (axis === 'x') {
      this.pivot.position.set(x - width / 2, L, z);
      leaf.position.set(width / 2, DOOR_H / 2, 0);
      knob.position.set(width / 2 - 0.15, -0.1, 0.06); // relative to the leaf's centre, near the latch edge
    } else {
      this.pivot.position.set(x, L, z - width / 2);
      leaf.position.set(0, DOOR_H / 2, width / 2);
      knob.position.set(0.06, -0.1, width / 2 - 0.15);
    }
    leaf.add(knob);
    const knob2 = knob.clone();
    knob2.position.multiply(new THREE.Vector3(axis === 'x' ? 1 : -1, 1, axis === 'x' ? -1 : 1));
    leaf.add(knob2);
    this.pivot.add(leaf);
    scene.add(this.pivot);
    this.leaf = leaf;
    this.collider = axis === 'x'
      ? addCollider(x - width / 2, L, z - 0.06, x + width / 2, L + DOOR_H, z + 0.06)
      : addCollider(x - 0.06, L, z - width / 2, x + 0.06, L + DOOR_H, z + width / 2);
    this.pos = new THREE.Vector3(x, L + 1.2, z);
    leaf.userData.door = this;
    staticMeshes.push(leaf);
    interactables.push({
      mesh: leaf,
      prompt: () => (this.locked ? 'Try the door' : this.open ? 'Close door' : 'Open door'),
      use: () => this.onUse?.(this),
    });
  }

  setOpen(open) {
    this.open = open;
    this.collider.active = !open;
  }

  update(dt) {
    const target = this.open ? (Math.PI / 2) * this.swing : 0;
    this.angle += (target - this.angle) * Math.min(1, dt * (this.speed || 5));
    this.pivot.rotation.y = this.angle;
  }
}

const DOORS = [
  { id: 'front', level: 'G', axis: 'x', x: 0, z: 10, width: 1.6, area: 'foyer', locked: true, lockedText: 'The front door will not open. Something holds it shut.' },
  { id: 'drawing', level: 'G', axis: 'z', x: -4, z: 6, width: 1.4, area: 'foyer' },
  { id: 'library', level: 'G', axis: 'z', x: -4, z: -1, width: 1.4, area: 'staircase' },
  { id: 'dining', level: 'G', axis: 'z', x: 4, z: 6, width: 1.4, area: 'foyer', swing: -1 },
  { id: 'kitchen', level: 'G', axis: 'z', x: 4, z: -1, width: 1.4, area: 'staircase', swing: -1 },
  { id: 'drawing_library', level: 'G', axis: 'x', x: -9, z: 2, width: 1.4, area: 'drawing' },
  { id: 'library_study', level: 'G', axis: 'x', x: -9, z: -4, width: 1.2, area: 'library' },
  { id: 'dining_kitchen', level: 'G', axis: 'x', x: 7, z: 2, width: 1.2, area: 'dining' },
  { id: 'kitchen_conservatory', level: 'G', axis: 'x', x: 5.2, z: -4, width: 1.2, area: 'kitchen', swing: -1 },
  { id: 'cellar', level: 'G', axis: 'z', x: 7, z: -3.3, width: 1.4, area: 'kitchen', locked: true, lockedText: 'Locked. The key must be somewhere in the Kitchen.' },
  { id: 'back', level: 'G', axis: 'x', x: -2.5, z: -10, width: 1.2, area: 'staircase' },
  { id: 'conservatory_garden', level: 'G', axis: 'x', x: 9, z: -10, width: 1.4, area: 'conservatory' },
  { id: 'master', level: 'U', axis: 'z', x: -6, z: -2, width: 1.2, area: 'hall' },
  { id: 'bathroom', level: 'U', axis: 'z', x: -6, z: 6, width: 1.2, area: 'hall' },
  { id: 'bird', level: 'U', axis: 'z', x: 6, z: -2, width: 1.2, area: 'hall', swing: -1 },
  { id: 'nursery', level: 'U', axis: 'z', x: 6, z: 6, width: 1.2, area: 'hall', swing: -1 },
];

// Moulded casings around every doorway, on both sides, with a cornice cap over the head.
function buildCasings(batch) {
  for (const d of DOORS) {
    const L = LEVEL[d.level], w = d.width, half = w / 2;
    for (const dir of [1, -1]) {
      const a = d.axis === 'x' ? areaAt(d.level, d.x, d.z + dir * 0.5) : areaAt(d.level, d.x + dir * 0.5, d.z);
      if (!a || AREAS[a].outside) continue;
      const m = mat(a, 'trim');
      const f = (d.axis === 'x' ? d.z : d.x) + dir * T / 2;
      const along = d.axis === 'x' ? d.x : d.z;
      const part = (a0, a1, y0, y1, depth) => {
        const f1 = f + dir * depth;
        if (d.axis === 'x') batch.solid(m, along + a0, y0, f, along + a1, y1, f1);
        else batch.solid(m, f, y0, along + a0, f1, y1, along + a1);
      };
      part(-half - 0.12, -half, L, L + DOOR_H + 0.12, 0.035);
      part(half, half + 0.12, L, L + DOOR_H + 0.12, 0.035);
      part(-half - 0.12, half + 0.12, L + DOOR_H, L + DOOR_H + 0.14, 0.035);
      part(-half - 0.18, half + 0.18, L + DOOR_H + 0.14, L + DOOR_H + 0.2, 0.065);
      // plinth blocks at the foot of each jamb
      part(-half - 0.13, -half, L, L + 0.22, 0.045);
      part(half, half + 0.13, L, L + 0.22, 0.045);
    }
  }
}

// --------------------------------------------------------------------------
// Furniture and details

function prop(batch, area, kind, x0, y0, z0, x1, y1, z1, collide = true) {
  const m = mat(area, kind);
  batch.box(x0, y0, z0, x1, y1, z1, { px: m, nx: m, pz: m, nz: m, py: m });
  if (collide) addCollider(x0, y0, z0, x1, y1 + 0.01, z1);
}

function buildProps(batch, scene) {
  const U = LEVEL.U, C = LEVEL.C;
  // Foyer: grandfather clock, umbrella stand, console table
  prop(batch, 'foyer', 'darkwood', -3.88, 0, 2.9, -3.38, 2.3, 3.5);
  prop(batch, 'foyer', 'darkwood', -3.9, 2.3, 2.85, -3.33, 2.42, 3.55, false);
  anchors.clock = new THREE.Vector3(-3.36, 1.75, 3.2);
  prop(batch, 'foyer', 'metal', 2.4, 0, 9.2, 2.8, 0.75, 9.6);
  anchors.umbrellaStand = new THREE.Vector3(2.6, 0.8, 9.4);
  prop(batch, 'foyer', 'darkwood', 3.4, 0.78, 4, 3.9, 0.85, 5.6);
  for (const z of [4.05, 5.5]) prop(batch, 'foyer', 'darkwood', 3.45, 0, z, 3.52, 0.78, z + 0.06, false);
  addCollider(3.4, 0, 4, 3.9, 0.86, 5.6);

  // Grand staircase hall: a side table, a long case, the fireplace under the landing
  prop(batch, 'staircase', 'darkwood', -3.9, 0, -4.5, -3.3, 0.9, -2.8);
  prop(batch, 'staircase', 'darkwood', 3.3, 0, -9.9, 3.9, 1.0, -7.5);
  buildFireplace(batch, scene);
  sheeted(scene, 'staircase', -0.9, -8.9, 0.85, 0.95, 0.85, 0.4);
  sheeted(scene, 'staircase', 2.75, -8.6, 0.85, 0.95, 0.85, -0.5);

  // Drawing room: fireplace, sofa and armchairs under dust sheets, table
  prop(batch, 'drawing', 'stone', -14, 0, 4.9, -13.4, 1.4, 7.1);
  prop(batch, 'drawing', 'stone', -14, 1.4, 4.75, -13.3, 1.48, 7.25, false);
  prop(batch, 'drawing', 'soot', -13.45, 0, 5.4, -13.39, 0.9, 6.6, false);
  sheeted(scene, 'drawing', -9.55, 6, 1.6, 0.9, 0.9, -Math.PI / 2, true);
  sheeted(scene, 'drawing', -11.6, 3.6, 0.8, 0.95, 0.8, -0.9);
  sheeted(scene, 'drawing', -11.6, 8.4, 0.8, 0.95, 0.8, Math.PI + 0.9);
  prop(batch, 'drawing', 'darkwood', -12.2, 0, 5.6, -11.3, 0.5, 6.4);
  prop(batch, 'drawing', 'darkwood', -6, 0, 9.4, -4.3, 1.0, 9.9);
  anchors.fatherPortrait = new THREE.Vector3(-13.87, 2.28, 6);

  // Library: shelves along the west wall and the north side, reading chair, table
  prop(batch, 'library', 'books', -13.95, 0, -3.8, -13.5, 2.6, 1.8);
  prop(batch, 'library', 'books', -13.4, 0, -3.95, -10, 2.6, -3.55);
  prop(batch, 'library', 'books', -8, 0, -3.95, -4.6, 2.6, -3.55);
  for (const [x0, z0, x1, z1] of [[-13.98, -3.85, -13.45, 1.85], [-13.45, -3.98, -9.95, -3.5], [-8.05, -3.98, -4.55, -3.5]]) prop(batch, 'library', 'darkwood', x0, 2.6, z0, x1, 2.72, z1, false);
  prop(batch, 'library', 'darkwood', -9.8, 0, -1.2, -8.2, 0.78, 0.2);
  prop(batch, 'library', 'fabric', -7, 0, 0.6, -6.2, 0.9, 1.4);

  // Study: desk, chair, the tall bookcase on the west wall (the Writing Room is behind it)
  prop(batch, 'study', 'darkwood', -9.8, 0, -8.6, -8, 0.8, -7.6);
  anchors.studyDesk = new THREE.Vector3(-8.9, 0.82, -8.1);
  prop(batch, 'study', 'fabric', -9.2, 0, -7.4, -8.6, 0.55, -6.8);
  prop(batch, 'study', 'books', -13.95, 0, -8.6, -13.5, 2.8, -5.4);
  anchors.studyBookcase = new THREE.Vector3(-13.6, 1.4, -7);
  prop(batch, 'study', 'books', -6.5, 0, -9.95, -4.2, 2.4, -9.5);

  // Dining room: long table, chairs, sideboard, dumbwaiter hatch
  prop(batch, 'dining', 'darkwood', 6.5, 0.7, 5.5, 11.5, 0.78, 6.7, false);
  for (const [x, z] of [[6.7, 5.7], [11.3, 5.7], [6.7, 6.5], [11.3, 6.5]]) prop(batch, 'dining', 'darkwood', x - 0.06, 0, z - 0.06, x + 0.06, 0.7, z + 0.06, false);
  addCollider(6.5, 0, 5.5, 11.5, 0.79, 6.7);
  for (let i = 0; i < 4; i++) {
    const x = 7 + i * 1.3;
    for (const [z0, z1, bz0, bz1] of [[4.7, 5.1, 4.68, 4.76], [7.1, 7.5, 7.44, 7.52]]) {
      prop(batch, 'dining', 'fabric', x, 0.42, z0, x + 0.45, 0.5, z1, false);
      prop(batch, 'dining', 'darkwood', x, 0, bz0, x + 0.45, 1.05, bz1, false);
      for (const lx of [x + 0.03, x + 0.38]) for (const lz of [z0 + 0.03, z1 - 0.07]) prop(batch, 'dining', 'darkwood', lx, 0, lz, lx + 0.04, 0.42, lz + 0.04, false);
      addCollider(x, 0, z0, x + 0.45, 1.0, z1);
    }
  }
  prop(batch, 'dining', 'darkwood', 13.5, 0, 4, 13.95, 0.9, 8);
  prop(batch, 'dining', 'metal', 10.4, 0.9, 2.1, 11.6, 1.8, 2.12, false);
  anchors.dumbwaiterDining = new THREE.Vector3(11, 1.35, 2.2);

  // Kitchen: counters on the south and east walls, stove, table, drawers, crank
  prop(batch, 'kitchen', 'wood', 8, 0, 1.4, 12, 0.9, 1.95);
  prop(batch, 'kitchen', 'white', 8, 0.9, 1.4, 12, 0.94, 1.95, false);
  prop(batch, 'kitchen', 'metal', 13.3, 0, -2.4, 13.95, 0.95, -0.4);
  prop(batch, 'kitchen', 'wood', 13.4, 0, -0.2, 13.95, 0.9, 1.95);
  prop(batch, 'kitchen', 'darkwood', 8.6, 0, -1.4, 10.4, 0.8, -0.3);
  prop(batch, 'kitchen', 'metal', 10.4, 0.9, 1.92, 11.6, 1.8, 1.95, false);
  anchors.dumbwaiterKitchen = new THREE.Vector3(11, 1.35, 1.85);
  anchors.kitchenDrawers = new THREE.Vector3(10, 0.6, 1.35);

  // Conservatory: plant stands with ferns in clay pots, a low bench
  const pots = [[6, -8.5], [12, -8.5], [6, -5.5], [12, -5.5]];
  for (const [x, z] of pots) prop(batch, 'conservatory', 'stone', x - 0.4, 0, z - 0.4, x + 0.4, 0.6, z + 0.4);
  prop(batch, 'conservatory', 'darkwood', 8.5, 0, -9.6, 10.5, 0.45, -9.1);

  // Portrait Hall: console tables
  prop(batch, 'hall', 'darkwood', -12, U, -6.4, -10.5, U + 0.85, -6.1);
  prop(batch, 'hall', 'darkwood', 10.5, U, -6.4, 12, U + 0.85, -6.1);
  anchors.hallMirror = new THREE.Vector3(-13.9, U + 1.6, -8);

  // Master bedroom: bed, wardrobe, dresser
  prop(batch, 'master', 'darkwood', -13.9, U, -3.2, -11.6, U + 0.55, -0.8);
  prop(batch, 'master', 'linen', -13.8, U + 0.55, -3.1, -11.7, U + 0.7, -0.9, false);
  prop(batch, 'master', 'darkwood', -13.95, U, -3.4, -13.75, U + 1.4, -0.6);
  prop(batch, 'master', 'darkwood', -9, U, -5.95, -7, U + 2.2, -5.3);
  anchors.wardrobe = new THREE.Vector3(-8, U + 1.3, -5.25);
  prop(batch, 'master', 'darkwood', -13.9, U, 0.8, -13.3, U + 0.9, 1.9);

  // Bathroom: bath, basin, mirror
  prop(batch, 'bathroom', 'white', -13.9, U, 7.5, -12.2, U + 0.6, 9.9);
  prop(batch, 'bathroom', 'white', -9, U, 9.5, -8.2, U + 0.85, 9.95);
  anchors.bathMirror = new THREE.Vector3(-8.6, U + 1.6, 9.88);

  // Bird Room: narrow bed, boarded window (east), scratches (later)
  prop(batch, 'bird', 'darkwood', 12, U, -5.8, 13.9, U + 0.45, -3.8);
  prop(batch, 'bird', 'linen', 12.05, U + 0.45, -5.75, 13.85, U + 0.55, -3.85, false);
  anchors.birdScratches = new THREE.Vector3(13.88, U + 1.1, -4.8);
  anchors.birdFloor = new THREE.Vector3(12.9, U, -3.2);

  // Nursery: crib, rocking horse, small table with the music box
  prop(batch, 'nursery', 'wood', 12.4, U, 8, 13.9, U + 1.0, 9.9);
  prop(batch, 'nursery', 'wood', 9, U, 9, 9.9, U + 0.8, 9.4);
  prop(batch, 'nursery', 'wood', 7, U, 3, 7.8, U + 0.7, 3.8);
  anchors.musicBox = new THREE.Vector3(7.4, U + 0.78, 3.4);

  // Cellar: shelves, barrels, fuse box
  prop(batch, 'cellar', 'darkwood', 4.05, C, -9.9, 4.6, C + 2.2, -5);
  for (const [x, z] of [[6, -9], [7, -9], [6.5, -8]]) prop(batch, 'cellar', 'wood', x - 0.35, C, z - 0.35, x + 0.35, C + 0.95, z + 0.35);
  prop(batch, 'cellar', 'metal', 13.85, C + 1.2, -8, 13.95, C + 2.0, -7.2, false);
  anchors.fuseBox = new THREE.Vector3(13.8, C + 1.6, -7.6);
  prop(batch, 'cellar', 'darkwood', 4.05, C, -1.5, 4.6, C + 2.2, 1.9);

  // Garden: perimeter wall, iron gate, bench. The plants are built in garden.js.
  const gw = (x0, z0, x1, z1) => prop(batch, 'garden', 'wall', x0, 0, z0, x1, 4.2, z1);
  gw(-18.2, -30.2, -18, -10);
  gw(18, -30.2, 18.2, -10);
  gw(-18.2, -30.2, -1, -30);
  gw(1, -30.2, 18.2, -30);
  gw(-18.2, -10.1, -14, -9.9);
  gw(14, -10.1, 18.2, -9.9);
  prop(batch, 'garden', 'metal', -1, 0, -30.15, 1, 3.2, -30.05);   // locked iron gate
  anchors.gardenGate = new THREE.Vector3(0, 1.5, -29.9);
  prop(batch, 'garden', 'darkwood', -7, 0, -24.3, -5, 0.5, -23.8);
  anchors.gardenBench = new THREE.Vector3(-6, 0.6, -24);
  anchors.roseBushes = [];
  for (let i = 0; i < 9; i++) {
    const x = -10 + (i % 3) * 3.4 + (i > 5 ? 9 : 0), z = -16 - Math.floor(i / 3) * 3.2;
    const white = i === 7; // the one white bush among the red ones
    anchors.roseBushes.push(new THREE.Vector3(x, 0.9, z));
    if (white) anchors.whiteRose = new THREE.Vector3(x, 0, z);
    addCollider(x - 0.45, 0, z - 0.45, x + 0.45, 0.91, z + 0.45);
  }
  buildGarden(scene, batch, { mat, followArea, addCollider, anchors, high: HIGH });
  buildPlants(scene, pots.map(([x, z]) => new THREE.Vector3(x, 0.6, z)), 'conservatory', { followArea });
}

// A fireplace under the landing, still burning. Nobody admits to lighting it.
let fire = null;
function buildFireplace(batch, scene) {
  const stone = mat('staircase', 'stone'), soot = mat('staircase', 'soot'), wood = mat('staircase', 'trim');
  batch.solid(stone, 0.05, 0, -10, 0.45, 1.05, -9.6);
  batch.solid(stone, 1.55, 0, -10, 1.95, 1.05, -9.6);
  batch.solid(stone, 0.05, 1.05, -10, 1.95, 1.35, -9.6);
  batch.solid(wood, -0.08, 1.35, -10, 2.08, 1.45, -9.5);
  batch.solid(soot, 0.45, 0, -10, 1.55, 1.05, -9.9);
  batch.box(-0.1, 0, -9.6, 2.1, 0.04, -9.1, { py: stone, pz: stone, px: stone, nx: stone });
  addCollider(0.05, 0, -10, 1.95, 1.45, -9.5);
  const bark = new THREE.MeshLambertMaterial({ color: 0x1a120c });
  for (const [dx, ry] of [[-0.15, 0.25], [0.18, -0.2]]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.75, 7), bark);
    log.rotation.set(0, ry, Math.PI / 2);
    log.position.set(1.0 + dx * 0.4, 0.1, -9.78 + dx * 0.1);
    scene.add(log);
  }
  const ember = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ color: 0x9a2a08 }));
  ember.rotation.x = -Math.PI / 2;
  ember.position.set(1.0, 0.045, -9.76);
  scene.add(ember);
  // Flames: a little canvas redrawn a few times a second on three crossed planes
  const c = document.createElement('canvas');
  c.width = 64; c.height = 96;
  const map = new THREE.CanvasTexture(c);
  const fm = new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const flames = new THREE.Group();
  for (const ry of [0, 0.9, -0.9]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), fm);
    f.rotation.y = ry;
    flames.add(f);
  }
  flames.position.set(1.0, 0.45, -9.76);
  scene.add(flames);
  const light = new THREE.PointLight(0xff7a30, 0, 8, 2);
  light.position.set(1.0, 0.75, -9.2);
  scene.add(light);
  fire = { c, ctx: c.getContext('2d'), map, light, ember, t: 0, next: 0 };
}

function drawFlames(f) {
  const { ctx } = f;
  ctx.clearRect(0, 0, 64, 96);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const x = 14 + Math.random() * 36, h = 30 + Math.random() * 55, w = 6 + Math.random() * 10;
    const g = ctx.createLinearGradient(0, 96, 0, 96 - h);
    g.addColorStop(0, 'rgba(255,170,60,0.55)'); g.addColorStop(0.5, 'rgba(230,90,20,0.35)'); g.addColorStop(1, 'rgba(120,20,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - w, 96); ctx.quadraticCurveTo(x - w * 0.6 + Math.random() * 6, 96 - h * 0.6, x + Math.random() * 6 - 3, 96 - h); ctx.quadraticCurveTo(x + w * 0.6, 96 - h * 0.5, x + w, 96); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  f.map.needsUpdate = true;
}

// Furniture under a dust sheet: a deformed box, soft at the top and flared where it meets the floor.
function sheeted(scene, area, x, z, w, h, d, rotY, sofa = false) {
  const geo = new THREE.BoxGeometry(w, h, d, 8, 8, 8);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const t = (vy + h / 2) / h;                                    // 0 at the floor, 1 at the top
    const back = vz < -d * 0.15;                                   // the back stands taller than the seat
    const top = back ? h : h * (sofa ? 0.5 : 0.55);
    vy = -h / 2 + t * top;
    const flare = 1 + Math.max(0, 0.25 - t) * 0.5;
    const round = 1 - Math.max(0, t - 0.75) * 0.35;
    vx *= flare * round;
    vz *= flare * round;
    vx += Math.sin(vz * 13 + vy * 4) * 0.018 * (1 - t);
    vz += Math.sin(vx * 11 + vy * 5) * 0.018 * (1 - t);
    vy += Math.sin(vx * 9) * Math.cos(vz * 7) * 0.012;
    p.setXYZ(i, vx, vy + h / 2, vz);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat(area, 'sheet'));
  mesh.position.set(x, LEVEL[AREAS[area].level], z);
  mesh.rotation.y = rotY;
  mesh.castShadow = HIGH;
  mesh.receiveShadow = HIGH;
  scene.add(mesh);
  const r = Math.max(w, d) / 2;
  const ex = Math.abs(Math.cos(rotY)) * w / 2 + Math.abs(Math.sin(rotY)) * d / 2;
  const ez = Math.abs(Math.sin(rotY)) * w / 2 + Math.abs(Math.cos(rotY)) * d / 2;
  addCollider(x - Math.min(ex, r), mesh.position.y, z - Math.min(ez, r), x + Math.min(ex, r), mesh.position.y + h, z + Math.min(ez, r));
}

// Windows: dark panes glowing faintly with moonlight, moulded frames and glazing bars,
// velvet drapes, and moonlight falling through the tall ones. The Bird Room window is boarded.
// [axis of the wall, x, level, z, drapes, moonlight]
const WINDOWS = [
  ['x', -13.88, 'G', 4, true, true], ['x', -13.88, 'G', 8, true], ['x', -13.88, 'G', -1], ['x', -13.88, 'G', -7.5],
  ['x', 13.88, 'G', 4, true, true], ['x', 13.88, 'G', 8, true], ['x', 13.88, 'G', -6.5],
  ['x', -13.88, 'U', -3], ['x', -13.88, 'U', 5, true], ['x', 13.88, 'U', 6, true],
  ['z', -10, 'U', -9.88, true, true], ['z', 10, 'U', -9.88, true], ['z', -6, 'U', -9.88, true], ['z', 6, 'U', -9.88, true, true],
  ['z', -2, 'U', 9.88, false, true], ['z', 2, 'U', 9.88, false, true],
];

function windowFrame(batch, [axis, wx, level, wz]) {
  const L = LEVEL[level];
  const n = axis === 'x' ? (wx < 0 ? 1 : -1) : (wz > 0 ? -1 : 1);
  const area = axis === 'x' ? areaAt(level, wx + n * 0.5, wz) : matArea(level, wx, wz + n * 0.5);
  const m = mat(area, 'trim');
  const face = (axis === 'x' ? Math.sign(wx) * 13.9 : Math.sign(wz) * 9.9);
  const along = axis === 'x' ? wz : wx;
  const part = (a0, a1, y0, y1, d0, d1) => {
    if (axis === 'x') batch.solid(m, face + n * d0, L + y0, along + a0, face + n * d1, L + y1, along + a1);
    else batch.solid(m, along + a0, L + y0, face + n * d0, along + a1, L + y1, face + n * d1);
  };
  part(-0.66, -0.55, 0.82, 2.62, 0, 0.05);
  part(0.55, 0.66, 0.82, 2.62, 0, 0.05);
  part(-0.66, 0.66, 2.5, 2.64, 0, 0.05);
  part(-0.72, 0.72, 0.8, 0.88, 0, 0.14);          // sill
  part(-0.02, 0.02, 0.9, 2.5, 0.01, 0.04);        // glazing bars
  for (const y of [1.43, 1.97]) part(-0.55, 0.55, y - 0.015, y + 0.015, 0.01, 0.04);
  return { n, area, face, along, L };
}

function buildWindows(batch, scene) {
  const glassMat = new THREE.MeshBasicMaterial({ map: tex('glass', [], 1.2), color: 0x34445e });
  const boardMat = new THREE.MeshLambertMaterial({ map: tex('boards', [], 1.2) });
  followArea('bird', boardMat, 1);
  for (const w of WINDOWS) {
    const [axis, a, level, b, drapes, moon] = w;
    const f = windowFrame(batch, w);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6), glassMat);
    glass.position.set(a, f.L + 1.7, b);
    glass.rotation.y = axis === 'x' ? (a < 0 ? Math.PI / 2 : -Math.PI / 2) : (b > 0 ? Math.PI : 0);
    scene.add(glass);
    if (drapes) {
      const dm = mat(f.area, 'drape');
      dm.side = THREE.DoubleSide;
      const tm = mat(f.area, 'trim');
      // pelmet over the window
      if (axis === 'x') batch.solid(tm, f.face + f.n * 0.0, f.L + 2.72, b - 0.95, f.face + f.n * 0.16, f.L + 2.96, b + 0.95);
      else batch.solid(tm, a - 0.95, f.L + 2.72, f.face, a + 0.95, f.L + 2.96, f.face + f.n * 0.16);
      for (const s of [-1, 1]) {
        const geo = new THREE.PlaneGeometry(0.44, 2.7, 14, 1);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / 0.44 + 0.5) * Math.PI * 8) * 0.03 + 0.035);
        geo.computeVertexNormals();
        const c = new THREE.Mesh(geo, dm);
        c.position.copy(glass.position);
        c.position.y = f.L + 1.37;
        c.rotation.y = glass.rotation.y;
        c.translateX(s * 0.64);
        c.translateZ(0.07);
        c.castShadow = HIGH;
        scene.add(c);
      }
    }
    if (moon) moonShaft(scene, glass, f, axis);
  }
  const boarded = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.7), boardMat);
  boarded.position.set(13.88, 3.4 + 1.7, -2);
  boarded.rotation.y = -Math.PI / 2;
  scene.add(boarded);
}

// A faint shaft of moonlight from a window down to the floor, with dust drifting in it.
const motes = [];
let shaftMat = null;
function moonShaft(scene, glass, f, axis) {
  const inward = axis === 'x' ? new THREE.Vector3(f.n, 0, 0) : new THREE.Vector3(0, 0, f.n);
  const lateral = axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const floorY = f.L === LEVEL.U && Math.abs(glass.position.x) < 4 && glass.position.z > 0 ? 0 : f.L;
  const drop = floorY < f.L ? 0.9 : 0.62;
  const dir = inward.clone().add(new THREE.Vector3(0, -drop, 0)).addScaledVector(lateral, 0.12);
  const k = (glass.position.y + 0.75 - floorY) / drop;
  const near = [];
  for (const [u, v] of [[-0.5, -0.75], [0.5, -0.75], [0.5, 0.75], [-0.5, 0.75]]) near.push(glass.position.clone().addScaledVector(lateral, u).add(new THREE.Vector3(0, v, 0)).addScaledVector(inward, 0.03));
  const far = near.map((p) => p.clone().addScaledVector(dir, k));
  const pos = [], fade = [], idx = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, base = pos.length / 3;
    for (const [p, a] of [[near[i], 1], [near[j], 1], [far[j], 0], [far[i], 0]]) { pos.push(p.x, p.y, p.z); fade.push(a); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('fade', new THREE.Float32BufferAttribute(fade, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  shaftMat ||= new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0.03, 0.036, 0.05) } },
    // Faces seen edge-on fade out, so the shaft has soft sides instead of hard planes.
    vertexShader: `attribute float fade; varying float vFade; varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vFade = fade; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vFade; varying vec3 vN; varying vec3 vV;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        gl_FragColor = vec4(uColor * vFade * vFade * pow(facing, 2.5), 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  scene.add(new THREE.Mesh(geo, shaftMat));
  // dust motes inside the shaft
  const count = HIGH ? 70 : 30;
  const mp = new Float32Array(count * 3);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const t = Math.random() * 0.8;
    const p = glass.position.clone().addScaledVector(lateral, Math.random() - 0.5).add(new THREE.Vector3(0, Math.random() * 1.5 - 0.75, 0)).addScaledVector(dir, k * t);
    mp.set([p.x, p.y, p.z], i * 3);
    seeds.push([p.clone(), Math.random() * 10]);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const pts = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0x5a5f66, size: 0.011, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(pts);
  motes.push({ pts, seeds });
}

// Framed pictures: a photo or painting with a 3D gilt frame, and a brass name plate for people.
const giltMats = {};
function framed(scene, area, map, pos, rotY, w, h, name) {
  const m = new THREE.MeshLambertMaterial({ map, emissive: WARM.clone(), emissiveMap: map });
  followArea(area, m, 1.05);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  pic.position.copy(pos);
  pic.rotation.y = rotY;
  if (!giltMats[area]) {
    const gt = tex('gilt', [], 1, 128);
    giltMats[area] = new THREE.MeshLambertMaterial({ map: gt, emissive: WARM.clone(), emissiveMap: gt });
    followArea(area, giltMats[area], 1.1);
  }
  const t = 0.085, d = 0.055;
  for (const [bw, bh, x, y] of [[w + 2 * t, t, 0, h / 2 + t / 2], [w + 2 * t, t, 0, -h / 2 - t / 2], [t, h, -w / 2 - t / 2, 0], [t, h, w / 2 + t / 2, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, d), giltMats[area]);
    b.position.set(x, y, d / 2 - 0.018);
    b.castShadow = HIGH;
    pic.add(b);
  }
  scene.add(pic);
  if (name) {
    const pt = plaque(name);
    const pm = new THREE.MeshLambertMaterial({ map: pt, emissive: WARM.clone(), emissiveMap: pt });
    followArea(area, pm, 1.2);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.09), pm);
    pl.position.copy(pos);
    pl.rotation.y = rotY;
    pl.translateY(-h / 2 - t - 0.11);
    pl.translateZ(0.004);
    scene.add(pl);
  }
  return pic;
}

// Only the Williams men we have photographs of hang in the house, each named on a plate.
// hallEyes: where each face's eyes are in its source photo (pixels), for the watching portrait.
function buildPortraits(scene) {
  const U = LEVEL.U;
  anchors.portraits = {};
  anchors.portraits.father = framed(scene, 'drawing', portrait('assets/portraits/steven_iii.jpg'), anchors.fatherPortrait, Math.PI / 2, 1.0, 1.25, 'Steven Williams III and Mrs Williams');
  anchors.portraits.iv = framed(scene, 'hall', portrait('assets/portraits/steven_iv.jpg'), new THREE.Vector3(0, U + 1.85, -9.87), 0, 1.0, 1.25, 'Steven Williams IV');
  anchors.portraits.hall = [
    framed(scene, 'hall', portrait('assets/portraits/steven_i.jpg'), new THREE.Vector3(-8, U + 1.78, -9.87), 0, 0.9, 1.12, 'Steven Williams I'),
    framed(scene, 'hall', portrait('assets/portraits/steven_ii.jpg'), new THREE.Vector3(8, U + 1.78, -9.87), 0, 0.9, 1.12, 'Steven Williams II'),
  ];
  anchors.portraits.hallEyes = [
    [{ x: 210, y: 366, rx: 22, ry: 11, ri: 9 }, { x: 369, y: 370, rx: 24, ry: 11, ri: 9 }],
    [{ x: 371, y: 384, rx: 17, ry: 7, ri: 6.5 }, { x: 450, y: 386, rx: 20, ry: 7, ri: 6.5 }],
  ];
  // Paintings without people
  framed(scene, 'hall', painting('moor'), new THREE.Vector3(-3.4, U + 1.85, -9.87), 0, 1.2, 0.9);
  framed(scene, 'hall', painting('sea'), new THREE.Vector3(3.4, U + 1.85, -9.87), 0, 1.2, 0.9);
  framed(scene, 'foyer', painting('manor'), new THREE.Vector3(3.87, 1.85, 4.8), -Math.PI / 2, 1.1, 0.82);
  framed(scene, 'staircase', painting('moor'), new THREE.Vector3(1.0, 2.25, -9.87), 0, 1.0, 0.75);
  framed(scene, 'staircase', painting('harbour'), new THREE.Vector3(-3.87, 2.0, -6.8), Math.PI / 2, 1.0, 0.75);
  framed(scene, 'staircase', painting('stormsea'), new THREE.Vector3(3.87, 2.0, -6.8), -Math.PI / 2, 1.0, 0.75);
  framed(scene, 'dining', painting('moorland'), new THREE.Vector3(9, 1.85, 9.87), Math.PI, 1.4, 1.0);
}

// A floor medallion of inlaid wood in the middle of the foyer
function buildMedallion(scene) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const R = S / 2;
  const woods = ['#5a3a20', '#2a1a0e', '#7a5530', '#3a2414'];
  ctx.translate(R, R);
  ctx.fillStyle = '#2a1a0e'; ctx.beginPath(); ctx.arc(0, 0, R * 0.98, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a5530'; ctx.beginPath(); ctx.arc(0, 0, R * 0.93, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2414'; ctx.beginPath(); ctx.arc(0, 0, R * 0.88, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, b = a + Math.PI / 16;
    ctx.fillStyle = woods[i % 2 ? 0 : 2];
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R * 0.84, Math.sin(a) * R * 0.84); ctx.lineTo(Math.cos(b) * R * 0.36, Math.sin(b) * R * 0.36); ctx.closePath(); ctx.fill();
    ctx.fillStyle = woods[i % 2 ? 2 : 0];
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(b) * R * 0.36, Math.sin(b) * R * 0.36); ctx.lineTo(Math.cos(a + Math.PI / 8) * R * 0.84, Math.sin(a + Math.PI / 8) * R * 0.84); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
  for (const k of [0.36, 0.84, 0.88, 0.93]) { ctx.beginPath(); ctx.arc(0, 0, R * k, 0, Math.PI * 2); ctx.stroke(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(${Math.random() > 0.6 ? '170,150,120' : '0,0,0'},${Math.random() * 0.12})`; ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const m = new THREE.MeshLambertMaterial({ map, transparent: true, emissive: WARM.clone(), emissiveMap: map, polygonOffset: true, polygonOffsetFactor: -1 });
  followArea('foyer', m, 1);
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.003, 6.2);
  mesh.receiveShadow = HIGH;
  scene.add(mesh);
}

function buildLamps(scene) {
  const metal = new THREE.MeshLambertMaterial({ color: 0x2a2218, emissive: 0x3a2a14 });
  for (const [id, a] of Object.entries(AREAS)) {
    if (!a.lamp) continue;
    const cordTop = id === 'foyer' || id === 'staircase' ? 6.6 : LEVEL[a.level] + H;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, cordTop - a.lamp[1]), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    cord.position.set(a.lamp[0], (cordTop + a.lamp[1]) / 2, a.lamp[2]);
    scene.add(cord);
    if (a.chandelier) {
      // Wrought chandelier: a ring of candle bulbs on curved arms
      const g = new THREE.Group();
      g.position.set(...a.lamp);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.018, 6, 40), metal);
      ring.rotation.x = Math.PI / 2;
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.014, 6, 28), metal);
      ring2.rotation.x = Math.PI / 2;
      ring2.position.y = 0.32;
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), metal);
      hub.position.y = -0.12;
      g.add(ring, ring2, hub);
      followArea(id, metal, 0.4);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2, x = Math.cos(ang) * 0.62, z = Math.sin(ang) * 0.62;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.66), metal);
        arm.position.set(x / 2, -0.06, z / 2);
        arm.rotation.set(0, -ang, Math.PI / 2 - 0.25);
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), new THREE.MeshLambertMaterial({ color: 0xd8cfb8, emissive: 0x3a3020 }));
        candle.position.set(x, 0.07, z);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshBasicMaterial({ color: LAMP_ON.clone() }));
        bulb.position.set(x, 0.15, z);
        bulb.scale.y = 1.5;
        g.add(arm, candle, bulb);
        (lampMeshes[id] ||= []).push(bulb);
      }
      scene.add(g);
      continue;
    }
    const m = new THREE.MeshBasicMaterial({ color: LAMP_ON.clone() });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 0.25, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0x3a2a18, side: THREE.DoubleSide }));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m);
    shade.position.set(...a.lamp);
    bulb.position.set(a.lamp[0], a.lamp[1] - 0.08, a.lamp[2]);
    scene.add(shade, bulb);
    (lampMeshes[id] ||= []).push(bulb);
  }
}

// --------------------------------------------------------------------------

export function buildHouse(scene, { shadows }) {
  const batch = new Batch();
  buildWalls(batch);
  buildSlabs(batch);
  buildStairs(batch, scene);
  buildCasings(batch);
  buildProps(batch, scene);
  buildWindows(batch, scene);
  batch.build(scene, shadows);
  buildBalusters(scene);
  for (const d of DOORS) doors.push(new Door(scene, d));
  buildPortraits(scene);
  buildMedallion(scene);
  buildLamps(scene);
  for (const id of Object.keys(AREAS)) setAreaLight(id, 1);
  return { spawn: new THREE.Vector3(0, 0, 7.5), spawnYaw: 0 };
}

/** Per frame: the fire, drifting dust, the garden in the wind. `near` = the player is close to the fire. */
export function updateHouse(dt, near) {
  if (fire) {
    fire.t += dt;
    if (fire.t > fire.next) {
      fire.next = fire.t + 0.07;
      drawFlames(fire);
      fire.light.intensity = near ? 3.2 + Math.random() * 1.6 : 0;
      fire.ember.material.color.setRGB(0.55 + Math.random() * 0.15, 0.14, 0.03);
    }
  }
  const t = performance.now() / 1000;
  for (const m of motes) {
    const a = m.pts.geometry.attributes.position;
    for (let i = 0; i < m.seeds.length; i++) {
      const [p, s] = m.seeds[i];
      a.setXYZ(i, p.x + Math.sin(t * 0.21 + s) * 0.12, p.y + Math.sin(t * 0.13 + s * 2) * 0.18, p.z + Math.cos(t * 0.17 + s) * 0.12);
    }
    a.needsUpdate = true;
  }
  updateGarden(dt);
}

export function doorById(id) {
  return doors.find((d) => d.id === id);
}
