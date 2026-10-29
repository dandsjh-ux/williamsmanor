// Writing on the walls. Never counted, never in the journal; a few quietly hint at puzzles.
// pos = [x, y, z]; face = which way the writing faces: '+x' '-x' '+z' '-z' 'up' 'down'.
// w = width in metres. beam: only visible inside a flashlight beam. hidden: revealed later
// (the fogged mirror, milestone 4). scare: a jolt when first seen.
// Dynamic ones ("you're not alone in here", "HE NEVER LEFT") are written by the horror director.

const U = 3.4, C = -3.4;

export const SCRIBBLES = [
  { id: 'birds', text: 'little bird little bird little bird', area: 'bird', pos: [10, U + 1.9, -5.88], face: '+z', w: 3.2 },
  { id: 'count', text: 'count the lines', area: 'bird', pos: [13.88, U + 1.75, -4.6], face: '-x', w: 1.3 },
  { id: 'stillhere', text: 'SHE IS STILL HERE', area: 'hall', pos: [-13.85, U + 1.62, -8], face: '+x', w: 0.62 },
  { id: 'clockway', text: "Father's clock knows the way down", area: 'foyer', pos: [-3.88, 1.55, 4.4], face: '+x', w: 1.6 },
  { id: 'sorry', text: 'sorry sorry sorry', area: 'cellar', pos: [4.12, C + 1.55, -3.2], face: '+x', w: 2.2, tally: 37 },
  { id: 'white', text: 'white for her, red for the rest', area: 'garden', pos: [-3.2, 2.1, -29.96], face: '+z', w: 2.6 },
  { id: 'closely', text: 'Look closely', area: 'study', pos: [-9, 1.75, -9.88], face: '+z', w: 1.2 },
  { id: 'names', text: 'Melissa Melisa Melissa Melisa', area: 'bathroom', pos: [-10, U + 1.45, 2.12], face: '+z', w: 2.8 },
  { id: 'twelves', text: '12 12 12 12 12', area: 'staircase', pos: [3.88, 1.8, -3], face: '-x', w: 1.8 },
  { id: 'warm', text: 'the walls are warm', area: 'hall', pos: [-10, U + 1.5, -6.12], face: '-z', w: 1.6 },
  { id: 'dancer', text: "the dancer won't stop dancing", area: 'nursery', pos: [10, U + 1.7, 2.12], face: '+z', w: 2.4 },
  { id: 'dig', text: "don't dig don't dig don't dig", area: 'conservatory', pos: [6.4, 1.7, -9.88], face: '+z', w: 2.2 },
  { id: 'hush', text: 'hush, the clock is listening', area: 'dining', pos: [13.88, 1.95, 6], face: '-x', w: 2 },
  { id: 'reads', text: 'he reads to me every night', area: 'garden', pos: [-6, 0.515, -24.05], face: 'up', w: 1.7 },
  { id: 'gohome', text: 'go home go home go home', area: 'foyer', pos: [0, 2.75, 9.88], face: '-z', w: 2.2 },
  { id: 'page17', text: 'page 17 is missing', area: 'library', pos: [-4.12, 1.7, 0.9], face: '-x', w: 1.5 },
  { id: 'mirror', text: 'I write I write I write', area: 'bathroom', pos: [-8.6, U + 1.6, 9.86], face: '-z', w: 0.6, hidden: true },
  { id: 'reading', text: 'WHO IS READING THIS', area: 'study', pos: [-9, 3.18, -7], face: 'down', w: 2.6, scare: true },
  { id: 'light1', text: 'I can see your light', area: 'bird', pos: [6.12, U + 1.5, -3.5], face: '+x', w: 1.5, beam: true },
  { id: 'light2', text: 'I can see your light', area: 'nursery', pos: [13.88, U + 1.4, 4.2], face: '-x', w: 1.5, beam: true },
  { id: 'light3', text: 'I can see your light', area: 'cellar', pos: [8, C + 1.6, -9.88], face: '+z', w: 1.5, beam: true },
  // "I write I write I write", small and low, in every room
  ...[
    ['foyer', 3.3, 0.45, 9.88, '-z'], ['staircase', -3.6, 0.45, -9.88, '+z'], ['drawing', -13.88, 0.45, 9, '+x'],
    ['library', -6, 0.4, 1.88, '-z'], ['study', -5, 0.45, -4.12, '-z'], ['dining', 5, 0.45, 9.88, '-z'],
    ['kitchen', 4.12, 0.45, 0.6, '+x'], ['conservatory', 13.88, 0.45, -5, '-x'], ['hall', 13.88, U + 0.45, -8, '-x'],
    ['master', -6.12, U + 0.45, 1, '-x'], ['bathroom', -13.88, U + 0.45, 3, '+x'], ['bird', 6.12, U + 0.45, 1, '+x'],
    ['nursery', 13.88, U + 0.45, 3, '-x'], ['cellar', 13.88, C + 0.45, 0, '-x'],
  ].map(([area, x, y, z, face], i) => ({ id: `iwrite${i}`, text: 'I write I write I write', area, pos: [x, y, z], face, w: 0.7, small: true })),
];
