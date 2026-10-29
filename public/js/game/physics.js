// Player movement against the house: circle-vs-box walls, walkable surfaces and ramps.

import { colliders, surfaces } from './house.js';

export const RADIUS = 0.3;
export const EYE = 1.6;
const STEP = 0.45;      // highest ledge you can walk up
const BODY = 1.7;

function heightAt(s, x, z) {
  if (!s.axis) return s.y;
  const a = s.axis === 'x' ? x : z;
  const t = Math.max(0, Math.min(1, (a - s.a0) / (s.a1 - s.a0)));
  return s.y0 + (s.y1 - s.y0) * t;
}

/** The highest floor under (x, z) that a player standing at height y can be on. */
export function floorAt(x, z, y) {
  let best = -Infinity;
  for (const s of surfaces) {
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const h = heightAt(s, x, z);
    if (h <= y + STEP && h > best) best = h;
  }
  return best;
}

function pushOut(p) {
  const yLo = p.y + 0.3, yHi = p.y + BODY;
  for (const c of colliders) {
    if (!c.active || c.y1 <= yLo || c.y0 >= yHi) continue;
    const cx = Math.max(c.x0, Math.min(p.x, c.x1));
    const cz = Math.max(c.z0, Math.min(p.z, c.z1));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2), k = (RADIUS - d) / d;
      p.x += dx * k;
      p.z += dz * k;
    } else {
      // Centre inside the box: leave by the nearest side.
      const opts = [[c.x0 - RADIUS - p.x, 0], [c.x1 + RADIUS - p.x, 0], [0, c.z0 - RADIUS - p.z], [0, c.z1 + RADIUS - p.z]];
      opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
      p.x += opts[0][0];
      p.z += opts[0][1];
    }
  }
}

function rayBox(o, d, c) {
  let tmin = 0, tmax = Infinity;
  for (const [oa, da, lo, hi] of [[o.x, d.x, c.x0, c.x1], [o.y, d.y, c.y0, c.y1], [o.z, d.z, c.z0, c.z1]]) {
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return Infinity; continue; }
    let t1 = (lo - oa) / da, t2 = (hi - oa) / da;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

/**
 * Is anything solid between origin and a target `dist` away along unit `dir`?
 * Boxes that contain the target (an umbrella stand holding a note, the wall a
 * scribble is written on) do not count.
 */
export function rayBlocked(origin, dir, dist, target) {
  const m = 0.12;
  for (const c of colliders) {
    if (!c.active) continue;
    if (target && target.x > c.x0 - m && target.x < c.x1 + m && target.y > c.y0 - m && target.y < c.y1 + m && target.z > c.z0 - m && target.z < c.z1 + m) continue;
    if (rayBox(origin, dir, c) < dist - 0.05) return true;
  }
  return false;
}

/** Move p (with p.vy) by (dx, dz) over dt seconds, sliding along walls and following floors. */
export function move(p, dx, dz, dt) {
  // Sub-step so a fast frame cannot tunnel through a thin wall.
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / 0.12));
  for (let i = 0; i < steps; i++) {
    const ox = p.x, oz = p.z;
    p.x += dx / steps;
    p.z += dz / steps;
    pushOut(p);
    pushOut(p);
    // Do not walk off into nothing (outside the map).
    if (floorAt(p.x, p.z, p.y) === -Infinity) { p.x = ox; p.z = oz; }
  }
  const floor = floorAt(p.x, p.z, p.y);
  if (floor > p.y) {
    p.y = floor; // step up (or follow a ramp upwards)
    p.vy = 0;
  } else if (p.y - floor < 0.12 && p.vy <= 0) {
    p.y = floor; // stick to ramps and small drops
    p.vy = 0;
  } else {
    p.vy -= 18 * dt;
    p.y = Math.max(floor, p.y + p.vy * dt);
    if (p.y === floor) p.vy = 0;
  }
}
