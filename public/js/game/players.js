// Teammates: simple coloured figures with a name tag, a flashlight beam, and
// positions smoothed between the server's 10-per-second snapshots.

import * as THREE from 'three';
import { label } from './textures.js';
import { areaBrightness } from './house.js';

const DELAY = 120; // ms of interpolation buffer

export class Teammates {
  constructor(scene, maxSpots) {
    this.scene = scene;
    this.list = new Map(); // id -> avatar
    this.selfId = null;
    this.info = new Map();  // id -> { name, color }
    // A fixed pool of spotlights (changing the light count would recompile every shader).
    this.spots = [];
    for (let i = 0; i < maxSpots; i++) {
      const s = new THREE.SpotLight(0xfff1d6, 0, 16, 0.42, 0.55, 1.6);
      s.target = new THREE.Object3D();
      scene.add(s, s.target);
      this.spots.push(s);
    }
  }

  setRoster(players, selfId) {
    this.selfId = selfId;
    this.info = new Map(players.map((p) => [p.id, p]));
    for (const [id, av] of this.list) {
      const p = this.info.get(id);
      if (!p || !p.connected) this.remove(id);
      else if (p.name !== av.name || p.color !== av.color) { this.remove(id); }
    }
  }

  remove(id) {
    const av = this.list.get(id);
    if (!av) return;
    this.scene.remove(av.root);
    this.list.delete(id);
  }

  create(id) {
    const p = this.info.get(id);
    if (!p) return null;
    const color = new THREE.Color(p.color);
    const bodyMat = new THREE.MeshLambertMaterial({ color, emissive: color.clone().multiplyScalar(0.25) });
    const headMat = new THREE.MeshLambertMaterial({ color: 0xd9c3a5, emissive: 0x2a2018 });
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.85, 4, 10), bodyMat);
    body.position.y = 0.75;
    const head = new THREE.Group();
    head.position.y = 1.55;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), headMat);
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    torch.rotation.x = Math.PI / 2;
    torch.position.set(0.2, -0.25, -0.18);
    // Visible beam: an additive cone pointing forward (-z)
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 5, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0.2, -0.25, -2.7);
    head.add(skull, torch, beam);
    const tagTex = label(p.name, p.color, 40);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, depthTest: false, transparent: true }));
    tag.scale.set(0.28 * tagTex.userData.aspect, 0.28, 1);
    tag.position.y = 2.05;
    tag.renderOrder = 10;
    root.add(body, head, tag);
    this.scene.add(root);
    const av = { id, name: p.name, color: p.color, root, head, beam, bodyMat, headMat, buf: [], flash: false, area: 'foyer', tag };
    this.list.set(id, av);
    return av;
  }

  onSnapshot(snap) {
    const seen = new Set();
    for (const [id, x, y, z, yaw, pitch, flash, area] of snap.players) {
      if (id === this.selfId) continue;
      seen.add(id);
      const av = this.list.get(id) || this.create(id);
      if (!av) continue;
      av.buf.push({ t: performance.now(), x, y, z, yaw, pitch, flash: !!flash, area });
      if (av.buf.length > 12) av.buf.shift();
    }
    for (const id of [...this.list.keys()]) if (!seen.has(id)) this.remove(id);
  }

  update(camPos) {
    const now = performance.now() - DELAY;
    const lit = [];
    for (const av of this.list.values()) {
      const b = av.buf;
      if (!b.length) continue;
      let a = b[0], c = b[b.length - 1];
      for (let i = 0; i < b.length - 1; i++) if (b[i].t <= now && b[i + 1].t >= now) { a = b[i]; c = b[i + 1]; break; }
      const k = c.t === a.t ? 1 : Math.max(0, Math.min(1, (now - a.t) / (c.t - a.t)));
      const lerpAngle = (p, q) => p + Math.atan2(Math.sin(q - p), Math.cos(q - p)) * k;
      av.root.position.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
      av.root.rotation.y = lerpAngle(a.yaw, c.yaw);
      av.head.rotation.x = a.pitch + (c.pitch - a.pitch) * k;
      av.flash = c.flash;
      av.area = c.area;
      av.beam.visible = av.flash;
      // Look as bright as the room they stand in, plus a little so teammates are never invisible.
      const v = areaBrightness(av.area);
      av.bodyMat.emissiveIntensity = 0.35 + v;
      av.headMat.emissiveIntensity = 0.3 + v;
      if (av.flash) lit.push(av);
    }
    // Give the spotlight pool to the nearest teammates with their flashlights on.
    lit.sort((p, q) => p.root.position.distanceToSquared(camPos) - q.root.position.distanceToSquared(camPos));
    const dir = new THREE.Vector3();
    this.spots.forEach((s, i) => {
      const av = lit[i];
      if (!av) { s.intensity = 0; return; }
      av.head.getWorldPosition(s.position);
      dir.set(0, 0, -1).applyQuaternion(av.head.getWorldQuaternion(new THREE.Quaternion()));
      s.target.position.copy(s.position).addScaledVector(dir, 5);
      s.intensity = 22;
    });
  }

  positions() {
    return [...this.list.values()].map((av) => av.root.position);
  }

  clear() {
    for (const id of [...this.list.keys()]) this.remove(id);
  }
}
