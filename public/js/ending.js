// The three endings, played as a short sequence of panels, then the results screen
// that shows how the killer gave himself away.

import { $, esc } from './ui.js';
import { NOTES, EVIDENCE } from './data/notes.js';
import { LEDGER } from './game/puzzles.js';
import * as audio from './audio.js';

const ENDINGS = {
  author: {
    title: 'The Author',
    headline: 'MELISSA REES BROUGHT HOME — POLICE HUNT FOR MANOR OWNER',
    story: 'Melissa Rees, 16, has been brought home. Investigators proved that every note found in Williams Manor was written by its owner, Steven Williams IV, 52, and not by Melissa. Police are searching for him. "We knew that letter was not from her," said her mother, Karen Rees.',
  },
  unfinished: {
    title: 'Unfinished Story',
    headline: "MISSING GIRL'S DEATH CONFIRMED — MANOR OWNER STILL MISSING",
    story: 'Investigators have confirmed that Melissa Rees, 16, died at Williams Manor in September. Who wrote the notes found in the house is still unclear. The owner, Steven Williams IV, 52, has not been found.',
  },
  runaway: {
    title: 'The Runaway',
    headline: 'POLICE SAY MISSING TEEN "RAN AWAY"',
    story: 'Police have closed the case of Melissa Rees, 16, saying she most likely ran away. "The letter speaks for itself," a spokesperson said. Her mother, Karen Rees, does not believe it.',
  },
};

let timers = [];
let sounds = [];
let onDone = null;

function newspaper(e) {
  return `<div class="clipping ending-clip">
    <p class="masthead">The Larkford Gazette</p>
    <div class="dateline">FRIDAY, 6 NOVEMBER 2026</div>
    <h3>${esc(e.headline)}</h3>
    <div class="cols"><figure><img src="assets/melissa.jpg" alt=""><figcaption>Melissa Rees, 16.</figcaption></figure><p>${esc(e.story)}</p></div>
  </div>`;
}

function panels(kind) {
  const e = ENDINGS[kind];
  const note = NOTES[9];
  if (kind === 'author') {
    return [
      { ms: 6500, html: `<div class="same-hand"><div class="note-paper morph"><p>${esc(note.text.slice(0, 150))}…</p></div><div class="note-paper ledger morph late"><p><b>22 Oct</b> — Posted the letter. Melisa is happy now.</p><p><b>29 Oct</b> — Paper, two hundred sheets. Ink, black.</p></div></div><p class="ending-line small">The notes and Steven's ledger. The same hand.</p>`, sound: 'paper_pickup' },
      { ms: 4500, html: '<p class="ending-line big">Melissa never wrote a word of it.</p>' },
      { ms: 5500, html: '<p class="ending-line">The Study bookcase grinds open.</p><p class="ending-line late">Behind it, a small room. Stacks of pages. A pen. The ink is still wet.</p>', sound: 'creak', rate: 0.5 },
      { ms: 4000, html: '<p class="ending-line">But no Steven.</p><p class="ending-line late">He is never found.</p>' },
      { ms: 7000, html: newspaper(e) },
      { ms: 7000, html: '<div class="note-paper fresh-page"><p class="typed" data-text="Dear investigators,"></p></div>', type: true },
    ];
  }
  if (kind === 'unfinished') {
    return [
      { ms: 4500, html: '<p class="ending-line">You proved Melissa died in this house.</p>' },
      { ms: 4500, html: '<p class="ending-line">But not who wrote the notes.</p>' },
      { ms: 7000, html: newspaper(e) },
      { ms: 6500, html: '<p class="ending-line small">That night, a page slides under the door.</p><div class="note-paper slide-in"><p>You missed one.</p></div>', sound: 'paper_pickup' },
    ];
  }
  return [
    { ms: 4500, html: '<p class="ending-line">The case closes as a runaway.</p>' },
    { ms: 4500, html: '<p class="ending-line">Exactly the story Steven wanted.</p>' },
    { ms: 7000, html: newspaper(e) },
    { ms: 6500, html: '<p class="ending-line small">On the wall behind you:</p><p class="wall-scrawl">THANK YOU FOR BELIEVING ME. — M.</p>', sound: 'scratch' },
  ];
}

export function playEnding(ending, done) {
  stop();
  onDone = done;
  const list = panels(ending.kind);
  const stage = $('#ending-stage');
  sounds = [audio.play('rain_loop', { loop: true, volume: 0.25, fadeIn: 2 }), audio.play('music_box', { loop: true, volume: 0.3, fadeIn: 3 })];
  let t = 400;
  list.forEach((p) => {
    timers.push(setTimeout(() => {
      stage.innerHTML = `<div class="panel-in">${p.html}</div>`;
      if (p.sound) audio.play(p.sound, { volume: 0.8, rate: p.rate || 1 });
      if (p.type) typeOut(stage.querySelector('.typed'));
    }, t));
    t += p.ms;
  });
  timers.push(setTimeout(finish, t));
}

function typeOut(el) {
  const text = el.dataset.text;
  let i = 0;
  const step = () => {
    el.textContent = text.slice(0, ++i);
    if (i < text.length) timers.push(setTimeout(step, 140));
  };
  timers.push(setTimeout(step, 800));
}

function stop() {
  timers.forEach(clearTimeout);
  timers = [];
  sounds.forEach((s) => s.stop(1.5));
  sounds = [];
}

function finish() {
  stop();
  const fn = onDone;
  onDone = null;
  fn?.();
}

$('#ending-skip').addEventListener('click', finish);

// ---------------------------------------------------------------------------- Results

function highlight(text, ev) {
  let html = esc(text);
  for (const t of ev.tells || []) html = html.replace(esc(t), `<mark class="tell">${esc(t)}</mark>`);
  for (const c of ev.clues || []) html = html.replace(esc(c), `<mark class="clue">${esc(c)}</mark>`);
  return html;
}

export function renderResults(room, selfId, { playAgain, leave }) {
  const e = room.ending;
  const info = ENDINGS[e.kind];
  const isHost = room.hostId === selfId;
  const placed = Object.fromEntries(e.order.map((id, i) => [id, i + 1]));
  const ledger = LEDGER.map(([d, t]) => `<p><b>${esc(d)}</b> — ${t.includes('Melisa') ? esc(t).replace('Melisa', '<mark class="tell">Melisa</mark>') : esc(t)}</p>`).join('');
  const stats = [...e.stats].sort((a, b) => b.notes + b.puzzles - (a.notes + a.puzzles));

  $('#results').innerHTML = `
    <h2>${esc(info.title)}</h2>
    <p class="muted">${e.correct} of 12 notes in the right place.</p>
    <p class="legend"><mark class="clue">Order clue</mark> words that show where a note belongs · <mark class="tell">The tell</mark> words Melissa could never have written</p>
    <ol class="evidence">
      ${NOTES.map((n) => {
        const ev = EVIDENCE[n.id];
        const ok = placed[n.id] === n.id;
        const found = room.notes?.[n.id];
        return `<li class="${ok ? 'ok' : 'wrong'}">
          <div class="ev-head"><b>${esc(n.title)}</b><span>${ok ? '✓ placed correctly' : `✗ you placed it ${placed[n.id]}${['st', 'nd', 'rd'][placed[n.id] - 1] || 'th'}`}</span>${found ? `<small style="color:${esc(found.color)}">found by ${esc(found.by)}</small>` : '<small class="muted">not found</small>'}</div>
          <p class="ev-text">${highlight(n.text, ev)}</p>
          <p class="ev-why">${esc(ev.why)}${ev.tell ? ` <strong>Tell:</strong> ${esc(ev.tell)}` : ''}</p>
        </li>`;
      }).join('')}
    </ol>
    <h3>Extra evidence: Steven's ledger${room.puzzles?.studyLock?.solved ? '' : ' (still locked in the Study, code 37)'}</h3>
    <div class="note-paper ledger">${ledger}</div>
    <p class="muted small">The ledger is in the same handwriting as every note, and spells her name the same wrong way.</p>
    <h3>The team</h3>
    <table class="stats"><tr><th>Investigator</th><th>Notes found</th><th>Puzzles solved</th></tr>
      ${stats.map((p) => `<tr><td><span class="dot" style="background:${esc(p.color)}"></span> ${esc(p.name)}</td><td>${p.notes}</td><td>${p.puzzles}</td></tr>`).join('')}
    </table>
    <div class="lobby-actions">
      ${isHost ? '<button class="btn big" id="res-again">Play again</button>' : '<p class="muted">The host can start another game.</p>'}
      <button class="btn ghost" id="res-leave">Leave</button>
    </div>`;
  $('#res-again')?.addEventListener('click', playAgain);
  $('#res-leave').addEventListener('click', leave);
}
