// The horror director: schedules scares on the server so every player hears the same
// knock from the same spot. Intensity rises as the timer runs down and drops when the
// team stays together. Scares never target a player who is inside a puzzle overlay.

const DARK = new Set(['bird', 'nursery', 'cellar', 'garden']);
const FREQ = { low: 0.5, medium: 1, high: 2 };
const DYNAMIC_TEXT = ["you're not alone in here", 'HE NEVER LEFT'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function newDirector() {
  return { next: {}, started: false, blackout: false, musicAt: 0, musicPlays: 0, chimes: 0 };
}

function players(room) {
  return [...room.players.values()].filter((p) => p.connected && p.inHouse);
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * 2, a.z - b.z); // a floor apart counts as far
}

function isDark(room, area) {
  return DARK.has(area) || (area === 'conservatory' && !room.puzzles.fuse.solved);
}

/** Near a point, on the same floor: where a knock comes from. */
function near(p, min, max) {
  const a = Math.random() * Math.PI * 2, r = rnd(min, max);
  return [+(p.x + Math.cos(a) * r).toFixed(2), +(p.y + 1.2).toFixed(2), +(p.z + Math.sin(a) * r).toFixed(2)];
}

/**
 * Called once a second during the investigation. `emit(event, payload, playerId?)`
 * sends to the whole room, or to one player when playerId is given.
 */
export function tickDirector(room, emit, progress) {
  const d = room.director;
  const now = Date.now();
  const all = players(room);
  if (!all.length) return;
  const free = all.filter((p) => !p.state.overlay);

  const intensity = room.settings.scareIntensity;
  const freq = FREQ[intensity] || 1;
  // Groups are safer: if everyone has someone within 6 m, scares come less often.
  const grouped = all.length > 1 && all.every((p) => all.some((q) => q !== p && dist(p.state, q.state) < 6));
  const k = freq * (grouped ? 0.6 : 1) * (0.8 + progress * 0.8);

  const due = (type, min, max, first = 0) => {
    if (!d.next[type]) d.next[type] = now + (first || rnd(min, max)) * 1000 / k;
    if (now < d.next[type]) return false;
    d.next[type] = now + rnd(min, max) * 1000 / k;
    return true;
  };
  const target = () => (free.length ? pick(free) : null);

  // Light flicker: a lit room with someone in it, usually.
  if (due('flicker', 20, 60, 12)) {
    const occupied = [...new Set(all.map((p) => p.state.area))].filter((a) => !isDark(room, a));
    const area = occupied.length && Math.random() < 0.7 ? pick(occupied) : pick(['foyer', 'staircase', 'drawing', 'library', 'study', 'dining', 'kitchen', 'hall', 'master', 'bathroom']);
    emit('director:event', { type: 'flicker', area, dur: +rnd(0.5, progress < 0.25 ? 1.5 : 3).toFixed(1), cut: Math.random() < (progress < 0.25 ? 0.12 : 0.3) });
  }

  if (progress >= 0.25) {
    if (due('knock', 40, 80)) {
      const t = target();
      if (t) emit('director:event', { type: 'knock', pos: near(t.state, 2, 3.2) });
    }
    if (due('footsteps', 50, 90)) {
      const t = target();
      if (t) {
        const s = t.state;
        const above = s.y < 1.7; // ground or cellar: steps in the room above; upstairs: behind them
        const pos = above
          ? [s.x, s.y + 3.4 + 1, s.z]
          : [+(s.x + Math.sin(s.yaw) * 3).toFixed(2), s.y + 0.2, +(s.z + Math.cos(s.yaw) * 3).toFixed(2)];
        emit('director:event', { type: 'footsteps', pos, behind: !above });
      }
    }
    if (due('drift', 60, 120)) {
      const open = Object.entries(room.doors).filter(([id, o]) => o && id !== 'cellar').map(([id]) => id);
      if (open.length) {
        const id = pick(open);
        room.doors[id] = false;
        const slam = intensity !== 'low' && progress > 0.5 && Math.random() < 0.3;
        emit('door:state', { id, open: false, drift: true, slam });
      }
    }
  }

  // Whispers for anyone alone in the dark, far from the others
  if (progress >= 0.5 && due('whisper', 30, 60)) {
    for (const p of free) {
      if (!isDark(room, p.state.area)) continue;
      if (all.some((q) => q !== p && dist(p.state, q.state) < 12)) continue;
      emit('director:event', { type: 'whisper' }, p.id);
      break;
    }
  }

  // The music box plays a few bars by itself once note 4 has been found
  if (room.notes[4] && d.musicPlays === 0 && !d.musicAt) d.musicAt = now + rnd(20, 40) * 1000;
  if (d.musicAt && now >= d.musicAt && (d.musicPlays === 0 || progress >= 0.75)) {
    emit('director:event', { type: 'musicbox' });
    d.musicPlays++;
    d.musicAt = d.musicPlays < 2 ? now + rnd(150, 240) * 1000 : 0;
  }

  // 75%: the blackout, then dread
  if (progress >= 0.75 && !d.blackout) {
    d.blackout = true;
    emit('director:event', { type: 'blackout', dur: 10 });
    const s = { text: 'HE NEVER LEFT', pos: [1.6, 2.0, 9.87], face: '-z', w: 1.8, area: 'foyer' };
    room.dynScribbles.push(s);
    emit('scribble:add', s);
  }
  if (progress >= 0.77) {
    if (due('powercut', 70, 120)) emit('director:event', { type: 'powercut', dur: +rnd(2, 3).toFixed(1) });
    if (d.chimes < 2 && due('chime', 90, 160)) { d.chimes++; emit('director:event', { type: 'chime' }); }
    if (due('scribble', 60, 90)) {
      const t = target();
      if (t) emit('director:event', { type: 'scribble', text: pick(DYNAMIC_TEXT) }, t.id);
    }
  }

  // Steven, only on High: a silhouette at the end of a corridor that vanishes when lit
  if (intensity === 'high' && progress >= 0.4 && due('shadow', 200, 320)) {
    const t = target();
    if (t) emit('director:event', { type: 'shadow' }, t.id);
  }
}
