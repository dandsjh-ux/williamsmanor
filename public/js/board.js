// The evidence board: 12 note cards dragged into order by the whole team at once.
// Moves sync live; a card being dragged shows the colour of the player holding it.

import { send } from './net.js';
import { $, esc, openModal } from './ui.js';
import { noteById, firstLine } from './data/notes.js';
import { ledgerHTML } from './game/puzzles.js';
import * as audio from './audio.js';

let room = null, selfId = null, timerAt = 0;
let drag = null; // { id, el, ghost, startX, startY, moved }

let pending = null;

export function renderBoard(r, me) {
  room = r;
  selfId = me;
  timerAt = performance.now();
  if (drag) { pending = [r, me]; return; } // never rebuild the card under someone's finger
  const b = r.board;
  if (!b) return;
  const isHost = r.hostId === selfId;
  const playerById = Object.fromEntries(r.players.map((p) => [p.id, p]));
  const hidden = r.settings.unfoundNotes === 'hidden';
  const anyLedger = !!r.puzzles?.studyLock?.solved;

  $('#board').innerHTML = b.order.map((id, i) => {
    const n = noteById(id);
    const found = r.notes?.[id];
    const holder = b.holders?.[id] && b.holders[id] !== selfId ? playerById[b.holders[id]] : null;
    const arrow = b.last?.arrows?.[id];
    let body;
    if (found) body = `<h4>${esc(n.title)}</h4><p>${esc(n.text.slice(0, 120))}${n.text.length > 120 ? '…' : ''}</p>`;
    else if (hidden) body = `<h4>A missing page</h4><p class="muted">Nobody found this note.</p>`;
    else body = `<h4>Torn fragment</h4><p>${esc(firstLine(n.text))}</p>`;
    return `
      <div class="card ${found ? '' : hidden ? 'missing' : 'torn'} ${holder ? 'held' : ''}" data-id="${id}" data-i="${i}" style="${holder ? `--holder:${esc(holder.color)}` : ''}">
        <span class="slot">${i + 1}</span>
        ${holder ? `<span class="holder">${esc(holder.name)}</span>` : ''}
        ${arrow ? `<span class="arrow ${arrow}">${arrow === 'earlier' ? '◀ earlier' : 'later ▶'}</span>` : ''}
        ${body}
      </div>`;
  }).join('');

  const banner = $('#board-banner');
  if (b.last) {
    banner.classList.remove('hidden');
    banner.textContent = `${b.last.correct} of 12 in the right place. The arrows show which way each misplaced note should move.${b.proposedBy ? ` — ${b.proposedBy} has proposed a new order.` : ''}`;
  } else if (b.proposedBy) {
    banner.classList.remove('hidden');
    banner.textContent = `${b.proposedBy} proposes this order. ${isHost ? 'Lock it in when everyone agrees.' : 'The host can lock it in.'}`;
  } else banner.classList.add('hidden');

  $('#board-attempts').textContent = `${b.attemptsLeft} lock-in ${b.attemptsLeft === 1 ? 'attempt' : 'attempts'} left`;
  $('#board-lockin').classList.toggle('hidden', !isHost);
  $('#board-ledger').classList.toggle('hidden', !anyLedger);
  for (const card of document.querySelectorAll('#board .card')) card.addEventListener('pointerdown', onDown);
}

export function tickBoard() {
  const t = room?.timer;
  const el = $('#board-timer');
  if (!el) return;
  if (!t || t.untimed || t.left == null) { el.textContent = 'Untimed'; return; }
  const left = t.paused ? t.left : Math.max(0, t.left - (performance.now() - timerAt));
  const s = Math.ceil(left / 1000);
  el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  el.classList.toggle('low', left < 60000);
}

// ---------------------------------------------------------------------------- Dragging

function onDown(e) {
  if (drag) return;
  const el = e.currentTarget;
  drag = { id: +el.dataset.id, el, startX: e.clientX, startY: e.clientY, moved: false, pointer: e.pointerId };
  try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

function onMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) < 8) return;
  if (!drag.moved) {
    drag.moved = true;
    drag.el.classList.add('dragging');
    send('board:grab', drag.id);
  }
  drag.el.style.transform = `translate(${dx}px, ${dy}px) rotate(2deg)`;
  const over = slotAt(e.clientX, e.clientY, drag.el);
  for (const c of document.querySelectorAll('#board .card')) c.classList.toggle('over', c === over);
}

function onUp(e) {
  const d = drag;
  drag = null;
  if (!d) return;
  d.el.removeEventListener('pointermove', onMove);
  d.el.removeEventListener('pointerup', onUp);
  d.el.removeEventListener('pointercancel', onUp);
  if (!d.moved) {
    readCard(d.id);
    if (pending) { renderBoard(...pending); pending = null; }
    return;
  }
  const over = slotAt(e.clientX, e.clientY, d.el);
  d.el.style.transform = '';
  d.el.classList.remove('dragging');
  for (const c of document.querySelectorAll('#board .card')) c.classList.remove('over');
  if (over && over !== d.el) {
    send('board:move', { id: d.id, to: +over.dataset.i });
    audio.play('paper_pickup', { volume: 0.35, rate: 1.3 });
  }
  send('board:release');
  if (pending) { renderBoard(...pending); pending = null; }
}

function slotAt(x, y, skip) {
  let best = null, bestD = Infinity;
  for (const c of document.querySelectorAll('#board .card')) {
    if (c === skip) continue;
    const r = c.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return c;
    const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
    if (d < bestD && d < r.width) { best = c; bestD = d; }
  }
  return best;
}

function readCard(id) {
  const n = noteById(id);
  const found = room.notes?.[id];
  if (found) {
    openModal(`<div class="note-paper"><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p></div><p class="note-by">Found by <b style="color:${esc(found.color)}">${esc(found.by)}</b></p>`);
  } else if (room.settings.unfoundNotes === 'hidden') {
    openModal('<h2>A missing page</h2><p class="muted">Nobody found this note in the house. Where does it belong?</p>');
  } else {
    openModal(`<div class="note-paper torn-paper"><h3>Torn fragment</h3><p>${esc(firstLine(n.text))} …</p></div><p class="note-by">The rest of this note was never found.</p>`);
  }
}

// ---------------------------------------------------------------------------- Buttons

$('#board-propose').addEventListener('click', () => send('board:propose'));
$('#board-lockin').addEventListener('click', () => {
  const left = room?.board?.attemptsLeft ?? 0;
  if (confirm(`Lock in this order for the whole team? ${left === 1 ? 'This is your last attempt.' : `${left} attempts left.`}`)) send('board:lockin');
});
$('#board-ledger').addEventListener('click', () => openModal(`<h2>Steven's ledger</h2><p class="muted">Found in the Study.</p>${ledgerHTML()}`));
$('#board-chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#board-chat-input').value.trim();
  if (v) send('chat:send', v);
  $('#board-chat-input').value = '';
});
