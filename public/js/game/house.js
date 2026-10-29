// Builds Williams Manor from boxes. Static geometry is batched per material (one draw
// call each); every room has its own materials so its "lamp light" can flicker or die
// on its own. Room light is faked with emissive maps (cheap, no light leaking through
// walls); the flashlights are real spotlights.
//
// Coordinates: metres. x runs west -> east, z runs north -> south (front door at z = +10).
// Levels: cellar y = -3.4, ground y = 0, upper y = 3.4. Rooms are 3.2 m tall.

import * as THREE from 'three';
import { tex, portrait } from './textures.js';

export const LEVEL = { C: -3.4, G: 0, U: 3.4 };
const H = 3.2;          // room height
const DOOR_H = 2.2;     // door opening height
const T = 0.2;          // wall thickness

// --------------------------------------------------------------------------
// Areas. rects are [x0, x1, z0, z1]. light = lamp brightness (0 = pitch dark).

export const AREAS = {
  foyer:        { name: 'Foyer', level: 'G', rects: [[-4, 4, 2, 10]], light: 0.5, lamp: [0, 5.2, 6],
                  wall: ['damask', ['#43201b', '#5a2a22']], floor: ['checker', ['#1e1b18', '#a99f8e']], ceil: ['plaster', ['#8f8676']] },
  staircase:    { name: 'Grand Staircase', level: 'G', rects: [[-4, 4, -10, 2]], light: 0.42, lamp: [0, 5.2, -2],
                  wall: ['damask', ['#43201b', '#5a2a22']], floor: ['wood', ['#4a2e1b']], ceil: ['plaster', ['#8f8676']] },
  drawing:      { name: 'Drawing Room', level: 'G', rects: [[-14, -4, 2, 10]], light: 0.45, lamp: [-9, 2.7, 6],
                  wall: ['damask', ['#24382b', '#2f4a38']], floor: ['wood', ['#5a3a22']], ceil: ['plaster', ['#958b7a']] },
  library:      { name: 'Library', level: 'G', rects: [[-14, -4, -4, 2]], light: 0.4, lamp: [-9, 2.7, -1],
                  wall: ['panel', ['#3d2617']], floor: ['carpet', ['#4a1414', '#6a2a1a']], ceil: ['plaster', ['#857b6b']] },
  study:        { name: 'Study', level: 'G', rects: [[-14, -4, -10, -4]], light: 0.38, lamp: [-9, 2.7, -7],
                  wall: ['panel', ['#352015']], floor: ['wood', ['#3b2516']], ceil: ['plaster', ['#857b6b']] },
  dining:       { name: 'Dining Room', level: 'G', rects: [[4, 14, 2, 10]], light: 0.45, lamp: [9, 2.7, 6],
                  wall: ['damask', ['#1d2a3d', '#283a52']], floor: ['wood', ['#55361f']], ceil: ['plaster', ['#958b7a']] },
  kitchen:      { name: 'Kitchen', level: 'G', rects: [[4, 14, -4, 2]], light: 0.5, lamp: [9, 2.7, -0.5],
                  wall: ['tiles', ['#c9c0a3', '#8a8169', 6]], floor: ['checker', ['#2a2622', '#b3a991']], ceil: ['plaster', ['#a39a88']] },
  conservatory: { name: 'Conservatory', level: 'G', rects: [[4, 14, -10, -4]], light: 0.45, powered: false, lamp: [9, 2.7, -7],
                  wall: ['glass', []], floor: ['tiles', ['#7a3f2a', '#3a2418', 4]], ceil: ['glass', []] },
  hall:         { name: 'Portrait Hall', level: 'U', rects: [[-14, 14, -10, -6], [-6, -4, -6, 10], [4, 6, -6, 10]], light: 0.38, lamp: [0, 6.1, -8],
                  wall: ['damask', ['#2f1d33', '#432a48']], floor: ['carpet', ['#3d1010', '#5e2a14']], ceil: ['plaster', ['#857b6b']] },
  master:       { name: 'Master Bedroom', level: 'U', rects: [[-14, -6, -6, 2]], light: 0.36, lamp: [-10, 6.1, -2],
                  wall: ['stripes', ['#5b3a40', '#4b2e33']], floor: ['wood', ['#4d311d']], ceil: ['plaster', ['#8f8676']] },
  bathroom:     { name: 'Bathroom', level: 'U', rects: [[-14, -6, 2, 10]], light: 0.42, lamp: [-10, 6.1, 6],
                  wall: ['tiles', ['#cfd2c8', '#8d928a', 8]], floor: ['tiles', ['#e3e0d4', '#55524a', 12]], ceil: ['plaster', ['#a8a090']] },
  bird:         { name: 'Bird Room', level: 'U', rects: [[6, 14, -6, 2]], light: 0,
                  wall: ['birds', []], floor: ['wood', ['#4a3420']], ceil: ['plaster', ['#7d7464']] },
  nursery:      { name: 'Nursery', level: 'U', rects: [[6, 14, 2, 10]], light: 0,
                  wall: ['nursery', []], floor: ['wood', ['#57402a']], ceil: ['plaster', ['#8d8676']] },
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

function painter(def) {
  const [kind, args] = def;
  const scale = { roses: 1, checker: 2, tiles: 2, stone: 2.5, flagstone: 2.5, grass: 3, carpet: 3, wood: 2.4, damask: 1.6, stripes: 1.6, birds: 1.4, nursery: 1.6, panel: 2, plaster: 3, glass: 2.4, brick: 2.5, plain: 2 }[kind] || 2;
  return tex(kind, args, scale);
}

const PROP_DEFS = {
  wood: ['wood', ['#3a2414']],
  darkwood: ['wood', ['#24160c']],
  fabric: ['fabric', ['#4a1d1d']],
  green: ['fabric', ['#22352a']],
  linen: ['fabric', ['#b9b2a2']],
  metal: ['plain', ['#2c2c2c']],
  stone: ['stone', ['#6a655c']],
  books: ['books', []],
  white: ['plain', ['#d8d4c8']],
  rail: ['wood', ['#2e1c10']],
  door: ['panel', ['#3a2414']],
  hedge: ['grass', []],
  bark: ['wood', ['#1c140e']],
  rose: ['roses', ['#7a121c']],
  whiterose: ['roses', ['#e6e1d3']],
  board: ['boards', []],
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
  for (const { mat: m, k } of areaMats[area] || []) m.emissiveIntensity = v * k;
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

function addCollider(x0, y0, z0, x1, y1, z1) {
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

function wallPiece(batch, level, axis, c, a0, a1, y0, y1, kind) {
  if (a1 - a0 < 0.01) return;
  const t = kind === 'rail' ? 0.12 : T;
  const [x0, x1, z0, z1] = axis === 'x' ? [a0, a1, c - t / 2, c + t / 2] : [c - t / 2, c + t / 2, a0, a1];
  const mid = (a0 + a1) / 2;
  let faces;
  if (kind === 'rail') {
    const m = mat(matArea(level, axis === 'x' ? mid : c + 0.5, axis === 'x' ? c + 0.5 : mid), 'rail');
    faces = { px: m, nx: m, pz: m, nz: m, py: m };
  } else {
    const L = LEVEL[level];
    const probe = (dx, dz) => mat(matArea(level, (axis === 'x' ? mid : c) + dx, (axis === 'x' ? c : mid) + dz), 'wall');
    const plus = axis === 'x' ? probe(0, 0.5) : probe(0.5, 0);
    const minus = axis === 'x' ? probe(0, -0.5) : probe(-0.5, 0);
    void L;
    faces = axis === 'x'
      ? { pz: plus, nz: minus, px: plus, nx: plus }
      : { px: plus, nx: minus, pz: plus, nz: plus };
  }
  batch.box(x0, y0, z0, x1, y1, z1, faces);
  addCollider(x0, y0, z0, x1, y1, z1);
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

  // Slab edges around the gallery, seen from the grand hall
  const edge = mat('staircase', 'rail');
  batch.box(-4.1, 3.2, -6, -3.9, 3.4, 10, { px: edge });
  batch.box(3.9, 3.2, -6, 4.1, 3.4, 10, { nx: edge });

  // Garden lawn
  batch.box(-18, -0.2, -30, 18, 0, -10, { py: mat('garden', 'floor') });
  surfaces.push({ x0: -18, x1: 18, z0: -30, z1: -10, y: 0 });
}

// --------------------------------------------------------------------------
// Stairs

function buildStairs(batch, scene) {
  // Grand staircase: rises north from z = 0 (ground) to z = -6 (upper landing)
  const steps = 14, run = 6 / steps, rise = 3.4 / steps;
  const tread = mat('staircase', 'floor'), side = mat('staircase', 'rail');
  for (let i = 0; i < steps; i++) {
    const z1 = -i * run, z0 = z1 - run;
    batch.box(-1.25, 0, z0, 1.25, (i + 1) * rise, z1, { py: tread, pz: side, px: side, nx: side });
  }
  surfaces.push({ x0: -1.25, x1: 1.25, z0: -6, z1: 0, axis: 'z', a0: 0, y0: 0, a1: -6, y1: 3.4 });
  addCollider(-1.4, 0, -6, -1.25, 4.6, 0);
  addCollider(1.25, 0, -6, 1.4, 4.6, 0);

  // Banisters
  const len = Math.hypot(6, 3.4), angle = Math.atan2(3.4, 6);
  const railMat = mat('staircase', 'rail');
  for (const x of [-1.32, 1.32]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, len), railMat);
    rail.position.set(x, 1.7 + 0.45, -3);
    rail.rotation.x = angle;
    rail.castShadow = true;
    scene.add(rail);
    staticMeshes.push(rail);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.16), railMat);
    post.position.set(x, 0.6, 0.05);
    scene.add(post);
  }

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
      knob.position.set(width - 0.15, DOOR_H / 2 - 0.1, 0.06);
    } else {
      this.pivot.position.set(x, L, z - width / 2);
      leaf.position.set(0, DOOR_H / 2, width / 2);
      knob.position.set(0.06, DOOR_H / 2 - 0.1, width - 0.15);
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

// --------------------------------------------------------------------------
// Furniture and details

function prop(batch, area, kind, x0, y0, z0, x1, y1, z1, collide = true) {
  const m = mat(area, kind);
  batch.box(x0, y0, z0, x1, y1, z1, { px: m, nx: m, pz: m, nz: m, py: m });
  if (collide) addCollider(x0, y0, z0, x1, y1 + 0.01, z1);
}

function buildProps(batch) {
  const U = LEVEL.U, C = LEVEL.C;
  // Foyer: grandfather clock, umbrella stand, console table, rug
  prop(batch, 'foyer', 'darkwood', -3.88, 0, 2.9, -3.38, 2.3, 3.5);
  anchors.clock = new THREE.Vector3(-3.36, 1.75, 3.2);
  prop(batch, 'foyer', 'metal', 2.4, 0, 9.2, 2.8, 0.75, 9.6);
  anchors.umbrellaStand = new THREE.Vector3(2.6, 0.8, 9.4);
  prop(batch, 'foyer', 'darkwood', 3.4, 0, 4, 3.9, 0.85, 5.6);
  prop(batch, 'foyer', 'fabric', -2, 0, 4, 2, 0.02, 8.5, false);

  // Grand staircase hall: a side table and a long case under the landing
  prop(batch, 'staircase', 'darkwood', -3.9, 0, -4.5, -3.3, 0.9, -2.8);
  prop(batch, 'staircase', 'darkwood', 3.3, 0, -9.9, 3.9, 1.0, -7.5);

  // Drawing room: fireplace, sofa, armchairs, table
  prop(batch, 'drawing', 'stone', -14, 0, 4.9, -13.4, 1.4, 7.1);
  prop(batch, 'drawing', 'metal', -13.45, 0, 5.4, -13.39, 0.9, 6.6, false);
  prop(batch, 'drawing', 'green', -10, 0, 5.2, -9.1, 0.85, 6.8);
  prop(batch, 'drawing', 'green', -12, 0, 3.2, -11.2, 0.9, 4.0);
  prop(batch, 'drawing', 'green', -12, 0, 8.0, -11.2, 0.9, 8.8);
  prop(batch, 'drawing', 'darkwood', -12.2, 0, 5.6, -11.3, 0.5, 6.4);
  prop(batch, 'drawing', 'darkwood', -6, 0, 9.4, -4.3, 1.0, 9.9);
  anchors.fatherPortrait = new THREE.Vector3(-13.87, 2.25, 6);

  // Library: shelves along the west wall and the north side, reading chair, table
  prop(batch, 'library', 'books', -13.95, 0, -3.8, -13.5, 2.6, 1.8);
  prop(batch, 'library', 'books', -13.4, 0, -3.95, -10, 2.6, -3.55);
  prop(batch, 'library', 'books', -8, 0, -3.95, -4.6, 2.6, -3.55);
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
  prop(batch, 'dining', 'darkwood', 6.5, 0, 5.5, 11.5, 0.78, 6.7);
  for (let i = 0; i < 4; i++) {
    const x = 7 + i * 1.3;
    prop(batch, 'dining', 'fabric', x, 0, 4.7, x + 0.45, 1.0, 5.1);
    prop(batch, 'dining', 'fabric', x, 0, 7.1, x + 0.45, 1.0, 7.5);
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

  // Conservatory: plant tables and pots
  for (const [x, z] of [[6, -8.5], [12, -8.5], [6, -5.5], [12, -5.5]]) {
    prop(batch, 'conservatory', 'stone', x - 0.4, 0, z - 0.4, x + 0.4, 0.6, z + 0.4);
    prop(batch, 'conservatory', 'hedge', x - 0.35, 0.6, z - 0.35, x + 0.35, 1.3, z + 0.35, false);
  }
  prop(batch, 'conservatory', 'darkwood', 8.5, 0, -9.6, 10.5, 0.45, -9.1);

  // Portrait Hall: console tables, a mirror frame
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

  // Garden: perimeter wall, hedges, bench, trees, rose beds
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
  for (const [x, z, w] of [[-16, -20, 2], [16, -18, 2], [-10, -28, 1.2], [10, -28, 1.2]]) prop(batch, 'garden', 'hedge', x - w / 2, 0, z - 4, x + w / 2, 1.8, z + 4);
  for (const [x, z] of [[-13, -14], [13, -26], [-14, -27], [6, -15]]) {
    prop(batch, 'garden', 'bark', x - 0.25, 0, z - 0.25, x + 0.25, 3.5, z + 0.25);
    prop(batch, 'garden', 'hedge', x - 1.4, 3.0, z - 1.4, x + 1.4, 5.2, z + 1.4, false);
  }
  anchors.roseBushes = [];
  for (let i = 0; i < 9; i++) {
    const x = -10 + (i % 3) * 3.4 + (i > 5 ? 9 : 0), z = -16 - Math.floor(i / 3) * 3.2;
    const white = i === 7; // the one white bush among the red ones
    prop(batch, 'garden', white ? 'whiterose' : 'rose', x - 0.45, 0, z - 0.45, x + 0.45, 0.9, z + 0.45);
    anchors.roseBushes.push(new THREE.Vector3(x, 0.9, z));
    if (white) anchors.whiteRose = new THREE.Vector3(x, 0, z);
  }
}

// Windows: dark panes glowing faintly with moonlight; the Bird Room window is boarded.
function buildWindows(scene) {
  const glassMat = new THREE.MeshBasicMaterial({ map: tex('glass', [], 1.2), color: 0x3a4a66 });
  const boardMat = new THREE.MeshLambertMaterial({ map: tex('boards', [], 1.2) });
  followArea('bird', boardMat, 1);
  const list = [
    ['x', -13.88, 0, 4], ['x', -13.88, 0, 8], ['x', -13.88, 0, -1], ['x', -13.88, 0, -7.5],
    ['x', 13.88, 0, 4], ['x', 13.88, 0, 8], ['x', 13.88, 0, -6.5],
    ['x', -13.88, 3.4, -3], ['x', -13.88, 3.4, 5], ['x', 13.88, 3.4, 6],
    ['z', -10, 3.4, -9.88], ['z', 10, 3.4, -9.88], ['z', -6, 3.4, -9.88], ['z', 6, 3.4, -9.88],
    ['z', -2, 3.4, 9.88], ['z', 2, 3.4, 9.88],
  ];
  for (const [axis, a, L, b] of list) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6), glassMat);
    if (axis === 'x') { m.position.set(a, L + 1.7, b); m.rotation.y = a < 0 ? Math.PI / 2 : -Math.PI / 2; } else { m.position.set(a, L + 1.7, b); m.rotation.y = b > 0 ? Math.PI : 0; }
    scene.add(m);
  }
  const boarded = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.7), boardMat);
  boarded.position.set(13.88, 3.4 + 1.7, -2);
  boarded.rotation.y = -Math.PI / 2;
  scene.add(boarded);
}

function buildPortraits(scene) {
  const add = (area, texture, pos, rotY, w = 0.9, h = 1.12) => {
    const m = new THREE.MeshLambertMaterial({ map: texture, emissiveMap: texture, emissive: WARM.clone() });
    followArea(area, m, 1.15);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    return mesh;
  };
  const U = LEVEL.U;
  anchors.portraits = {};
  anchors.portraits.father = add('drawing', portrait('assets/portraits/steven_iii.jpg', { label: 'Steven Williams III' }), anchors.fatherPortrait, Math.PI / 2, 1.1, 1.38);
  add('staircase', portrait('assets/portraits/steven_i.jpg', { label: 'Steven Williams I' }), new THREE.Vector3(-3.88, 2.0, -6.8), Math.PI / 2);
  add('staircase', portrait('assets/portraits/steven_ii.jpg', { label: 'Steven Williams II' }), new THREE.Vector3(3.88, 2.0, -6.8), -Math.PI / 2);
  anchors.portraits.iv = add('hall', portrait('assets/portraits/steven_iv.jpg', { scratched: true, label: 'Steven Williams IV' }), new THREE.Vector3(0, U + 1.8, -9.88), 0, 1.1, 1.38);
  // Six portraits along the hall for the moving-eyes puzzle
  anchors.portraits.hall = [];
  for (const x of [-12, -8, -3, 3, 8, 12]) anchors.portraits.hall.push(add('hall', portrait(null, {}), new THREE.Vector3(x, U + 1.7, -9.88), 0));
}

function buildLamps(scene) {
  for (const [id, a] of Object.entries(AREAS)) {
    if (!a.lamp) continue;
    const m = new THREE.MeshBasicMaterial({ color: LAMP_ON.clone() });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 0.25, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0x3a2a18, side: THREE.DoubleSide }));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m);
    shade.position.set(...a.lamp);
    bulb.position.set(a.lamp[0], a.lamp[1] - 0.08, a.lamp[2]);
    const cordTop = id === 'foyer' || id === 'staircase' ? 6.6 : LEVEL[a.level] + H;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, cordTop - a.lamp[1]), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    cord.position.set(a.lamp[0], (cordTop + a.lamp[1]) / 2, a.lamp[2]);
    scene.add(shade, bulb, cord);
    (lampMeshes[id] ||= []).push(bulb);
  }
}

// --------------------------------------------------------------------------

export function buildHouse(scene, { shadows }) {
  const batch = new Batch();
  buildWalls(batch);
  buildSlabs(batch);
  buildStairs(batch, scene);
  buildProps(batch);
  batch.build(scene, shadows);
  for (const d of DOORS) doors.push(new Door(scene, d));
  buildWindows(scene);
  buildPortraits(scene);
  buildLamps(scene);
  for (const id of Object.keys(AREAS)) setAreaLight(id, 1);
  return { spawn: new THREE.Vector3(0, 0, 7.5), spawnYaw: 0 };
}

export function doorById(id) {
  return doors.find((d) => d.id === id);
}
