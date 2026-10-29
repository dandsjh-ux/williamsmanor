// Shared UI: modal, toast, settings panel, controls table, the newspaper clipping.

import { prefs, savePrefs, isTouch } from './prefs.js';
import { setVolume } from './audio.js';

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => [...document.querySelectorAll(sel)];

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function show(id) {
  for (const s of $$('.screen')) s.classList.toggle('active', s.id === id);
}

let toastTimer = null;
export function toast(text, ms = 3000) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- Modal

let onModalClose = null;
export function openModal(html, { onClose, clip = false } = {}) {
  $('#modal-body').innerHTML = html;
  $('#modal-box').classList.toggle('clip', clip);
  $('#modal').classList.remove('hidden');
  onModalClose = onClose || null;
  return $('#modal-body');
}
export function closeModal() {
  if ($('#modal').classList.contains('hidden')) return;
  $('#modal').classList.add('hidden');
  const fn = onModalClose;
  onModalClose = null;
  fn?.();
}
export const modalOpen = () => !$('#modal').classList.contains('hidden');
$('#modal-x').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && modalOpen() && !$('#screen-game').classList.contains('active')) closeModal(); });

// ---------------------------------------------------------------- Controls

export const CONTROLS = [
  ['Move', 'W A S D or arrow keys', 'Left virtual joystick'],
  ['Look', 'Mouse (click to lock the pointer)', 'Drag on the right half of the screen'],
  ['Jog', 'Hold Shift', 'Push the joystick to its edge'],
  ['Interact, read, pick up', 'E (hold to dig or crank)', 'Hand button (hold where needed)'],
  ['Flashlight on or off', 'F', 'Torch button'],
  ['Journal', 'Tab or J', 'Book button'],
  ['Chat', 'T or Enter', 'Speech-bubble button'],
  ['Ping', 'Q, then 1 to 4', 'Pin button'],
  ['Pause and settings', 'Esc', 'Pause button'],
  ['Puzzle overlays', 'Click and drag; Esc to close', 'Tap and drag; X to close'],
];

export function controlsTable(mode) {
  const col = mode === 'touch' ? 2 : 1;
  return CONTROLS.map((r) => `<span>${r[0]}</span><b>${esc(r[col])}</b>`).join('');
}

export function controlsTabs(root, tableEl) {
  const set = (mode) => {
    tableEl.innerHTML = controlsTable(mode);
    for (const b of root.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === mode);
  };
  for (const b of root.querySelectorAll('[data-tab]')) b.onclick = () => set(b.dataset.tab);
  set(isTouch ? 'touch' : 'keys');
}

// ---------------------------------------------------------------- Settings

export function settingsHTML() {
  return `
    <div class="row"><label for="s-vol">Volume</label><input type="range" id="s-vol" min="0" max="1" step="0.05" value="${prefs.volume}"></div>
    <div class="row"><label for="s-mouse">Mouse sensitivity</label><input type="range" id="s-mouse" min="0.3" max="2.5" step="0.1" value="${prefs.mouseSens}"></div>
    <div class="row"><label for="s-touch">Touch-look sensitivity</label><input type="range" id="s-touch" min="0.3" max="2.5" step="0.1" value="${prefs.touchSens}"></div>
    <div class="row"><label for="s-invert">Invert Y</label><input type="checkbox" id="s-invert" ${prefs.invertY ? 'checked' : ''}></div>
    <div class="row"><label for="s-captions">Captions</label><input type="checkbox" id="s-captions" ${prefs.captions ? 'checked' : ''}></div>
    <div class="row"><label for="s-gfx">Graphics</label><select id="s-gfx"><option value="high">High</option><option value="low">Low (faster)</option></select></div>
    <p class="muted small" id="s-gfx-note"></p>`;
}

export function wireSettings(root, onGraphics) {
  const q = (s) => root.querySelector(s);
  q('#s-gfx').value = prefs.graphics;
  q('#s-vol').oninput = (e) => { prefs.volume = +e.target.value; setVolume(prefs.volume); savePrefs(); };
  q('#s-mouse').oninput = (e) => { prefs.mouseSens = +e.target.value; savePrefs(); };
  q('#s-touch').oninput = (e) => { prefs.touchSens = +e.target.value; savePrefs(); };
  q('#s-invert').onchange = (e) => { prefs.invertY = e.target.checked; savePrefs(); };
  q('#s-captions').onchange = (e) => { prefs.captions = e.target.checked; savePrefs(); };
  q('#s-gfx').onchange = (e) => {
    prefs.graphics = e.target.value;
    savePrefs();
    q('#s-gfx-note').textContent = onGraphics ? '' : 'Applies the next time you enter the house.';
    onGraphics?.();
  };
}

// ---------------------------------------------------------------- Newspaper

export function clippingHTML() {
  return `
    <p class="masthead">The Larkford Gazette</p>
    <div class="dateline">THURSDAY, 29 OCTOBER 2026 &nbsp;·&nbsp; PRICE 80p</div>
    <h3>Reclusive Mansion Owner Investigated In Missing Girl's Case</h3>
    <div class="cols">
      <figure><img src="assets/melissa.jpg" alt=""><figcaption>Melissa Rees, 16.</figcaption></figure>
      <p>Melissa Rees, 16, has not been seen since Tuesday, 8 September. She left Larkford High School that afternoon and set off on her usual walk home along Hollow Lane during a heavy storm.</p>
      <p>Last week, her family received a short letter that appeared to be in Melissa's handwriting. It said she had run away and was "happy now". She was last seen near the Williams Manor.</p>
      <p>Officers who visited the manor in early October spoke briefly with the owner, Steven Williams IV, 52, and found nothing unusual. He has not been seen since.</p>
      <p>"That letter was not from my daughter," said her mother, Karen Rees. "Melissa would never spell her own name wrong."</p>
      <p>A team of investigators will enter the manor tonight.</p>
    </div>`;
}

export const HOWTO_HTML = `
  <h2>How to Play</h2>
  <p>Melissa Rees went missing seven weeks ago. Her trail ends at Williams Manor. Your team has one night to search the house.</p>
  <h3>1. Investigate</h3>
  <p>Explore the mansion together. Find the <b>12 notes</b> Melissa left behind. Some lie in plain sight; others are locked behind puzzles. Every note you find goes into everyone's journal.</p>
  <h3>2. Put the notes in order</h3>
  <p>When the clock strikes, your team drags the notes into the order they were written. Read closely: the notes themselves hold the clues to their order, and to something else.</p>
  <h3>3. The truth</h3>
  <p>How well you order the notes decides how the story ends.</p>
  <h3>Tips</h3>
  <p>Some rooms are pitch dark: use your flashlight. Split up to search faster, and use pings and chat to share what you find. You cannot be hurt, but the house does not like visitors.</p>
  <h3>Controls</h3>
  <div class="tabs"><button data-tab="keys">Keyboard</button><button data-tab="touch">Touch</button></div>
  <div class="controls-table" id="howto-controls"></div>`;

export const CREDITS_HTML = `
  <h2>Credits</h2>
  <p><b>Williams Manor</b> — a co-op horror mystery for Year 9.</p>
  <p>Built with three.js and Socket.IO. The house, textures and newspaper are generated in code.</p>
  <p class="muted">Photographs, portraits and sound effects are supplied by the game's makers. Check the licence of each before sharing the game outside your class.</p>`;
