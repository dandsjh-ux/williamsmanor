// Williams Manor server: serves the client and runs every room in memory.
// The server is the single source of truth for rooms, phases, the timer and doors.

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTE_PUZZLE, newPuzzles, publicPuzzles, applyAction } from './server/puzzles.js';
import { newDirector, tickDirector } from './server/director.js';
import { newHints, tickHints } from './server/hints.js';
import { newBoard, moveCard, lockIn } from './server/board.js';

const PORT = process.env.PORT || 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
// Sounds and pictures rarely change: cache them. Code revalidates every load so an update reaches everyone.
app.use('/audio', express.static(join(__dirname, 'public', 'audio'), { maxAge: '1d' }));
app.use('/assets', express.static(join(__dirname, 'public', 'assets'), { maxAge: '1d' }));
app.use(express.static(join(__dirname, 'public'), { maxAge: 0 }));
app.get('/healthz', (_req, res) => res.send('ok'));

const http = createServer(app);
const io = new Server(http, { pingInterval: 10000, pingTimeout: 8000 });

// ---------------------------------------------------------------------------
// Constants

const COLORS = ['#e6194b', '#f58231', '#ffe119', '#3cb44b', '#42d4f4', '#4363d8', '#911eb4', '#f032e6'];
const REJOIN_HOLD_MS = 3 * 60 * 1000;
const EMPTY_ROOM_CLOSE_MS = 5 * 60 * 1000;
const BRIEFING_MS = 26 * 1000;
const SNAPSHOT_MS = 100;

// Notes 1-12 (ids are the true order; clients never show them). Notes 5-12 sit behind a puzzle.
const NOTE_COUNT = 12;

const SETTING_OPTIONS = {
  investigationMin: [10, 15, 20, 30, 45],
  deductionMin: [5, 10, 15, 0], // 0 = untimed
  maxPlayers: [2, 3, 4, 5, 6, 7, 8],
  scareIntensity: ['low', 'medium', 'high'],
  lockinAttempts: [1, 2, 3],
  trueEnding: ['strict', 'forgiving'],
  unfoundNotes: ['torn', 'hidden'],
  batteryDrain: [false, true],
  whisperHints: [true, false],
  lateJoin: [true, false],
};

const DEFAULT_SETTINGS = {
  investigationMin: 20,
  deductionMin: 10,
  maxPlayers: 8,
  scareIntensity: 'medium',
  lockinAttempts: 3,
  trueEnding: 'strict',
  unfoundNotes: 'torn',
  batteryDrain: false,
  whisperHints: true,
  lateJoin: true,
};

// ---------------------------------------------------------------------------
// State

/** @type {Map<string, any>} code -> room */
const rooms = new Map();
/** token -> { code, playerId } */
const tokens = new Map();

function cleanText(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
}

function cleanSettings(input, base = DEFAULT_SETTINGS) {
  const out = { ...base };
  for (const [key, options] of Object.entries(SETTING_OPTIONS)) {
    if (input && options.includes(input[key])) out[key] = input[key];
  }
  return out;
}

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
    if (!rooms.has(code)) return code;
  }
}

function pickColor(room, wanted) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  if (COLORS.includes(wanted) && !used.has(wanted)) return wanted;
  return COLORS.find((c) => !used.has(c)) || COLORS[0];
}

function timeLeftMs(room) {
  const t = room.timer;
  if (!t) return null;
  if (t.untimed) return null;
  if (t.pausedLeft != null) return t.pausedLeft;
  return Math.max(0, t.endsAt - Date.now());
}

function publicRoom(room) {
  return {
    code: room.code,
    name: room.name,
    hostId: room.hostId,
    phase: room.phase,
    settings: room.settings,
    hasPassword: !!room.password,
    timer: room.timer
      ? { left: timeLeftMs(room), paused: room.timer.pausedLeft != null, untimed: !!room.timer.untimed, total: room.timer.total }
      : null,
    phaseStartedAt: room.phaseStartedAt,
    doors: room.doors,
    notes: room.notes,
    puzzles: publicPuzzles(room.puzzles),
    dynScribbles: room.dynScribbles,
    board: room.board,
    ending: room.ending,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      ready: p.ready,
      connected: p.connected,
    })),
  };
}

function roomListing(room) {
  const host = room.players.get(room.hostId);
  return {
    code: room.code,
    name: room.name,
    host: host ? host.name : '—',
    players: [...room.players.values()].filter((p) => p.connected).length,
    maxPlayers: room.settings.maxPlayers,
    phase: room.phase,
    left: timeLeftMs(room),
    locked: !!room.password,
    joinable: room.phase === 'lobby' || room.settings.lateJoin,
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit('room:state', publicRoom(room));
}

function systemChat(room, text) {
  io.to(room.code).emit('chat:message', { system: true, text, at: Date.now() });
}

// ---------------------------------------------------------------------------
// Phases

function setPhase(room, phase) {
  room.phase = phase;
  room.phaseStartedAt = Date.now();
  clearTimeout(room.phaseTimeout);
  room.phaseTimeout = null;

  if (phase === 'briefing') {
    room.timer = null;
    room.phaseTimeout = setTimeout(() => setPhase(room, 'investigation'), BRIEFING_MS);
  } else if (phase === 'investigation') {
    const total = room.settings.investigationMin * 60 * 1000;
    room.timer = { total, endsAt: Date.now() + total, pausedLeft: null };
  } else if (phase === 'deduction') {
    room.board = newBoard(room.settings);
    const min = room.settings.deductionMin;
    room.timer = min ? { total: min * 60 * 1000, endsAt: Date.now() + min * 60 * 1000, pausedLeft: null } : { untimed: true };
  } else if (phase === 'ending') {
    room.timer = null;
  } else if (phase === 'lobby') {
    room.timer = null;
    resetHouse(room);
    for (const p of room.players.values()) p.ready = false;
  }
  broadcastRoom(room);
}

function resetHouse(room) {
  room.doors = {};
  room.notes = {};   // id -> { byId, by, color, at }
  room.puzzles = newPuzzles();
  room.director = newDirector();
  room.hints = newHints();
  room.dynScribbles = [];
  room.board = null;
  room.ending = null;
  for (const p of room.players.values()) p.stats = { notes: 0, puzzles: 0 };
}

function tickTimers() {
  for (const room of rooms.values()) {
    if (!room.timer || room.timer.untimed || room.timer.pausedLeft != null) continue;
    if (Date.now() < room.timer.endsAt) continue;
    if (room.phase === 'investigation') {
      systemChat(room, 'The clock strikes. Time to put the notes in order.');
      setPhase(room, 'deduction');
    } else if (room.phase === 'deduction') {
      systemChat(room, 'Time is up. The board is locked in as it stands.');
      finishBoard(room, lockIn(room.board, room.settings, true));
    }
  }
}
setInterval(tickTimers, 250);

// The horror director runs once a second while the house is being searched.
setInterval(() => {
  for (const room of rooms.values()) {
    const t = room.timer;
    if (room.phase !== 'investigation' || !t || t.pausedLeft != null) continue;
    tickHints(room, (event, payload) => io.to(room.code).emit(event, payload));
    const progress = Math.min(1, 1 - (t.endsAt - Date.now()) / t.total);
    tickDirector(room, (event, payload, playerId) => {
      if (event === 'door:state') systemDoor(room, payload);
      else if (playerId) {
        const p = room.players.get(playerId);
        if (p) io.to(p.socketId).emit(event, payload);
      } else io.to(room.code).emit(event, payload);
    }, progress);
  }
}, 1000);

function systemDoor(room, payload) {
  io.to(room.code).emit('door:state', payload);
}

// ---------------------------------------------------------------------------
// Deduction and endings

function finishBoard(room, result) {
  if (!result.final) {
    systemChat(room, `${result.correct} of 12 in the right place. ${room.board.attemptsLeft} ${room.board.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`);
    broadcastRoom(room);
    return;
  }
  room.board.holders = {};
  room.ending = {
    kind: result.kind,
    correct: result.correct,
    order: [...room.board.order],
    stats: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, ...p.stats })),
  };
  setPhase(room, 'ending');
}

// ---------------------------------------------------------------------------
// Players and hosts

function addPlayer(room, socket, { name, color, token }) {
  const player = {
    id: randomUUID().slice(0, 8),
    token: token && typeof token === 'string' ? token.slice(0, 64) : randomUUID(),
    name: cleanText(name, 16) || 'Investigator',
    color: pickColor(room, color),
    socketId: socket.id,
    connected: true,
    ready: false,
    joinedAt: Date.now(),
    dropTimer: null,
    stats: { notes: 0, puzzles: 0 },
    state: { x: 0, y: 0, z: 7, yaw: Math.PI, pitch: 0, flash: false, area: 'foyer' },
  };
  // A token can only be in one room at a time.
  const old = tokens.get(player.token);
  if (old) removePlayer(rooms.get(old.code), old.playerId, 'left');
  room.players.set(player.id, player);
  tokens.set(player.token, { code: room.code, playerId: player.id });
  return player;
}

function attachSocket(socket, room, player) {
  player.socketId = socket.id;
  player.connected = true;
  clearTimeout(player.dropTimer);
  player.dropTimer = null;
  clearTimeout(player.hostTimer);
  clearTimeout(room.emptyTimer);
  room.emptyTimer = null;
  socket.data.code = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
}

function chooseNewHost(room) {
  const candidates = [...room.players.values()].filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt);
  if (!candidates.length) return;
  room.hostId = candidates[0].id;
  systemChat(room, `${candidates[0].name} is now the host.`);
}

function removePlayer(room, playerId, reason) {
  if (!room) return;
  const p = room.players.get(playerId);
  if (!p) return;
  clearTimeout(p.dropTimer);
  room.players.delete(playerId);
  if (tokens.get(p.token)?.playerId === playerId) tokens.delete(p.token);
  const sock = io.sockets.sockets.get(p.socketId);
  if (sock && sock.data.playerId === playerId) {
    sock.leave(room.code);
    sock.data.code = null;
    sock.data.playerId = null;
    if (reason === 'kicked') sock.emit('room:kicked');
  }
  if (reason === 'kicked') systemChat(room, `${p.name} was removed by the host.`);
  else if (reason === 'timeout') systemChat(room, `${p.name} did not come back.`);
  else systemChat(room, `${p.name} left.`);
  if (room.hostId === playerId) chooseNewHost(room);
  checkEmpty(room);
  broadcastRoom(room);
}

function checkEmpty(room) {
  const anyone = [...room.players.values()].some((p) => p.connected);
  if (anyone || room.emptyTimer) return;
  room.emptyTimer = setTimeout(() => closeRoom(room), EMPTY_ROOM_CLOSE_MS);
}

function closeRoom(room) {
  clearTimeout(room.phaseTimeout);
  for (const p of room.players.values()) {
    clearTimeout(p.dropTimer);
    if (tokens.get(p.token)?.code === room.code) tokens.delete(p.token);
  }
  rooms.delete(room.code);
}

function handleDrop(socket) {
  const room = rooms.get(socket.data.code);
  const player = room?.players.get(socket.data.playerId);
  if (!room || !player || player.socketId !== socket.id) return;
  player.connected = false;
  player.state.flash = false;
  systemChat(room, `${player.name} lost connection.`);
  player.dropTimer = setTimeout(() => removePlayer(room, player.id, 'timeout'), REJOIN_HOLD_MS);
  // A page reload should not cost the host their controls: hand over only if they stay away.
  if (room.hostId === player.id) {
    clearTimeout(player.hostTimer);
    player.hostTimer = setTimeout(() => {
      if (player.connected || room.hostId !== player.id) return;
      chooseNewHost(room);
      broadcastRoom(room);
    }, 15000);
  }
  checkEmpty(room);
  broadcastRoom(room);
}

// ---------------------------------------------------------------------------
// Snapshots: every player's position, ten times a second

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.phase !== 'investigation' && room.phase !== 'briefing') continue;
    const players = [];
    for (const p of room.players.values()) {
      if (!p.connected || !p.inHouse) continue;
      const s = p.state;
      players.push([p.id, +s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2), +s.yaw.toFixed(3), +s.pitch.toFixed(3), s.flash ? 1 : 0, s.area]);
    }
    io.to(room.code).volatile.emit('state:snapshot', { t: Date.now(), players });
  }
}, SNAPSHOT_MS);

// ---------------------------------------------------------------------------
// Socket events

io.on('connection', (socket) => {
  const ctx = () => {
    const room = rooms.get(socket.data.code);
    const player = room?.players.get(socket.data.playerId);
    return room && player ? { room, player, isHost: room.hostId === player.id } : null;
  };
  const ack = (cb, value) => typeof cb === 'function' && cb(value);

  socket.on('room:list', (_args, cb) => {
    ack(cb, [...rooms.values()].map(roomListing).sort((a, b) => a.name.localeCompare(b.name)));
  });

  socket.on('room:create', (args = {}, cb) => {
    const code = makeCode();
    const room = {
      code,
      name: cleanText(args.roomName, 24) || `Room ${code}`,
      password: cleanText(args.password, 24),
      settings: cleanSettings(args.settings),
      players: new Map(),
      hostId: null,
      phase: 'lobby',
      phaseStartedAt: Date.now(),
      timer: null,
      createdAt: Date.now(),
    };
    resetHouse(room);
    rooms.set(code, room);
    const player = addPlayer(room, socket, args);
    room.hostId = player.id;
    attachSocket(socket, room, player);
    ack(cb, { ok: true, code, playerId: player.id, token: player.token, room: publicRoom(room) });
  });

  socket.on('room:join', (args = {}, cb) => {
    const room = rooms.get(cleanText(args.code, 4).toUpperCase());
    if (!room) return ack(cb, { ok: false, error: 'No room with that code.' });
    // Someone already holding a slot here (same token) just rejoins it.
    const held = tokens.get(args.token);
    if (held && held.code === room.code && room.players.has(held.playerId)) {
      const player = room.players.get(held.playerId);
      attachSocket(socket, room, player);
      broadcastRoom(room);
      return ack(cb, { ok: true, code: room.code, playerId: player.id, token: player.token, room: publicRoom(room), rejoined: true });
    }
    if (room.password && cleanText(args.password, 24) !== room.password) return ack(cb, { ok: false, error: 'Wrong password.', needPassword: true });
    if (room.phase !== 'lobby' && !room.settings.lateJoin) return ack(cb, { ok: false, error: 'This game has started and late join is off.' });
    if (room.phase === 'ending') return ack(cb, { ok: false, error: 'This game is finishing. Try again in a moment.' });
    const active = [...room.players.values()].filter((p) => p.connected).length;
    if (active >= room.settings.maxPlayers) return ack(cb, { ok: false, error: 'This room is full.' });
    const player = addPlayer(room, socket, args);
    attachSocket(socket, room, player);
    systemChat(room, `${player.name} joined.`);
    broadcastRoom(room);
    ack(cb, { ok: true, code: room.code, playerId: player.id, token: player.token, room: publicRoom(room) });
  });

  socket.on('room:rejoin', (args = {}, cb) => {
    const held = tokens.get(args.token);
    const room = held && rooms.get(held.code);
    const player = room?.players.get(held.playerId);
    if (!player) return ack(cb, { ok: false });
    const oldSock = io.sockets.sockets.get(player.socketId);
    if (oldSock && oldSock.id !== socket.id) {
      oldSock.leave(room.code);
      oldSock.data.code = null;
      oldSock.data.playerId = null;
    }
    attachSocket(socket, room, player);
    systemChat(room, `${player.name} is back.`);
    broadcastRoom(room);
    ack(cb, { ok: true, code: room.code, playerId: player.id, token: player.token, room: publicRoom(room), state: player.inHouse ? player.state : null });
  });

  socket.on('room:leave', () => {
    const c = ctx();
    if (c) removePlayer(c.room, c.player.id, 'left');
  });

  socket.on('room:settings', (args = {}) => {
    const c = ctx();
    if (!c?.isHost || c.room.phase !== 'lobby') return;
    c.room.settings = cleanSettings(args.settings, c.room.settings);
    if (typeof args.roomName === 'string') c.room.name = cleanText(args.roomName, 24) || c.room.name;
    if (typeof args.password === 'string') c.room.password = cleanText(args.password, 24);
    broadcastRoom(c.room);
  });

  socket.on('player:ready', (ready) => {
    const c = ctx();
    if (!c || c.room.phase !== 'lobby') return;
    c.player.ready = !!ready;
    broadcastRoom(c.room);
  });

  socket.on('player:profile', (args = {}) => {
    const c = ctx();
    if (!c) return;
    if (args.name) c.player.name = cleanText(args.name, 16) || c.player.name;
    if (args.color && args.color !== c.player.color) {
      c.player.color = 'x'; // free our own colour before picking
      c.player.color = pickColor(c.room, args.color);
    }
    broadcastRoom(c.room);
  });

  socket.on('game:start', () => {
    const c = ctx();
    if (!c?.isHost || c.room.phase !== 'lobby') return;
    resetHouse(c.room);
    for (const p of c.room.players.values()) {
      p.state = { x: 0, y: 0, z: 7, yaw: Math.PI, pitch: 0, flash: false, area: 'foyer' };
      p.inHouse = false;
    }
    setPhase(c.room, 'briefing');
  });

  // Host controls
  socket.on('host:skipIntro', () => {
    const c = ctx();
    if (c?.isHost && c.room.phase === 'briefing') setPhase(c.room, 'investigation');
  });
  socket.on('host:pause', (paused) => {
    const c = ctx();
    const t = c?.room.timer;
    if (!c?.isHost || !t || t.untimed) return;
    if (paused && t.pausedLeft == null) t.pausedLeft = Math.max(0, t.endsAt - Date.now());
    if (!paused && t.pausedLeft != null) {
      t.endsAt = Date.now() + t.pausedLeft;
      t.pausedLeft = null;
    }
    systemChat(c.room, paused ? 'The host paused the game.' : 'The host resumed the game.');
    broadcastRoom(c.room);
  });
  socket.on('host:addTime', () => {
    const c = ctx();
    const t = c?.room.timer;
    if (!c?.isHost || !t || t.untimed) return;
    if (t.pausedLeft != null) t.pausedLeft += 5 * 60 * 1000;
    else t.endsAt += 5 * 60 * 1000;
    t.total += 5 * 60 * 1000;
    systemChat(c.room, 'The host added 5 minutes.');
    broadcastRoom(c.room);
  });
  socket.on('host:endInvestigation', () => {
    const c = ctx();
    if (!c?.isHost || c.room.phase !== 'investigation') return;
    systemChat(c.room, 'The host ended the investigation.');
    setPhase(c.room, 'deduction');
  });
  socket.on('host:backToLobby', () => {
    const c = ctx();
    if (c?.isHost) setPhase(c.room, 'lobby');
  });
  socket.on('host:kick', (playerId) => {
    const c = ctx();
    if (!c?.isHost || playerId === c.player.id) return;
    removePlayer(c.room, playerId, 'kicked');
  });

  // Movement: trust the client for position (co-op, no competitive stakes), but clamp the values.
  socket.on('player:move', (m) => {
    const c = ctx();
    if (!c || !Array.isArray(m)) return;
    const [x, y, z, yaw, pitch, flash, area, overlay] = m;
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) return;
    const s = c.player.state;
    s.x = Math.max(-40, Math.min(40, x));
    s.y = Math.max(-10, Math.min(10, y));
    s.z = Math.max(-40, Math.min(40, z));
    s.yaw = yaw;
    s.pitch = Math.max(-1.6, Math.min(1.6, pitch));
    s.flash = !!flash;
    s.area = typeof area === 'string' ? area.slice(0, 20) : s.area;
    s.overlay = !!overlay;
    c.player.inHouse = true;
  });

  socket.on('door:toggle', (id) => {
    const c = ctx();
    if (!c || c.room.phase !== 'investigation' || typeof id !== 'string' || id.length > 32) return;
    if (id === 'front' || (id === 'cellar' && !c.room.puzzles.cellarKey.solved)) return;
    c.room.doors[id] = !c.room.doors[id];
    io.to(c.room.code).emit('door:state', { id, open: c.room.doors[id], by: c.player.id });
  });

  // A note found by anyone goes into everyone's journal, credited to the finder.
  socket.on('note:find', (id) => {
    const c = ctx();
    if (!c || c.room.phase !== 'investigation') return;
    if (!Number.isInteger(id) || id < 1 || id > NOTE_COUNT || c.room.notes[id]) return;
    const puzzle = NOTE_PUZZLE[id];
    if (puzzle && !c.room.puzzles[puzzle]?.solved) return;
    const found = { byId: c.player.id, by: c.player.name, color: c.player.color, at: Date.now() };
    c.room.notes[id] = found;
    c.player.stats.notes++;
    io.to(c.room.code).emit('note:found', { id, ...found });
    broadcastRoom(c.room); // keeps late arrivals and players still on the intro in step
  });

  // Puzzles: solved once, solved for everyone.
  socket.on('puzzle:action', (args = {}, cb) => {
    const c = ctx();
    const reply = (v) => typeof cb === 'function' && cb(v);
    if (!c || c.room.phase !== 'investigation' || typeof args.id !== 'string') return reply({ ok: false });
    const { changed, solved, msg } = applyAction(c.room.puzzles, args.id, args.action, args.data || {});
    const state = () => publicPuzzles({ [args.id]: c.room.puzzles[args.id] })[args.id];
    if (solved) {
      const s = c.room.puzzles[args.id];
      s.by = c.player.name;
      c.player.stats.puzzles++;
      io.to(c.room.code).emit('puzzle:solved', { id: args.id, by: c.player.name, color: c.player.color, byId: c.player.id });
    }
    if (changed) {
      io.to(c.room.code).emit('puzzle:state', { id: args.id, state: state() });
      broadcastRoom(c.room); // players still on the intro (or reconnecting) pick it up too
    }
    // The dumbwaiter drops again when its latch gives way.
    if (args.id === 'dumbwaiter' && args.action === 'latch' && changed) {
      setTimeout(() => {
        const s = c.room.puzzles.dumbwaiter;
        if (s.solved || Date.now() < s.latchedUntil) return;
        s.raised = false;
        s.latchedUntil = 0;
        io.to(c.room.code).emit('puzzle:state', { id: 'dumbwaiter', state: state(), dropped: true });
      }, 10100);
    }
    reply({ ok: true, solved, msg });
  });

  // A dynamic scribble placed by the client the director picked (it knows where the walls are).
  socket.on('director:place', (s = {}) => {
    const c = ctx();
    if (!c || c.room.phase !== 'investigation' || c.room.dynScribbles.length >= 24) return;
    if (!Array.isArray(s.pos) || s.pos.length !== 3 || !s.pos.every(Number.isFinite)) return;
    if (!["you're not alone in here", 'HE NEVER LEFT'].includes(s.text) || !['+x', '-x', '+z', '-z'].includes(s.face)) return;
    const clean = { text: s.text, pos: s.pos.map((v) => +v.toFixed(2)), face: s.face, w: 1.6, area: cleanText(s.area, 20) };
    c.room.dynScribbles.push(clean);
    io.to(c.room.code).emit('scribble:add', clean);
  });

  // The evidence board
  const boardCtx = () => {
    const c = ctx();
    return c && c.room.phase === 'deduction' && c.room.board ? c : null;
  };
  socket.on('board:grab', (id) => {
    const c = boardCtx();
    if (!c || !Number.isInteger(id)) return;
    for (const [k, v] of Object.entries(c.room.board.holders)) if (v === c.player.id) delete c.room.board.holders[k];
    c.room.board.holders[id] = c.player.id;
    broadcastRoom(c.room);
  });
  socket.on('board:release', () => {
    const c = boardCtx();
    if (!c) return;
    for (const [k, v] of Object.entries(c.room.board.holders)) if (v === c.player.id) delete c.room.board.holders[k];
    broadcastRoom(c.room);
  });
  socket.on('board:move', (args = {}) => {
    const c = boardCtx();
    if (!c) return;
    if (moveCard(c.room.board, args.id, args.to)) broadcastRoom(c.room);
  });
  socket.on('board:propose', () => {
    const c = boardCtx();
    if (!c) return;
    c.room.board.proposedBy = c.player.name;
    systemChat(c.room, `${c.player.name} proposes this order. The host can lock it in.`);
    broadcastRoom(c.room);
  });
  socket.on('board:lockin', () => {
    const c = boardCtx();
    if (!c?.isHost) return;
    finishBoard(c.room, lockIn(c.room.board, c.room.settings));
  });

  socket.on('chat:send', (text) => {
    const c = ctx();
    const clean = cleanText(text, 160);
    if (!c || !clean) return;
    io.to(c.room.code).emit('chat:message', { from: c.player.name, color: c.player.color, text: clean, at: Date.now() });
  });

  socket.on('ping:place', (args = {}) => {
    const c = ctx();
    if (!c || c.room.phase !== 'investigation') return;
    const kind = Math.max(0, Math.min(3, args.kind | 0));
    const { x, y, z } = args;
    if (![x, y, z].every(Number.isFinite)) return;
    io.to(c.room.code).emit('ping:placed', { kind, x, y, z, from: c.player.name, color: c.player.color, area: c.player.state.area });
  });

  socket.on('disconnect', () => handleDrop(socket));
});

http.listen(PORT, () => console.log(`Williams Manor listening on http://localhost:${PORT}`));
