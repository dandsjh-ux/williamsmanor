// Once a minute of searching, everyone gets a hint about one note nobody has found yet.
// The first hint about a note points at the room; the second says exactly what to do.

const HINTS = {
  1: ['Something was left behind in the Foyer, where visitors leave their wet things.', 'Search the umbrella stand by the front door.'],
  2: ['A note is pinned up in the Bird Room.', 'Look on the Bird Room wall beside the scratches, near the bed.'],
  3: ['Her white dress is still in the Master Bedroom.', 'Check the pocket of the white dress by the wardrobe in the Master Bedroom.'],
  4: ['The music box in the Nursery is hiding something.', 'Lift the music box on the little table in the Nursery.'],
  5: ["Father's portrait in the Drawing Room has been cut into pieces.", "Slide the pieces of Father's portrait back together. The note is behind the frame."],
  6: ['The dumbwaiter between the Kitchen and the Dining Room still works.', 'Hold the crank in the Kitchen, set the latch, then open the Dining Room hatch within 10 seconds.'],
  7: ['The Conservatory has no power. The fuse box is in the Cellar.', 'Turn the wire pieces in the Cellar fuse box until power flows across, then check the Conservatory bench.'],
  8: ['One floorboard in the Bird Room is loose.', 'Walk slowly over the Bird Room boards near the bed. Pry up the one that knocks hollow.'],
  9: ['One of the photographs in the Portrait Hall is watching.', 'Shine your torch on Steven Williams I and II. Examine the one whose eyes follow you.'],
  10: ["Father's clock knows the way down.", 'Set the grandfather clock in the Foyer to 12:00. A tread on the Grand Staircase opens.'],
  11: ['The Cellar is locked, and the key is close to the stove.', 'Open the Kitchen drawers to find the cellar key, then search the barrels in the Cellar.'],
  12: ['White for her, red for the rest.', 'Find the one white rose bush in the Garden and dig beside it (hold).'],
};

export function newHints() {
  return { seconds: 0, given: {} };
}

/** Call once a second while the investigation is running and not paused. */
export function tickHints(room, emit) {
  const h = (room.hints ||= newHints());
  if (![...room.players.values()].some((p) => p.connected && p.inHouse)) return;
  if (++h.seconds % 60 !== 0) return;
  const left = Object.keys(HINTS).map(Number).filter((id) => !room.notes[id]);
  if (!left.length) return;
  // The note hinted at least so far (ties: the lowest number), so hints go round them all.
  left.sort((a, b) => (h.given[a] || 0) - (h.given[b] || 0) || a - b);
  const id = left[0];
  const n = h.given[id] || 0;
  h.given[id] = n + 1;
  emit('hint:note', { id, text: HINTS[id][Math.min(n, 1)] });
}
