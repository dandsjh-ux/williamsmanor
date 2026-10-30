// App flow: gate -> menu -> host/join -> lobby -> intro -> the house -> deduction -> ending -> results.
// The server's room state decides which screen everyone is on.

import { socket, call, send, on } from './net.js';
import { prefs, profile, saveProfile, getToken, COLORS, isTouch } from './prefs.js';
import * as audio from './audio.js';
import { $, $$, esc, show, toast, openModal, closeModal, settingsHTML, wireSettings, controlsTabs, clippingHTML, HOWTO_HTML, CREDITS_HTML } from './ui.js';
import { startGame, stopGame, isRunning, onRoom as gameOnRoom, chatLine, debug } from './game/game.js';
import { renderBoard, tickBoard } from './board.js';
import { playEnding, renderResults } from './ending.js';

const token = getToken();
const app = {
  room: null,
  selfId: null,
  screen: 'gate',
  pendingRejoin: null,   // rejoin result waiting for the tap-to-begin gate
  introPlayed: false,    // the intro for this game has been shown on this device
  entered: false,        // this player has stepped into the house this game
  savedState: null,
};
// The main theme starts at the gate and plays under every screen for the whole game.
// In the house it drops back so knocks and footsteps carry.
let music = null;
const MUSIC_VOL = { game: 0.2, intro: 0.38, deduction: 0.3 };

// ---------------------------------------------------------------------------- Screens

function go(screen) {
  app.screen = screen;
  show(`screen-${screen}`);
  music?.fade(MUSIC_VOL[screen] ?? 0.45, 2);
  if (screen === 'join') refreshBrowser();
}

function startMusic() {
  if (!music) music = audio.play('menu_theme', { loop: true, volume: 0.45, fadeIn: 3 });
}

// ---------------------------------------------------------------------------- Gate

$('#gate-btn').addEventListener('click', () => {
  audio.unlock();
  audio.preload();
  startMusic();
  if (app.pendingRejoin) {
    const r = app.pendingRejoin;
    app.pendingRejoin = null;
    enterRoom(r, true);
  } else go('menu');
});

// ---------------------------------------------------------------------------- Menu

$('#clipping-small').innerHTML = clippingHTML();
$('#clipping-thumb').addEventListener('click', openClipping);
function openClipping() {
  openModal(`<div class="clipping">${clippingHTML()}</div>`, { clip: true });
}

for (const b of $$('[data-go]')) b.addEventListener('click', () => go(b.dataset.go));
for (const b of $$('[data-modal]')) {
  b.addEventListener('click', () => {
    const kind = b.dataset.modal;
    if (kind === 'clipping') return openClipping();
    if (kind === 'howto') {
      const body = openModal(HOWTO_HTML);
      controlsTabs(body, body.querySelector('#howto-controls'));
    } else if (kind === 'settings') {
      wireSettings(openModal(`<h2>Settings</h2>${settingsHTML()}`));
    } else if (kind === 'credits') openModal(CREDITS_HTML);
  });
}

// Film grain over the photo
(function grain() {
  const c = $('#menu-grain');
  const ctx = c.getContext('2d');
  c.width = 160; c.height = 180;
  const img = ctx.createImageData(c.width, c.height);
  let frame = 0;
  (function tick() {
    if (app.screen === 'menu' && frame++ % 3 === 0) {
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
    requestAnimationFrame(tick);
  })();
})();

// ---------------------------------------------------------------------------- Profile (name + colour)

function renderProfiles() {
  const taken = new Set(app.room?.players.filter((p) => p.id !== app.selfId).map((p) => p.color) || []);
  for (const el of $$('[data-profile]')) {
    const live = el.hasAttribute('data-live');
    const me = live ? app.room?.players.find((p) => p.id === app.selfId) : null;
    const name = me ? me.name : profile.name;
    const color = me ? me.color : profile.color;
    el.innerHTML = `
      <input class="p-name" maxlength="16" placeholder="Your name" value="${esc(name)}">
      <div class="swatches">${COLORS.map((c) => `<button class="swatch ${c === color ? 'on' : ''}" style="background:${c}" data-color="${c}" ${live && taken.has(c) ? 'disabled' : ''} aria-label="Colour"></button>`).join('')}</div>`;
    el.querySelector('.p-name').addEventListener('change', (e) => {
      profile.name = e.target.value.trim().slice(0, 16);
      saveProfile();
      if (live) send('player:profile', { name: profile.name });
    });
    for (const b of el.querySelectorAll('[data-color]')) {
      b.addEventListener('click', () => {
        profile.color = b.dataset.color;
        saveProfile();
        if (live) send('player:profile', { color: profile.color });
        else renderProfiles();
      });
    }
  }
}
renderProfiles();

function needName(errEl) {
  if (profile.name) return false;
  errEl.textContent = 'Type your name first.';
  $$('.p-name').forEach((i) => i.focus());
  return true;
}

// ---------------------------------------------------------------------------- Settings forms

const SETTINGS_FORM = [
  ['investigationMin', 'Investigation time', [[10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min']]],
  ['deductionMin', 'Deduction time', [[5, '5 min'], [10, '10 min'], [15, '15 min'], [0, 'Untimed']]],
  ['maxPlayers', 'Max players', [2, 3, 4, 5, 6, 7, 8].map((n) => [n, String(n)])],
  ['scareIntensity', 'Scare intensity', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]],
  ['lockinAttempts', 'Lock-in attempts', [[1, '1'], [2, '2'], [3, '3']]],
  ['trueEnding', 'True ending needs', [['strict', 'Strict (12/12)'], ['forgiving', 'Forgiving (11/12)']]],
  ['unfoundNotes', 'Unfound notes on board', [['torn', 'Torn fragment'], ['hidden', 'Hidden']]],
  ['batteryDrain', 'Flashlight battery drain', [[false, 'Off'], [true, 'On']]],
  ['whisperHints', 'Whispered hints when stuck', [[true, 'On'], [false, 'Off']]],
  ['lateJoin', 'Late join', [[true, 'On'], [false, 'Off']]],
];
const DEFAULTS = { investigationMin: 20, deductionMin: 10, maxPlayers: 8, scareIntensity: 'medium', lockinAttempts: 3, trueEnding: 'strict', unfoundNotes: 'torn', batteryDrain: false, whisperHints: true, lateJoin: true };

function renderSettings(el, values, editable, onChange) {
  el.innerHTML = SETTINGS_FORM.map(([key, text, opts]) => `
    <label for="set-${el.id}-${key}">${text}</label>
    <select id="set-${el.id}-${key}" data-key="${key}" ${editable ? '' : 'disabled'}>
      ${opts.map(([v, t]) => `<option value="${String(v)}" ${String(values[key]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}
    </select>`).join('');
  for (const s of el.querySelectorAll('select')) {
    s.addEventListener('change', () => onChange?.(readSettings(el)));
  }
}

function readSettings(el) {
  const out = {};
  for (const s of el.querySelectorAll('select')) {
    const v = s.value;
    out[s.dataset.key] = v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v;
  }
  return out;
}

renderSettings($('#host-settings'), DEFAULTS, true);

// ---------------------------------------------------------------------------- Host

$('#host-create').addEventListener('click', async () => {
  const err = $('#host-error');
  err.textContent = '';
  if (needName(err)) return;
  $('#host-create').disabled = true;
  const res = await call('room:create', {
    roomName: $('#host-room-name').value,
    password: $('#host-password').value,
    settings: readSettings($('#host-settings')),
    name: profile.name, color: profile.color, token,
  });
  $('#host-create').disabled = false;
  if (!res?.ok) { err.textContent = res?.error || 'Could not create the room.'; return; }
  enterRoom(res);
});

// ---------------------------------------------------------------------------- Join

let browserTimer = null;
async function refreshBrowser() {
  clearTimeout(browserTimer);
  if (app.screen !== 'join') return;
  const list = await call('room:list');
  const el = $('#room-browser');
  const phaseText = (r) => {
    if (r.phase === 'lobby') return 'Lobby';
    if (r.phase === 'briefing') return 'Starting';
    if (r.phase === 'investigation') return `Investigating ${r.left != null ? fmt(r.left) : ''} left`;
    if (r.phase === 'deduction') return 'Deduction';
    if (r.phase === 'ending') return 'Finishing';
    return r.phase;
  };
  if (!Array.isArray(list) || !list.length) {
    el.innerHTML = '<p class="muted">No open rooms yet. Ask your host for the room code, or host a game yourself.</p>';
  } else {
    el.innerHTML = `<div class="room-row head"><span>Room</span><span class="host">Host</span><span>Players</span><span>Phase</span><span></span></div>` +
      list.map((r) => `
        <div class="room-row ${r.joinable && r.players < r.maxPlayers ? '' : 'closed'}" data-code="${esc(r.code)}" data-locked="${r.locked}">
          <span>${esc(r.name)}</span><span class="host">${esc(r.host)}</span><span>${r.players}/${r.maxPlayers}</span><span>${phaseText(r)}</span><span>${r.locked ? '🔒' : ''}</span>
        </div>`).join('');
    for (const row of el.querySelectorAll('.room-row[data-code]')) {
      if (row.classList.contains('closed')) continue;
      row.addEventListener('click', () => joinRoom(row.dataset.code, row.dataset.locked === 'true'));
    }
  }
  browserTimer = setTimeout(refreshBrowser, 3000);
}
$('#browser-refresh').addEventListener('click', refreshBrowser);
$('#join-code-btn').addEventListener('click', () => joinRoom($('#join-code').value.trim().toUpperCase(), false));
$('#join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#join-code-btn').click(); });

async function joinRoom(code, locked, password = '') {
  const err = $('#join-error');
  err.textContent = '';
  if (needName(err)) return;
  if (!/^[A-Z]{4}$/.test(code)) { err.textContent = 'Room codes are 4 letters.'; return; }
  if (locked && !password) return askPassword(code);
  const res = await call('room:join', { code, password, name: profile.name, color: profile.color, token });
  if (!res?.ok) {
    if (res?.needPassword && !password) return askPassword(code);
    err.textContent = res?.error || 'Could not join.';
    return;
  }
  enterRoom(res);
}

function askPassword(code) {
  const body = openModal(`<h2>Password</h2><p>Room ${esc(code)} has a password.</p>
    <form id="pw-form"><input id="pw" type="password" autocomplete="off" maxlength="24"> <button class="btn">Join</button></form>`);
  body.querySelector('#pw').focus();
  body.querySelector('#pw-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pw = body.querySelector('#pw').value;
    closeModal();
    joinRoom(code, true, pw || ' ');
  });
}

// ---------------------------------------------------------------------------- Room state

function enterRoom(res, rejoined = false) {
  app.selfId = res.playerId;
  app.savedState = rejoined ? res.state : null;
  app.introPlayed = rejoined && res.room.phase === 'investigation' && !!res.state;
  app.entered = false;
  $('#lobby-chat-log').innerHTML = '';
  onRoomState(res.room);
}

on('room:state', (room) => {
  if (!app.selfId) return;
  onRoomState(room);
});

function onRoomState(room) {
  const prevPhase = app.room?.phase;
  app.room = room;
  gameOnRoom(room);
  const phase = room.phase;

  if (phase === 'lobby') {
    if (isRunning()) stopGame();
    app.introPlayed = false;
    app.entered = false;
    renderLobby();
    if (app.screen !== 'lobby') go('lobby');
  } else if (phase === 'briefing') {
    renderLobby();
    if (!app.introPlayed) playIntro(false);
  } else if (phase === 'investigation') {
    if (app.entered) return;
    if (app.introPlayed && app.savedState) { enterHouse(); return; }
    if (!app.introPlayed) playIntro(prevPhase !== 'briefing'); // late joiners get the short version
    else if (prevPhase === 'briefing' && !app.introDone) showControlsCard(); // the host skipped the intro
    else enableEnter();
  } else if (phase === 'deduction') {
    if (isRunning()) stopGame();
    app.entered = false;
    if (app.screen !== 'deduction') {
      closeModal();
      audio.play('clock_chime', { volume: 0.8 });
      go('deduction');
    }
    renderBoard(room, app.selfId);
  } else if (phase === 'ending') {
    if (isRunning()) stopGame();
    app.entered = false;
    const key = `${room.code}:${room.phaseStartedAt}`;
    if (app.endingKey !== key) {
      app.endingKey = key;
      closeModal();
      go('ending');
      playEnding(room.ending, showResults);
    } else if (app.screen === 'results') showResults();
  }
}

function showResults() {
  if (!app.room?.ending) return;
  if (app.screen !== 'results') go('results');
  renderResults(app.room, app.selfId, { playAgain: () => send('host:backToLobby'), leave: leaveRoom });
}

setInterval(() => app.screen === 'deduction' && tickBoard(), 250);

on('chat:message', (msg) => {
  chatLine(msg, $('#lobby-chat-log'));
  chatLine(msg, $('#board-chat-log'));
  if (isRunning()) chatLine(msg, $('#game-chat-log'));
});

on('room:kicked', () => {
  leaveToMenu('The host removed you from the room.');
});

socket.on('connect', async () => {
  // After a dropped connection (or a page reload), try to take our slot back.
  const res = await call('room:rejoin', { token });
  if (!res?.ok) {
    if (app.selfId) leaveToMenu('The room has closed.');
    return;
  }
  if (app.screen === 'gate') {
    app.pendingRejoin = res;
    $('#gate-sub').textContent = `Rejoining room ${res.code}…`;
    $('#gate-btn').textContent = 'Tap to rejoin';
  } else if (app.selfId === res.playerId) {
    onRoomState(res.room); // a brief drop: carry on where we were
  } else {
    enterRoom(res, true);
  }
});
socket.on('disconnect', () => { if (app.selfId) toast('Connection lost. Reconnecting…', 5000); });

function leaveToMenu(message) {
  if (isRunning()) stopGame();
  app.room = null;
  app.selfId = null;
  closeModal();
  go('menu');
  if (message) toast(message, 5000);
}

function leaveRoom() {
  send('room:leave');
  leaveToMenu();
}

// ---------------------------------------------------------------------------- Lobby

function renderLobby() {
  const r = app.room;
  if (!r) return;
  const isHost = r.hostId === app.selfId;
  $('#lobby-name').textContent = r.name;
  $('#lobby-code').textContent = r.code;
  $('#lobby-lock').textContent = r.hasPassword ? '🔒' : '';
  const online = r.players.filter((p) => p.connected);
  $('#lobby-count').textContent = `(${online.length}/${r.settings.maxPlayers})`;
  $('#lobby-players').innerHTML = r.players.map((p) => `
    <li>
      <span class="dot" style="background:${esc(p.color)}"></span>
      <span class="name ${p.connected ? '' : 'off'}">${esc(p.name)}${p.id === app.selfId ? ' (you)' : ''}${p.id === r.hostId ? ' 👑' : ''}${p.connected ? '' : ' — reconnecting'}</span>
      <span>${p.ready ? '✔' : ''}</span>
      ${isHost && p.id !== app.selfId ? `<button class="kick" data-kick="${esc(p.id)}">Remove</button>` : ''}
    </li>`).join('');
  for (const b of $$('#lobby-players [data-kick]')) b.onclick = () => send('host:kick', b.dataset.kick);
  $('#lobby-settings-note').textContent = isHost ? '' : '(set by the host)';
  const sEl = $('#lobby-settings');
  if (!sEl.contains(document.activeElement)) renderSettings(sEl, r.settings, isHost, (settings) => send('room:settings', { settings }));
  const me = r.players.find((p) => p.id === app.selfId);
  $('#lobby-ready').classList.toggle('on', !!me?.ready);
  $('#lobby-ready').textContent = me?.ready ? 'Ready ✔' : "I'm ready";
  $('#lobby-start').classList.toggle('hidden', !isHost);
  const allReady = online.every((p) => p.ready || p.id === r.hostId);
  $('#lobby-start').textContent = allReady ? 'Start game' : 'Start anyway';
  if (!document.activeElement?.classList.contains('p-name')) renderProfiles();
}

$('#lobby-ready').addEventListener('click', () => {
  const me = app.room?.players.find((p) => p.id === app.selfId);
  send('player:ready', !me?.ready);
});
$('#lobby-start').addEventListener('click', () => {
  const online = app.room.players.filter((p) => p.connected).length;
  if (online < 2 && !confirm('Williams Manor is made for 2–8 players. Start on your own anyway?')) return;
  send('game:start');
});
$('#lobby-leave').addEventListener('click', leaveRoom);
$('#lobby-chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#lobby-chat-input').value.trim();
  if (v) send('chat:send', v);
  $('#lobby-chat-input').value = '';
});

// ---------------------------------------------------------------------------- Intro

const INTRO = [
  'Larkford. Thursday, 29 October. 11:47 pm.',
  'Melissa Rees, 16, was last seen walking home from school.',
  'Seven weeks later, they traced her to this mansion.',
  'The owner, Steven Williams IV, has not been found.',
  'Find what she left behind.',
];
let introTimers = [];

function playIntro(short) {
  app.introPlayed = true;
  app.introDone = false;
  go('intro');
  introTimers.forEach(clearTimeout);
  introTimers = [];
  const lines = $('#intro-lines');
  const card = $('#controls-card');
  lines.innerHTML = '';
  lines.classList.remove('hidden');
  card.classList.add('hidden');
  $('#enter-house').disabled = true;
  $('#intro-skip').classList.toggle('hidden', app.room.hostId !== app.selfId || app.room.phase !== 'briefing');
  const step = short ? 2000 : 4000;
  INTRO.forEach((text, i) => {
    introTimers.push(setTimeout(() => {
      const d = document.createElement('p');
      d.className = 'intro-line';
      d.textContent = text;
      if (i === INTRO.length - 1) {
        const mins = app.room.settings.investigationMin;
        d.innerHTML = `${esc(text)}<br><span class="clock">${mins}:00</span>`;
      }
      lines.append(d);
      requestAnimationFrame(() => d.classList.add('show'));
    }, i * step + 400));
  });
  introTimers.push(setTimeout(showControlsCard, INTRO.length * step + 1200));
}

function showControlsCard() {
  app.introDone = true;
  introTimers.forEach(clearTimeout);
  $('#intro-lines').classList.add('hidden');
  $('#intro-skip').classList.add('hidden');
  const card = $('#controls-card');
  card.classList.remove('hidden');
  controlsTabs(card, $('#controls-table'));
  if (app.room?.phase === 'investigation') enableEnter();
  else $('#enter-note').textContent = 'Waiting for the others…';
}

function enableEnter() {
  if (app.screen !== 'intro' || !app.introDone) return;
  $('#enter-house').disabled = false;
  $('#enter-note').textContent = isTouch ? 'Turn your phone sideways.' : 'The front door creaks open…';
}

$('#intro-skip').addEventListener('click', () => send('host:skipIntro'));
$('#enter-house').addEventListener('click', () => {
  audio.play('creak', { volume: 0.9, rate: 0.8 });
  enterHouse();
});

function enterHouse() {
  app.entered = true;
  introTimers.forEach(clearTimeout);
  go('game');
  startGame({ room: app.room, selfId: app.selfId, saved: app.savedState, hooks: { leave: leaveRoom } });
  app.savedState = null;
}

// ---------------------------------------------------------------------------- Helpers

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Expose for quick debugging in the console
window.wm = { app, prefs, game: debug };
