# Williams Manor

A first-person co-op horror mystery for 2–8 players, built with three.js and Socket.IO.
The full design lives in the **Williams Manor — Game Spec** doc.

## Run it locally

```bash
npm install
npm start
```

Then open http://localhost:3000. To test multiplayer on one computer, open a second browser window (a private window, or http://127.0.0.1:3000) and join the same room.

## How a game runs

1. **Lobby** — the host creates a room (4-letter code, optional password) and picks the settings. Players join from the room browser or with the code.
2. **Briefing** — the intro lines, then the controls card. The host can skip it.
3. **Investigation** — find 12 notes; 8 sit behind puzzles. A server-side horror director schedules the scares.
4. **Deduction** — everyone drags the notes into order on a shared board. Anyone can propose; the host locks it in. Wrong lock-ins show "X of 12" and arrows while attempts remain.
5. **Ending** — The Author (true), Unfinished Story or The Runaway.
6. **Results** — every note with its order clues and tells highlighted, Steven's ledger, and each player's notes and puzzles. The host can play again.

### Puzzles (all solvable alone)

| Note | Puzzle | Where |
|---|---|---|
| 1–4 | Free finds | Umbrella stand, beside the Bird Room scratches, the white dress pocket, under the music box |
| 5 | 3×3 portrait slider | Drawing Room, Father's portrait |
| 6 | Dumbwaiter: hold the crank, set the latch, reach the Dining hatch in 10 s | Kitchen → Dining Room |
| 7 | Fuse box wire tiles; powers the Conservatory | Cellar |
| 8 | Hollow floorboard (listen for it), then pry it up | Bird Room |
| 9 | The photograph whose eyes follow your flashlight (Steven I or II) | Portrait Hall |
| 10 | Set the grandfather clock to 12:00; a stair tread opens | Foyer → Grand Staircase |
| 11 | Find the cellar key in the Kitchen drawers | Kitchen → Cellar |
| 12 | Dig at the one white rose bush (hold) | Garden |
| — | Brass lock, code 37: opens Steven's ledger | Study |
| — | Wipe the fogged mirror | Bathroom |

Which floorboard, portrait and drawer is the right one changes every game.

### Where every note is (spoilers)

| Note | Room | How to get it |
|---|---|---|
| 1 | Foyer | Search the umbrella stand by the front door. |
| 2 | Bird Room (upstairs) | Read the note pinned to the east wall beside the scratches, near the bed. |
| 3 | Master Bedroom (upstairs) | Check the pocket of the white dress by the wardrobe. |
| 4 | Nursery (upstairs) | Lift the music box on the little table. |
| 5 | Drawing Room | Examine Father's portrait over the fireplace and solve the 3×3 slider. The portrait slides aside and the note is behind it. |
| 6 | Kitchen → Dining Room | Hold the crank in the Kitchen until the dumbwaiter is up, set the latch, then open the Dining Room hatch within 10 seconds. Easier with two: one cranks, one waits at the hatch. |
| 7 | Cellar → Conservatory | Needs the Cellar open (note 11's key). Turn the wire tiles in the Cellar fuse box until power flows from the left side to the right. The Conservatory lights come on and the note is on the low bench. |
| 8 | Bird Room (upstairs) | Walk slowly over the boards near the bed. One knocks hollow underfoot; hold Interact on it to pry it up. |
| 9 | Portrait Hall (upstairs) | Shine your torch on the photographs of Steven Williams I and II. Examine the one whose eyes follow you; it swings aside and the note is behind it. |
| 10 | Foyer → Grand Staircase | Set the grandfather clock in the Foyer to 12:00. A tread halfway up the staircase opens. |
| 11 | Kitchen → Cellar | Open the Kitchen drawers until one holds the cellar key. The cellar door unlocks; the note is on a barrel at the back of the Cellar. |
| 12 | Garden | Out through the back door or the Conservatory. Find the one white rose bush among the red ones and hold Interact to dig. The note is in the tin box. |

Two extras give no note but help with the deduction: the brass lock on the Study desk (code 37, from the 37 tally marks in the Cellar) opens Steven's ledger, and wiping the fogged Bathroom mirror reveals writing.

### Hints

Every minute of searching (paused time does not count), every player gets a hint about one note nobody has found yet. The first hint about a note names the room; the second says exactly what to do. Hints go round the unfound notes in turn and stop once all 12 are found. If someone is stuck in one room for three minutes, they also get a whispered hint for that room's puzzle (Whisper hints setting).

## Assets

The raw files you supplied sit in the project root. `npm run assets` (needs ffmpeg) converts them into:

- `public/audio/` — game sound names from the spec (`knock_01.mp3`, `step_01.mp3` …). Positional sounds are mono. The single footsteps `step_01`–`step_08` are cut from the wood footsteps recording.
- `public/assets/manor.jpg` — the main menu photo, from `manor_exterior.png`.
- `public/assets/melissa.jpg` — cropped from `missingposter.jpg`.
- `public/assets/portraits/steven_i.jpg` … `steven_iv.jpg`.

Where only one recording existed for a numbered set (flicker, knock, whisper), the script derives the extra variants by pitch-shifting or reversing it. There is one creak, and it plays only once: when the front door opens as the players enter the mansion. Doors open silently. The main theme is the only music and plays under every screen; there is no rain.

## Code layout

```
server.js            rooms, phases, timer, sockets
server/puzzles.js    puzzle state and rules
server/director.js   the horror director
server/board.js      evidence board and endings
public/js/main.js    screens and phase routing
public/js/game/      the house (house, garden, physics, controls, players, clues, puzzles, director)
public/js/board.js   deduction board
public/js/ending.js  endings and results
public/js/data/      the 12 notes, tells and scribbles
```

## Deploy to Render

1. Put this folder in a GitHub repository.
2. In Render: **New → Blueprint** and pick the repo (it reads `render.yaml`), or create a **Web Service** by hand: build command `npm install`, start command `node server.js`.
3. The server listens on `process.env.PORT`; the health check is `/healthz`.

On the free plan the service sleeps after 15 minutes without traffic and takes about a minute to wake, so open the site a few minutes before class. A restart or redeploy wipes live rooms, so do not redeploy during a lesson.
