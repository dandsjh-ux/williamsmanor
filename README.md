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
| 9 | The portrait whose eyes follow your flashlight | Portrait Hall |
| 10 | Set the grandfather clock to 12:00; a stair tread opens | Foyer → Grand Staircase |
| 11 | Find the cellar key in the Kitchen drawers | Kitchen → Cellar |
| 12 | Dig at the one white rose bush (hold) | Garden |
| — | Brass lock, code 37: opens Steven's ledger | Study |
| — | Wipe the fogged mirror | Bathroom |

Which floorboard, portrait and drawer is the right one changes every game.

## Assets

The raw files you supplied sit in the project root. `npm run assets` (needs ffmpeg) converts them into:

- `public/audio/` — game sound names from the spec (`knock_01.mp3`, `creak_03.mp3` …). Positional sounds are mono.
- `public/assets/melissa.jpg` — cropped from `missingposter.jpg`.
- `public/assets/portraits/steven_i.jpg` … `steven_iv.jpg`.

Where only one recording existed for a numbered set (flicker, knock, whisper, creak), the script derives the extra variants by pitch-shifting or reversing it. `rain loop sound effect.mp3` is empty (4 bytes), so a soft synthetic rain is generated instead. Drop in a real file with the same name and re-run `npm run assets`.

## Code layout

```
server.js            rooms, phases, timer, sockets
server/puzzles.js    puzzle state and rules
server/director.js   the horror director
server/board.js      evidence board and endings
public/js/main.js    screens and phase routing
public/js/game/      the house (house, physics, controls, players, clues, puzzles, director)
public/js/board.js   deduction board
public/js/ending.js  endings and results
public/js/data/      the 12 notes, tells and scribbles
```

## Deploy to Render

1. Put this folder in a GitHub repository.
2. In Render: **New → Blueprint** and pick the repo (it reads `render.yaml`), or create a **Web Service** by hand: build command `npm install`, start command `node server.js`.
3. The server listens on `process.env.PORT`; the health check is `/healthz`.

On the free plan the service sleeps after 15 minutes without traffic and takes about a minute to wake, so open the site a few minutes before class. A restart or redeploy wipes live rooms, so do not redeploy during a lesson.
