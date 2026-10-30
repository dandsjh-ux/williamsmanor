// Teammates: grey, faceless figures with only their name above them, a flashlight beam,
// footsteps, and positions smoothed between the server's 10-per-second snapshots.

import * as THREE from 'three';
import { label } from './textures.js';
import { areaBrightness } from './house.js';
import * as audio from '../audio.js';

const DELAY = 120;  // ms of interpolation buffer
const STRIDE = 0.78; // metres per footstep

// Shared body parts (built once): smooth, featureless and grey, like a tailor's dummy.
let parts = null;
function bodyParts() {
  if (parts) return parts;
  const limb = (r0, r1, len) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, 10, 4);
    g.translate(0, -len / 2, 0);
    // round the ends a little
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), t = Math.abs(y + len / 2) / (len / 2);
      const k = 1 - Math.pow(t, 6) * 0.25;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const torso = new THREE.LatheGeometry([
    [0.0, 0.0], [0.13, 0.0], [0.15, 0.06], [0.135, 0.17], [0.15, 0.3], [0.175, 0.42], [0.18, 0.48], [0.15, 0.53], [0.06, 0.57], [0.0, 0.575],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  torso.scale(1, 1, 0.62);
  const head = new THREE.SphereGeometry(0.1, 20, 16);
  head.scale(0.92, 1.18, 1.02);
  parts = {
    torso,
    head,
    neck: new THREE.CylinderGeometry(0.042, 0.05, 0.12, 10),
    pelvis: (() => { const g = new THREE.SphereGeometry(0.15, 14, 10); g.scale(1, 0.62, 0.68); return g; })(),
    thigh: limb(0.068, 0.054, 0.44),
    shin: limb(0.052, 0.04, 0.44),
    upperArm: limb(0.046, 0.038, 0.29),
    forearm: limb(0.038, 0.03, 0.27),
    hand: (() => { const g = new THREE.SphereGeometry(0.04, 10, 8); g.scale(0.75, 1.25, 0.5); return g; })(),
    foot: (() => { const g = new THREE.BoxGeometry(0.08, 0.06, 0.24); g.translate(0, -0.03, -0.05); return g; })(),
  };
  return parts;
}

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
    const P = bodyParts();
    const skin = new THREE.MeshLambertMaterial({ color: 0x8b8d8f, emissive: 0x8b8d8f, emissiveIntensity: 0.1 });
    const mk = (geo, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, skin);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const root = new THREE.Group();
    const body = new THREE.Group();      // everything that bobs while walking
    root.add(body);
    mk(P.pelvis, body, 0, 0.95, 0);
    mk(P.torso, body, 0, 0.97, 0);
    mk(P.neck, body, 0, 1.58, 0);
    const head = new THREE.Group();
    head.position.set(0, 1.66, 0);
    body.add(head);
    mk(P.head, head, 0, 0.06, 0);
    // legs: hip -> thigh -> knee -> shin -> foot
    const legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.085, 0.92, 0);
      body.add(hip);
      mk(P.thigh, hip);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      mk(P.shin, knee);
      mk(P.foot, knee, 0, -0.44, 0);
      return { hip, knee };
    });
    // arms: shoulder -> upper arm -> elbow -> forearm -> hand
    const arms = [-1, 1].map((s) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.2, 1.47, 0);
      shoulder.rotation.z = s * 0.08;
      body.add(shoulder);
      mk(P.upperArm, shoulder);
      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      shoulder.add(elbow);
      mk(P.forearm, elbow);
      const hand = mk(P.hand, elbow, 0, -0.3, 0);
      return { shoulder, elbow, hand };
    });
    // The torch sits in the right hand; the beam comes from the head so it follows where they look.
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
    torch.position.set(0, -0.36, 0);
    arms[1].elbow.add(torch);
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 5, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0.2, -0.3, -2.7);
    head.add(beam);
    const tagTex = label(p.name, p.color, 40);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, depthTest: false, transparent: true }));
    tag.scale.set(0.26 * tagTex.userData.aspect, 0.26, 1);
    tag.position.y = 2.12;
    tag.renderOrder = 10;
    root.add(tag);
    this.scene.add(root);
    const av = { id, name: p.name, color: p.color, root, body, head, legs, arms, torch, beam, skin, buf: [], flash: false, area: 'foyer', tag, phase: 0, stride: 0, last: null, speed: 0 };
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

  update(camPos, dt = 0.016) {
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
      av.head.rotation.x = (a.pitch + (c.pitch - a.pitch) * k) * 0.7;
      av.flash = c.flash;
      av.area = c.area;
      av.beam.visible = av.flash;
      av.torch.visible = av.flash;
      this.animate(av, camPos, dt);
      // Grey in the dark, a little paler in a lit room; never quite invisible.
      av.skin.emissiveIntensity = 0.06 + areaBrightness(av.area) * 0.35;
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

  // Walk cycle driven by how far they actually moved, plus their footsteps.
  animate(av, camPos, dt) {
    const p = av.root.position;
    let moved = 0;
    if (av.last) moved = Math.hypot(p.x - av.last.x, p.z - av.last.z);
    else av.last = new THREE.Vector3();
    av.last.copy(p);
    if (moved > 1.5) moved = 0; // a teleport (rejoin), not a step
    const speed = moved / Math.max(dt, 0.001);
    av.speed += (Math.min(speed, 5) - av.speed) * Math.min(1, dt * 8);
    const walking = av.speed > 0.3;
    av.phase += moved / STRIDE * Math.PI;
    av.stride += moved;
    if (av.stride > STRIDE) {
      av.stride = 0;
      if (p.distanceToSquared(camPos) < 400) audio.play('step', { at: av.root, volume: 0.75, rate: 0.9 + Math.random() * 0.2, refDistance: 1.6, rolloff: 1.6 });
    }
    const amp = Math.min(1, av.speed / 3) * (walking ? 1 : 0);
    const s = Math.sin(av.phase);
    av.legs[0].hip.rotation.x += (s * 0.55 * amp - av.legs[0].hip.rotation.x) * Math.min(1, dt * 12);
    av.legs[1].hip.rotation.x += (-s * 0.55 * amp - av.legs[1].hip.rotation.x) * Math.min(1, dt * 12);
    av.legs[0].knee.rotation.x = -Math.max(0, -Math.cos(av.phase)) * 0.8 * amp;
    av.legs[1].knee.rotation.x = -Math.max(0, Math.cos(av.phase)) * 0.8 * amp;
    av.body.position.y = Math.abs(Math.cos(av.phase)) * 0.035 * amp;
    // Left arm swings; the right arm holds the torch up when it is on.
    av.arms[0].shoulder.rotation.x = -s * 0.4 * amp;
    av.arms[0].elbow.rotation.x = 0.15 + Math.max(0, s) * 0.3 * amp;
    const raise = av.flash ? 1.25 + av.head.rotation.x : s * 0.4 * amp;
    av.arms[1].shoulder.rotation.x += (raise - av.arms[1].shoulder.rotation.x) * Math.min(1, dt * 10);
    av.arms[1].elbow.rotation.x = av.flash ? 0.25 : 0.15 + Math.max(0, -s) * 0.3 * amp;
    // a slow sway when standing still, which is somehow worse
    av.body.rotation.z = walking ? 0 : Math.sin(performance.now() / 1400 + av.id.length) * 0.012;
  }

  positions() {
    return [...this.list.values()].map((av) => av.root.position);
  }

  clear() {
    for (const id of [...this.list.keys()]) this.remove(id);
  }
}
