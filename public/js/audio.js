// Sound loading and playback. Files live in /audio as <name>.mp3, numbered sets as
// <name>_01.mp3, <name>_02.mp3 ... and one is picked at random. A missing file stays silent.

import * as THREE from 'three';
import { prefs } from './prefs.js';

// name -> number of variants (0 = a single file with no number)
const MANIFEST = {
  flicker: 2, knock: 3, whisper: 3, footsteps: 2, creak: 1, step: 8,
  door_slam: 0, music_box: 0, clock_tick: 0, clock_chime: 0, scratch: 0,
  heartbeat: 0, flashlight_click: 0, paper_pickup: 0, lock_open: 0, menu_theme: 0,
};

export const listener = new THREE.AudioListener();
listener.setMasterVolume(prefs.volume);

const buffers = new Map(); // file -> Promise<AudioBuffer|null>

function load(file) {
  if (!buffers.has(file)) {
    buffers.set(file, fetch(`audio/${file}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((data) => (data ? listener.context.decodeAudioData(data) : null))
      .catch(() => null));
  }
  return buffers.get(file);
}

function files(name) {
  const n = MANIFEST[name] ?? 0;
  if (!n) return [name];
  return Array.from({ length: n }, (_, i) => `${name}_${String(i + 1).padStart(2, '0')}`);
}

export function preload(names = Object.keys(MANIFEST)) {
  return Promise.all(names.flatMap(files).map(load));
}

export function unlock() {
  if (listener.context.state !== 'running') listener.context.resume();
}

export function setVolume(v) {
  listener.setMasterVolume(v);
}

/**
 * Play a sound. Options:
 *  volume, loop, rate, offset
 *  at: a THREE.Object3D to attach a positional sound to (it follows the object), or a Vector3
 *  scene: needed with a Vector3 position (a temporary holder is added there)
 *  refDistance, rolloff, maxDistance
 * Returns a handle with stop() and fade(to, seconds).
 */
export function play(name, opts = {}) {
  const choices = files(name);
  const file = choices[Math.floor(Math.random() * choices.length)];
  let sound = null;
  let holder = null;
  let stopped = false;

  const handle = {
    get sound() { return sound; },
    stop(fadeSec = 0) {
      stopped = true;
      if (!sound) return;
      if (fadeSec > 0 && sound.isPlaying) {
        const g = sound.gain.gain;
        const t = listener.context.currentTime;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0, t + fadeSec);
        setTimeout(() => cleanup(), fadeSec * 1000 + 50);
      } else cleanup();
    },
    fade(to, sec) {
      if (!sound) { opts.volume = to; return; }
      const g = sound.gain.gain;
      const t = listener.context.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(to, t + sec);
    },
  };

  function cleanup() {
    if (sound) {
      try { if (sound.isPlaying) sound.stop(); } catch { /* already stopped */ }
      sound.disconnect?.();
      sound.parent?.remove(sound);
    }
    holder?.parent?.remove(holder);
  }

  load(file).then((buffer) => {
    if (!buffer || stopped) return;
    const positional = !!opts.at;
    sound = positional ? new THREE.PositionalAudio(listener) : new THREE.Audio(listener);
    sound.setBuffer(buffer);
    sound.setLoop(!!opts.loop);
    sound.setVolume(opts.volume ?? 1);
    if (opts.rate) sound.setPlaybackRate(opts.rate);
    if (opts.offset) sound.offset = opts.offset;
    if (positional) {
      sound.setRefDistance(opts.refDistance ?? 2);
      sound.setRolloffFactor(opts.rolloff ?? 1.4);
      sound.setMaxDistance(opts.maxDistance ?? 40);
      sound.setDistanceModel('inverse');
      if (opts.at.isVector3) {
        holder = new THREE.Object3D();
        holder.position.copy(opts.at);
        opts.scene.add(holder);
        holder.add(sound);
      } else {
        opts.at.add(sound);
      }
    }
    if (opts.fadeIn) {
      const g = sound.gain.gain;
      const t = listener.context.currentTime;
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(opts.volume ?? 1, t + opts.fadeIn);
    }
    sound.play();
    if (!opts.loop) sound.source.onended = () => { sound.isPlaying = false; cleanup(); };
  });
  return handle;
}
