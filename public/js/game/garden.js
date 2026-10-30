// The garden and the Conservatory's plants: hedges, rose bushes, ivy and grass made of
// leaf cards (alpha-cut textures), and gnarled trees grown from tapered branches.
// The leaves sway a little in the wind.

import * as THREE from 'three';
import { tex } from './textures.js';

const wind = { value: 0 };
const TINT = new THREE.Color(0x6f86b0); // the garden is lit by the moon

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Alpha-cut foliage material that follows a room's light; `sway` metres of movement at the top of each card. */
function leafMat(map, area, followArea, { tint = TINT, k = 1, sway = 0 } = {}) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, emissive: tint.clone(), emissiveMap: map });
  followArea(area, m, k);
  if (sway) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = wind;
      sh.vertexShader = `uniform float uWind;\n${sh.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
        float sw = ${sway.toFixed(3)} * uv.y;
        vec3 wp = position;
        #ifdef USE_INSTANCING
          wp += instanceMatrix[3].xyz;
        #endif
        transformed.x += sin(uWind * 1.3 + wp.x * 0.7 + wp.z * 0.4) * sw;
        transformed.z += cos(uWind * 1.1 + wp.z * 0.6 + wp.y * 0.5) * sw;`);
    };
  }
  return m;
}

/**
 * Merge leaf cards into one geometry. card: { p: centre (or base if bottom), w, h, rx, ry, rz, n: normal, bottom }
 * Normals point out of the bush rather than out of each card, so the clump shades as one soft shape.
 */
function cardGeometry(cards) {
  const pos = [], nrm = [], uv = [], idx = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const c of cards) {
    e.set(c.rx || 0, c.ry || 0, c.rz || 0, 'YXZ');
    q.setFromEuler(e);
    const w = c.w / 2, h = c.h / 2, oy = c.bottom ? h : 0, base = pos.length / 3;
    if (c.n) n.copy(c.n); else n.set(0, 0, 1).applyQuaternion(q);
    for (const [x, y, u, t] of [[-w, -h, 0, 0], [w, -h, 1, 0], [w, h, 1, 1], [-w, h, 0, 1]]) {
      v.set(x, y + oy, 0).applyQuaternion(q).add(c.p);
      pos.push(v.x, v.y, v.z);
      nrm.push(n.x, n.y, n.z);
      uv.push(u, t);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function merge(geos) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (const g of geos) {
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(i + base);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function mesh(scene, geo, m) {
  const o = new THREE.Mesh(geo, m);
  o.matrixAutoUpdate = false;
  scene.add(o);
  return o;
}

// A trunk and branches as tapered cylinders, grown recursively. Returns the branch tips.
function growTree(x, z, seed, height, out) {
  const r = rng(seed);
  const tips = [];
  const up = new THREE.Vector3(0, 1, 0);
  const grow = (p, dir, len, rad, depth) => {
    const to = p.clone().addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(rad * 0.68, rad, len, depth > 2 ? 8 : 5, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    g.translate(p.x, p.y, p.z);
    out.push(g);
    if (depth === 0) { tips.push(to); return; }
    const n = depth >= 3 ? 2 : 2 + (r() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const d = dir.clone().add(new THREE.Vector3(r() - 0.5, r() * 0.6 - 0.15, r() - 0.5).multiplyScalar(1.3)).normalize();
      grow(to, d, len * (0.62 + r() * 0.2), rad * 0.66, depth - 1);
    }
  };
  grow(new THREE.Vector3(x, -0.05, z), new THREE.Vector3(r() * 0.2 - 0.1, 1, r() * 0.2 - 0.1).normalize(), height, 0.24, 4);
  return tips;
}

/** Everything that grows in the garden. ctx: { mat, followArea, addCollider, anchors, high } */
export function buildGarden(scene, batch, { followArea, addCollider, anchors, high }) {
  const r = rng(7);
  const leafTex = tex('leaves', ['#0f180a', '#2c3f1c', 90, 1], 1, 256);
  const roseLeafTex = tex('leaves', ['#0e160a', '#28391a', 110, 0.6], 1, 256);
  const ivyTex = tex('leaves', ['#0b1208', '#22331a', 60, 0.8], 1, 128);
  const hedgeMat = leafMat(leafTex, 'garden', followArea, { sway: 0.03 });
  const roseMat = leafMat(roseLeafTex, 'garden', followArea, { sway: 0.025 });
  const ivyMat = leafMat(ivyTex, 'garden', followArea);
  const core = new THREE.MeshLambertMaterial({ color: 0x0b1108, emissive: TINT.clone() });
  followArea('garden', core, 0.12);

  // Hedges: a dark core box covered in overlapping leaf cards
  const hedgeCards = [];
  for (const [x, z, w] of [[-16, -20, 2], [16, -18, 2], [-10, -28, 1.2], [10, -28, 1.2]]) {
    const hx = w / 2, hz = 4, hy = 1.8;
    addCollider(x - hx, 0, z - hz, x + hx, hy, z + hz);
    batch.solid(core, x - hx + 0.2, 0, z - hz + 0.2, x + hx - 0.2, hy - 0.2, z + hz - 0.2);
    const faces = [[0, 1, 0, w * 8], [1, 0, 0, 8 * hy], [-1, 0, 0, 8 * hy], [0, 0, 1, w * hy], [0, 0, -1, w * hy]];
    const total = faces.reduce((s, f) => s + f[3], 0);
    const count = Math.round(total * (high ? 7 : 4));
    for (let i = 0; i < count; i++) {
      let pick = r() * total, f = faces[0];
      for (const ff of faces) { if ((pick -= ff[3]) <= 0) { f = ff; break; } }
      const [nx, ny, nz] = f;
      const p = new THREE.Vector3(
        nx ? x + nx * hx : x + (r() - 0.5) * w,
        ny ? hy : r() * hy,
        nz ? z + nz * hz : z + (r() - 0.5) * 8,
      ).add(new THREE.Vector3(nx, ny, nz).multiplyScalar(r() * 0.12 - 0.04));
      const n = new THREE.Vector3(nx + (r() - 0.5) * 0.6, ny + 0.3, nz + (r() - 0.5) * 0.6).normalize();
      const s = 0.55 + r() * 0.35;
      hedgeCards.push({ p, w: s, h: s, rx: (r() - 0.5) * 1.6, ry: r() * Math.PI * 2, rz: r() * Math.PI, n });
    }
  }
  mesh(scene, cardGeometry(hedgeCards), hedgeMat);

  // Trees: two bare and gnarled, two with a thin crown of leaves
  const bark = tex('bark', ['#221b15'], 1.5);
  const barkMat = new THREE.MeshLambertMaterial({ map: bark, emissive: TINT.clone(), emissiveMap: bark });
  followArea('garden', barkMat, 1);
  const branches = [], crown = [];
  [[-13, -14, 2.4, false], [13, -26, 2.2, true], [-14, -27, 2.6, true], [6, -15, 2.0, false]].forEach(([x, z, h, leafy], i) => {
    addCollider(x - 0.25, 0, z - 0.25, x + 0.25, 3.5, z + 0.25);
    const tips = growTree(x, z, 11 + i * 17, h, branches);
    if (!leafy) return;
    for (const t of tips) {
      for (let k = 0; k < 5; k++) {
        const s = 0.9 + r() * 0.7;
        const p = t.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.3, r() - 0.5).multiplyScalar(0.8));
        crown.push({ p, w: s, h: s, rx: (r() - 0.5) * 1.4, ry: r() * Math.PI * 2, rz: r() * Math.PI, n: p.clone().sub(new THREE.Vector3(x, p.y - 0.6, z)).normalize() });
      }
    }
  });
  const trunk = new THREE.Mesh(merge(branches), barkMat);
  trunk.castShadow = high;
  scene.add(trunk);
  mesh(scene, cardGeometry(crown), leafMat(leafTex, 'garden', followArea, { sway: 0.06 }));

  // Rose bushes: rounded clumps of small leaves dotted with blooms. One of them is white.
  const roseCards = [], red = [], white = [];
  const bloom = new THREE.IcosahedronGeometry(0.05, 0);
  bloom.deleteAttribute('uv');
  anchors.roseBushes.forEach((b, i) => {
    const isWhite = anchors.whiteRose && b.x === anchors.whiteRose.x && b.z === anchors.whiteRose.z;
    const c = new THREE.Vector3(b.x, 0.42, b.z);
    for (let k = 0; k < (high ? 40 : 24); k++) {
      const n = new THREE.Vector3(r() - 0.5, r() * 0.9, r() - 0.5).normalize();
      const p = c.clone().add(new THREE.Vector3(n.x * 0.42, n.y * 0.42, n.z * 0.42));
      const s = 0.32 + r() * 0.22;
      roseCards.push({ p, w: s, h: s, rx: (r() - 0.5) * 1.4, ry: r() * Math.PI * 2, rz: r() * Math.PI, n });
    }
    for (let k = 0; k < (isWhite ? 18 : 14); k++) {
      const n = new THREE.Vector3(r() - 0.5, r() * 0.8 + 0.1, r() - 0.5).normalize();
      const g = bloom.clone();
      g.scale(1, 0.75, 1);
      g.rotateY(r() * 3);
      g.translate(c.x + n.x * 0.47, c.y + n.y * 0.47, c.z + n.z * 0.47);
      (isWhite ? white : red).push(g);
    }
    void i;
  });
  mesh(scene, cardGeometry(roseCards), roseMat);
  const bloomMat = (color, k) => {
    const m = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), flatShading: true });
    followArea('garden', m, k);
    return m;
  };
  const mergeBlooms = (list) => {
    const pos = [], nrm = [], idx = [];
    for (const g of list) {
      const base = pos.length / 3;
      pos.push(...g.attributes.position.array);
      nrm.push(...g.attributes.normal.array);
      if (g.index) for (const i of g.index.array) idx.push(i + base);
      else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + base);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  };
  mesh(scene, mergeBlooms(red), bloomMat(0x5e0c14, 0.9));
  mesh(scene, mergeBlooms(white), bloomMat(0xe6e0d0, 1.6));

  // Ivy creeping up the garden walls
  const ivy = [];
  const walls = [[-17.98, null, 1, -30, -10], [17.98, null, -1, -30, -10], [null, -29.98, 1, -18, -1.2], [null, -29.98, 1, 1.2, 18]];
  for (const [wx, wz, dir, a0, a1] of walls) {
    for (let patch = 0; patch < 7; patch++) {
      const a = a0 + r() * (a1 - a0), top = 1 + r() * 3;
      for (let k = 0; k < 16; k++) {
        const along = a + (r() - 0.5) * 1.4, y = r() * top, s = 0.35 + r() * 0.25;
        const n = wx != null ? new THREE.Vector3(dir, 0, 0) : new THREE.Vector3(0, 0, dir);
        const p = wx != null ? new THREE.Vector3(wx + dir * (0.02 + r() * 0.05), y, along) : new THREE.Vector3(along, y, wz + dir * (0.02 + r() * 0.05));
        ivy.push({ p, w: s, h: s, ry: wx != null ? Math.PI / 2 : 0, rz: r() * Math.PI * 2, rx: (r() - 0.5) * 0.4, n });
      }
    }
  }
  mesh(scene, cardGeometry(ivy), ivyMat);

  // Long grass in tufts, kept off the terrace, the beds and the hedges
  const blades = tex('blades', [], 1, 128);
  const tuft = cardGeometry([
    { p: new THREE.Vector3(0, 0, 0), w: 0.42, h: 0.34, ry: 0, bottom: true, n: new THREE.Vector3(0, 1, 0) },
    { p: new THREE.Vector3(0, 0, 0), w: 0.42, h: 0.34, ry: Math.PI / 2, bottom: true, n: new THREE.Vector3(0, 1, 0) },
  ]);
  const n = high ? 1600 : 500;
  const grass = new THREE.InstancedMesh(tuft, leafMat(blades, 'garden', followArea, { sway: 0.05, k: 1.2 }), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const blocked = (x, z) => z > -12.4
    || anchors.roseBushes.some((b) => Math.hypot(b.x - x, b.z - z) < 0.7)
    || [[-16, -20, 2], [16, -18, 2], [-10, -28, 1.2], [10, -28, 1.2]].some(([hx, hz, w]) => Math.abs(x - hx) < w / 2 + 0.1 && Math.abs(z - hz) < 4.1)
    || (x > -7.2 && x < -4.8 && z > -24.5 && z < -23.6);
  let placed = 0;
  for (let tries = 0; placed < n && tries < n * 4; tries++) {
    const x = -17.7 + r() * 35.4, z = -29.7 + r() * 17.5;
    if (blocked(x, z)) continue;
    const k = 0.7 + r() * 0.8;
    grass.setMatrixAt(placed++, m4.compose(p.set(x, 0, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI), s.set(k, k * (0.8 + r() * 0.5), k)));
  }
  grass.count = placed;
  scene.add(grass);

  // A gravel terrace along the back of the house
  const gravel = tex('gravel', [], 2);
  gravel.repeat.set(18, 0.7);
  const gm = new THREE.MeshLambertMaterial({ map: gravel, emissive: TINT.clone(), emissiveMap: gravel, polygonOffset: true, polygonOffsetFactor: -1 });
  followArea('garden', gm, 1);
  const terrace = new THREE.Mesh(new THREE.PlaneGeometry(35.8, 1.5), gm);
  terrace.rotation.x = -Math.PI / 2;
  terrace.position.set(0, 0.004, -11.0);
  scene.add(terrace);
}

/** Ferns in clay pots (the Conservatory). positions = the tops of the plant stands. */
export function buildPlants(scene, positions, area, { followArea }) {
  const r = rng(3);
  const warm = new THREE.Color(1, 0.82, 0.6);
  const clay = new THREE.MeshLambertMaterial({ color: 0x6a3420, emissive: warm.clone() });
  followArea(area, clay, 0.35);
  const pot = new THREE.LatheGeometry([[0, 0], [0.14, 0], [0.16, 0.04], [0.2, 0.28], [0.23, 0.3], [0.23, 0.34], [0.2, 0.34]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
  const fronds = [];
  for (const base of positions) {
    const m = new THREE.Mesh(pot, clay);
    m.position.copy(base);
    scene.add(m);
    for (let i = 0; i < 16; i++) {
      const ry = (i / 16) * Math.PI * 2 + r() * 0.3;
      fronds.push({ p: base.clone().add(new THREE.Vector3(0, 0.3, 0)), w: 0.28, h: 0.75 + r() * 0.3, ry, rx: -(0.35 + r() * 0.7), bottom: true, n: new THREE.Vector3(Math.sin(ry), 0.8, Math.cos(ry)).normalize() });
    }
  }
  mesh(scene, cardGeometry(fronds), leafMat(tex('fern', [], 1, 128), area, followArea, { tint: warm, sway: 0.02 }));
}

export function updateGarden(dt) {
  wind.value += dt;
}
