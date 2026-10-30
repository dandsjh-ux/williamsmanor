// Puzzle state and rules. The server checks every action so two players can never
// double-solve or see different boards. Each puzzle is solvable by one player alone.

export const NOTE_PUZZLE = { 5: 'portrait', 6: 'dumbwaiter', 7: 'fuse', 8: 'floorboard', 9: 'eyes', 10: 'clock', 11: 'cellarKey', 12: 'roseDig' };
export const PUZZLE_IDS = ['portrait', 'dumbwaiter', 'fuse', 'floorboard', 'eyes', 'clock', 'cellarKey', 'roseDig', 'studyLock', 'mirror'];

const WHITE_ROSE = 7;      // index of the white bush among the 9 rose bushes
const LATCH_MS = 10000;    // the dumbwaiter latch holds this long
const rand = (n) => Math.floor(Math.random() * n);

// ---------------------------------------------------------------- Father's portrait: spot the hidden clue
// A corner of paper pokes out of a slit in the canvas at one of these places (fractions of
// the photograph's width and height, chosen away from the faces). Click it to find the note.

const PORTRAIT_SPOTS = [[0.36, 0.17], [0.06, 0.4], [0.08, 0.9], [0.9, 0.12], [0.93, 0.6], [0.6, 0.93]];
const PORTRAIT_REACH = 0.06; // how close a click must land, as a fraction of the width

// ---------------------------------------------------------------- Fuse box (4x4 wire tiles)
// Directions as bits: N=1 E=2 S=4 W=8. Power enters tile 4 from the west and must leave tile 11 to the east.

export const FUSE_SIZE = 4;
const BASE = { I: 10, L: 3, T: 11 };
const PATH = { 4: 'I', 5: 'L', 9: 'L', 10: 'I', 11: 'I' };
const rotMask = (m, r) => { for (let i = 0; i < r; i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
const opposite = (d) => rotMask(d, 2);

export function fusePowered(types, rot) {
  const n = FUSE_SIZE;
  const mask = (i) => rotMask(BASE[types[i]], rot[i]);
  if (!(mask(4) & 8)) return false;
  const seen = new Set([4]);
  const queue = [4];
  while (queue.length) {
    const t = queue.shift();
    const m = mask(t);
    const r = Math.floor(t / n), c = t % n;
    for (const [d, dr, dc] of [[1, -1, 0], [2, 0, 1], [4, 1, 0], [8, 0, -1]]) {
      if (!(m & d)) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) {
        if (t === 11 && d === 2) return true;
        continue;
      }
      const nt = nr * n + nc;
      if (seen.has(nt) || !(mask(nt) & opposite(d))) continue;
      seen.add(nt);
      queue.push(nt);
    }
  }
  return false;
}

function newFuse() {
  const types = Array.from({ length: 16 }, (_, i) => PATH[i] || 'ILT'[rand(3)]);
  let rot;
  do rot = types.map(() => rand(4)); while (fusePowered(types, rot));
  return { types, rot };
}

// ---------------------------------------------------------------- State

export function newPuzzles() {
  return {
    portrait: { solved: false, spot: PORTRAIT_SPOTS[rand(PORTRAIT_SPOTS.length)] },
    dumbwaiter: { solved: false, raised: false, latchedUntil: 0 },
    fuse: { solved: false, ...newFuse() },
    floorboard: { solved: false, which: rand(6) },
    eyes: { solved: false, which: rand(2) }, // Steven I or Steven II, the photographs in the Portrait Hall
    clock: { solved: false, h: 3, m: 40 },
    cellarKey: { solved: false, which: rand(6), opened: [] },
    roseDig: { solved: false, dug: [] },
    studyLock: { solved: false },
    mirror: { solved: false },
  };
}

/** What clients see (the dumbwaiter latch as time left, so clock differences do not matter). */
export function publicPuzzles(p) {
  const out = {};
  for (const [id, s] of Object.entries(p)) {
    out[id] = id === 'dumbwaiter' ? { solved: s.solved, by: s.by, raised: s.raised, latchLeft: Math.max(0, s.latchedUntil - Date.now()) } : s;
  }
  return out;
}

/**
 * Apply one action. Returns { changed, solved, msg } — msg is feedback for the player who acted.
 */
export function applyAction(puzzles, id, action, data = {}) {
  const s = puzzles[id];
  if (!s || s.solved) return { changed: false, msg: s?.solved ? 'Already solved.' : null };
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  let solved = false, changed = false, msg = null;

  switch (id) {
    case 'portrait': {
      if (action !== 'search' || !Number.isFinite(data.x) || !Number.isFinite(data.y)) break;
      // y is scaled by the photograph's aspect (800 x 1066) so the reach is a circle.
      if (Math.hypot(data.x - s.spot[0], (data.y - s.spot[1]) * 1.33) <= PORTRAIT_REACH) solved = changed = true;
      else msg = ['Only paint and dust.', 'The canvas is flat here.', 'Nothing but cracked varnish.'][rand(3)];
      break;
    }
    case 'dumbwaiter': {
      const now = Date.now();
      if (s.latchedUntil && now > s.latchedUntil) { s.raised = false; s.latchedUntil = 0; changed = true; }
      if (action === 'raise') { s.raised = true; changed = true; msg = 'The dumbwaiter rattles up the shaft. Set the latch!'; }
      else if (action === 'latch') {
        if (!s.raised) msg = 'Nothing to hold. Turn the crank first.';
        else { s.latchedUntil = now + LATCH_MS; changed = true; msg = 'The latch is set. It will only hold for 10 seconds. Get to the Dining Room hatch!'; }
      } else if (action === 'hatch') {
        if (s.latchedUntil && now <= s.latchedUntil) { solved = true; changed = true; }
        else msg = s.raised ? 'The dumbwaiter is up, but the latch is not set.' : 'The shaft is empty. Something has to be raised from the Kitchen.';
      }
      break;
    }
    case 'fuse': {
      if (action !== 'rotate' || !int(data.i, 0, 15)) break;
      s.rot[data.i] = (s.rot[data.i] + 1) % 4;
      changed = true;
      solved = fusePowered(s.types, s.rot);
      break;
    }
    case 'floorboard':
      if (action === 'pry' && int(data.i, 0, 5)) {
        if (data.i === s.which) solved = changed = true; else msg = 'The board is nailed down tight.';
      }
      break;
    case 'eyes':
      if (action === 'open' && int(data.i, 0, 1)) {
        if (data.i === s.which) solved = changed = true; else msg = 'Just an old photograph. The eyes stay still.';
      }
      break;
    case 'clock':
      if (action === 'set' && int(data.h, 1, 12) && int(data.m, 0, 59)) {
        s.h = data.h; s.m = data.m - (data.m % 5);
        changed = true;
        solved = s.h === 12 && s.m === 0;
      }
      break;
    case 'cellarKey':
      if (action === 'drawer' && int(data.i, 0, 5) && !s.opened.includes(data.i)) {
        s.opened.push(data.i);
        changed = true;
        if (data.i === s.which) { solved = true; msg = 'A heavy iron key. The cellar key!'; } else msg = ['Spoons and string.', 'Old candles.', 'Nothing but crumbs.', 'Tea towels, folded very neatly.', 'Matches. All used.'][s.opened.length % 5];
      }
      break;
    case 'roseDig':
      if (action === 'dig' && int(data.i, 0, 8) && !s.dug.includes(data.i)) {
        if (data.i === WHITE_ROSE) solved = changed = true;
        else { s.dug.push(data.i); changed = true; msg = 'Only roots and red petals.'; }
      }
      break;
    case 'studyLock':
      if (action === 'try' && int(data.code, 0, 99)) {
        if (data.code === 37) solved = changed = true; else msg = 'The brass wheels do not budge.';
      }
      break;
    case 'mirror':
      if (action === 'wipe') solved = changed = true;
      break;
    default: break;
  }
  if (solved) s.solved = true;
  return { changed, solved, msg };
}
