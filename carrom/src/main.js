/* ==========================================================================
   Apna Carrom — application bootstrap: input, game loop, UI, persistence.
   No AI: both players are human, playing on the same device.
   ========================================================================== */

import { PHYSICS, RULES } from './constants.js';
import {
  createWorld, snapshotWorld, restoreWorld, stepWorld, advanceSinks,
  getStriker, resetStriker, shoot as launch, maxSpeed, allAtRest,
  countActiveCoins, returnDiscs,
} from './physics.js';
import { createMatch, cloneMatch, resolveShot, statusText } from './rules.js';
import { drawScene, makeView } from './render.js';
import * as sfx from './sound.js';
import * as store from './storage.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const deg = r => Math.round(r * 180 / Math.PI);
const rad = d => d * Math.PI / 180;

const canvas = $('#board');

const G = {
  settings: store.loadSettings(),
  world: null,
  match: null,
  view: null,
  aim: { angle: -Math.PI / 2, power: 0.55, spin: 0, pos: 0.5, show: true, pull: null },
  dragging: false,
  dragMoved: false,
  dragStart: null,
  preDragAim: null,
  accumulator: 0,
  lastTime: 0,
  settle: 0,
  shotElapsed: 0,
  shotPots: [],
  fx: [],
  undo: null,
  toastTimer: null,
  boardToastTimer: null,
  history: store.loadHistory(),
};

/* --------------------------- Physics configuration -------------------------- */
function applyPhysicsSettings() {
  const s = G.settings;
  const c = G.world.config;
  c.rolling = 60 - s.polish * 52;             // 60 → 8 cm/s²
  c.friction = 0.46 - s.polish * 0.32;        // 0.46 → 0.14 1/s
  c.restitutionWall = 0.50 + s.bounce * 0.52; // 0.50 → 1.02
  c.restitutionCoin = 0.86 + s.bounce * 0.14; // 0.86 → 1.00
  c.dt = PHYSICS.dt;
  sfx.configure({ volume: s.volume, muted: s.muted });
}

function newGame() {
  G.world = createWorld({ seed: (Date.now() & 0xffffff) || 1 });
  applyPhysicsSettings();
  G.match = createMatch([G.settings.player1, G.settings.player2], G.settings.targetScore);
  G.aim.angle = -Math.PI / 2;
  G.aim.power = 0.55;
  G.aim.spin = 0;
  G.aim.pos = 0.5;
  G.aim.pull = null;
  G.dragging = false;
  G.undo = null;
  G.fx = [];
  G.shotPots = [];
  G.settle = 0;
  G.shotElapsed = 0;
  G.accumulator = 0;
  resetStriker(G.world, G.aim.pos);
  $('#winModal').hidden = true;
  syncSliders();
  updateUI();
  save();
  toast('New match — Player 1 (white) starts');
}

/* ------------------------------- Persistence ------------------------------- */
function save() {
  if (!G.world || !G.match || G.match.phase === 'simulating') return;
  store.saveMatch({
    world: snapshotWorld(G.world),
    match: cloneMatch(G.match),
    aim: { angle: G.aim.angle, power: G.aim.power, spin: G.aim.spin, pos: G.aim.pos },
  });
}

function load() {
  const saved = store.loadMatch();
  if (!saved || !saved.match || !saved.world) { newGame(); return; }
  G.world = createWorld({ seed: (Date.now() & 0xffffff) || 1 });
  restoreWorld(G.world, saved.world);
  applyPhysicsSettings();
  G.match = saved.match;
  if (!Array.isArray(G.match.log)) G.match.log = [];
  const a = saved.aim || {};
  G.aim.angle = typeof a.angle === 'number' ? a.angle : -Math.PI / 2;
  G.aim.power = typeof a.power === 'number' ? a.power : 0.55;
  G.aim.spin = typeof a.spin === 'number' ? a.spin : 0;
  G.aim.pos = typeof a.pos === 'number' ? a.pos : 0.5;
  // Never resume mid-flight: freeze the table and hand control back.
  if (G.match.phase === 'simulating') {
    G.match.phase = 'aiming';
    for (const d of G.world.discs) { d.vx = d.vy = d.omega = 0; d.px = d.x; d.py = d.y; }
    resetStriker(G.world, G.aim.pos);
  }
  syncSettingsUI();
  syncSliders();
  updateUI();
  if (G.match.phase === 'gameover') showWin(G.match.winner, false);
  else toast('Match restored from this browser');
}

/* --------------------------------- UI sync --------------------------------- */
function syncSliders() {
  $('#powerSlider').value = Math.round(G.aim.power * 100);
  $('#angleSlider').value = deg(G.aim.angle);
  $('#spinSlider').value = Math.round(G.aim.spin * 100);
  $('#posSlider').value = Math.round(G.aim.pos * 100);
  syncAimLabels();
}
function syncAimLabels() {
  $('#powerValue').textContent = `${Math.round(G.aim.power * 100)}%`;
  const d = deg(G.aim.angle);
  $('#angleValue').textContent = `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}°`;
  const sp = Math.round(G.aim.spin * 100);
  $('#spinValue').textContent = sp === 0 ? '0' : `${sp > 0 ? '+' : '−'}${Math.abs(sp)}`;
  $('#posValue').textContent = `${Math.round(G.aim.pos * 100)}%`;
}

function syncSettingsUI() {
  const s = G.settings;
  $('#nameInput1').value = s.player1;
  $('#nameInput2').value = s.player2;
  $('#targetInput').value = s.targetScore;
  $('#polishSlider').value = Math.round(s.polish * 100);
  $('#bounceSlider').value = Math.round(s.bounce * 100);
  $('#volumeSlider').value = Math.round(s.volume * 100);
  $('#polishValue').textContent = s.polish.toFixed(2);
  $('#bounceValue').textContent = s.bounce.toFixed(2);
  $('#volumeValue').textContent = `${Math.round(s.volume * 100)}%`;
  $('#guidesChk').checked = !!s.guides;
  $('#fxChk').checked = !s.reducedFx;
  $('#muteChk').checked = !!s.muted;
  $('#soundIcon use').setAttribute('href', s.muted ? '#i-mute' : '#i-sound');
}

function coinsLeftByColor(world, color) {
  return world.discs.filter(d => d.type === color && d.active).length;
}

function updateUI() {
  const m = G.match, w = G.world, s = G.settings;
  if (!m || !w) return;

  for (let i = 0; i < 2; i++) {
    const p = m.players[i];
    $(`#name${i}`).textContent = p.name;
    $(`#score${i}`).textContent = p.score;
    $(`#player${i}`).classList.toggle('active', m.turn === i && m.phase !== 'gameover');
    const left = coinsLeftByColor(w, p.color);
    $(`#left${i}`).textContent = `${left} ${p.color} left`;
    const due = $(`#due${i}`);
    due.hidden = p.due <= 0;
    due.textContent = `${p.due} due`;
    $(`#progress${i}`).style.width = `${clamp(p.score / Math.max(1, m.target) * 100, 0, 100)}%`;
  }
  $('#targetLabel').textContent = `First to ${m.target}`;
  $('#statusText').textContent = statusText(m);
  $('#shotCount').textContent = m.shotCount;
  $('#coinsLeft').textContent = countActiveCoins(w);
  $('#speedReadout').textContent = Math.round(maxSpeed(w));

  const q = $('#queenStatus');
  q.parentElement.classList.remove('pending', 'covered');
  if (m.queen.status === 'pending') {
    q.textContent = `Queen waiting — ${m.players[m.queen.by].name} must cover it`;
    q.parentElement.classList.add('pending');
  } else if (m.queen.status === 'covered') {
    q.textContent = `Queen covered by ${m.players[m.queen.by].name} (+${RULES.queenPoints})`;
    q.parentElement.classList.add('covered');
  } else {
    q.textContent = 'Queen on the board';
  }

  const canShoot = m.phase === 'aiming';
  $('#shootBtn').disabled = !canShoot;
  $('#undoBtn').disabled = !G.undo || !canShoot;
  $('#boardHelp').innerHTML = canShoot
    ? '<b>Drag back</b> from anywhere on the board to aim · <b>Release</b> to shoot · <b>Space</b> for the current settings'
    : (m.phase === 'simulating' ? '<b>Shot in progress…</b> watch the collisions' : '<b>Match over</b> — start a new game');

  renderLog();
  renderHistory();
  syncAimLabels();
}

function renderLog() {
  const list = $('#logList');
  const items = (G.match.log || []).slice(-9).reverse();
  if (!items.length) { list.innerHTML = '<li class="log-empty">No shots yet. Drag back from the striker to begin.</li>'; return; }
  list.innerHTML = items.map(e => `<li class="${esc(e.kind || '')}"><b>#${e.n}</b> ${esc(e.text)}</li>`).join('');
}

function renderHistory() {
  const list = $('#historyList');
  if (!G.history.length) { list.innerHTML = '<li class="log-empty">No finished matches yet.</li>'; return; }
  list.innerHTML = G.history.slice(0, 8).map(h =>
    `<li><b>${esc(h.winner || 'Draw')}</b> · ${esc(h.score)} · ${h.shots} shots</li>`).join('');
}

function toast(message, bad = false) {
  const el = document.createElement('div');
  el.className = `toast ${bad ? 'bad' : ''}`;
  el.innerHTML = `${icon(bad ? 'i-close' : 'i-check')}<span>${esc(message)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2400);
}

function boardToast(message) {
  const el = $('#boardToast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(G.boardToastTimer);
  G.boardToastTimer = setTimeout(() => { el.hidden = true; }, 1500);
}

/* -------------------------------- Effects ---------------------------------- */
function spawnImpact(x, y, strength, kind) {
  if (G.settings.reducedFx) return;
  const n = clamp(Math.round(strength / 45), 1, 5);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 14;
    G.fx.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.28 + Math.random() * 0.22, maxLife: 0.5,
      size: 0.10 + Math.random() * 0.12,
      color: kind === 'wall' ? 'rgba(120,180,190,.85)' : 'rgba(255,222,160,.9)',
    });
  }
  if (G.fx.length > 160) G.fx.splice(0, G.fx.length - 160);
}
function spawnPocket(x, y, queen) {
  if (G.settings.reducedFx) return;
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 6 + Math.random() * 18;
    G.fx.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.3, maxLife: 0.65,
      size: 0.12, color: queen ? 'rgba(255,170,120,.95)' : 'rgba(255,240,200,.9)',
    });
  }
}
function updateFx(dt) {
  for (const p of G.fx) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
    p.life -= dt;
  }
  G.fx = G.fx.filter(p => p.life > 0);
}

/* ------------------------------- Shot cycle -------------------------------- */
function fireShot() {
  const m = G.match;
  if (!m || m.phase !== 'aiming') return;
  if (G.aim.power < 0.02) { toast('Set a little power first', true); return; }
  sfx.unlock();
  G.undo = {
    world: snapshotWorld(G.world),
    match: cloneMatch(m),
    aim: { angle: G.aim.angle, power: G.aim.power, spin: G.aim.spin, pos: G.aim.pos },
  };
  G.shotPots = [];
  G.fx = [];
  G.settle = 0;
  G.shotElapsed = 0;
  G.accumulator = 0;
  G.aim.pull = null;
  m.phase = 'simulating';
  launch(G.world, G.aim.angle, G.aim.power, G.aim.spin);
  sfx.shootSfx(G.aim.power);
  const s = getStriker(G.world);
  if (s) spawnImpact(s.x, s.y, 180, 'collision');
  updateUI();
}

function handleEvents(events) {
  for (const e of events) {
    if (e.type === 'collision' || e.type === 'wall') {
      sfx.impact(e.strength, e.type);
      spawnImpact(e.x, e.y, e.strength, e.type);
    } else if (e.type === 'pot') {
      G.shotPots.push(e);
      sfx.pocketSfx(e.disc.type === 'queen');
      spawnPocket(e.pocket.x, e.pocket.y, e.disc.type === 'queen');
      if (e.disc.type === 'striker') boardToast('Foul — striker potted!');
      else if (e.disc.type === 'queen') boardToast('Queen potted — cover it!');
    }
  }
}

function finalizeShot() {
  const m = G.match, w = G.world;
  if (!m || m.phase !== 'simulating') return;
  const pots = G.shotPots.map(e => ({ type: e.disc.type }));
  const activeCoins = countActiveCoins(w);
  const res = resolveShot(m, pots, activeCoins);

  if (res.returns.length) returnDiscs(w, res.returns);
  for (const msg of res.messages) addLog(msg, res.summary.striker ? 'bad' : (msg.includes('Queen') ? 'queen' : 'good'));
  if (!res.messages.length) addLog('No coin potted — turn passes.', '');
  if (res.summary.striker) sfx.foulSfx();

  if (res.gameOver) {
    m.phase = 'gameover';
    G.history = store.loadHistory();
    showWin(res.winner, true);
  } else {
    m.phase = 'aiming';
    resetStriker(w, G.aim.pos);
    if (m.queen.status === 'pending') boardToast('Cover the queen!');
    else if (res.extraTurn) boardToast(`${m.players[m.turn].name} shoots again`);
    else boardToast(`${m.players[m.turn].name}'s turn`);
  }
  updateUI();
  save();
}

function addLog(text, kind) {
  G.match.log.push({ n: G.match.shotCount, text, kind });
  if (G.match.log.length > 60) G.match.log.shift();
}

function undoShot() {
  if (!G.undo || G.match.phase !== 'aiming') { toast('Nothing to undo', true); return; }
  restoreWorld(G.world, G.undo.world);
  G.match = G.undo.match;
  Object.assign(G.aim, G.undo.aim);
  G.undo = null;
  G.shotPots = []; G.fx = []; G.settle = 0;
  G.match.phase = 'aiming';
  syncSliders(); updateUI(); save();
  toast('Last shot undone');
  boardToast('Shot undone');
}

/* --------------------------------- Winner ---------------------------------- */
function showWin(winner, record) {
  const m = G.match;
  const label = winner === null ? "It's a draw!" : `${m.players[winner].name} wins!`;
  $('#winTitle').textContent = label;
  $('#winScore').textContent = `${m.players[0].score} — ${m.players[1].score}`;
  $('#winDetail').textContent = `${m.shotCount} shots played · first to ${m.target}`;
  if (record) {
    store.pushHistory({ winner: label, score: `${m.players[0].score}–${m.players[1].score}`, shots: m.shotCount });
    G.history = store.loadHistory();
    renderHistory();
  }
  $('#winModal').hidden = false;
  makeConfetti();
  sfx.winSfx();
}

function makeConfetti() {
  const box = $('#confetti');
  box.innerHTML = '';
  if (G.settings.reducedFx) return;
  const colors = ['#f2bd68', '#ef9a52', '#83cfe0', '#d8444c', '#49c98a', '#f6e3bb'];
  for (let i = 0; i < 46; i++) {
    const el = document.createElement('i');
    el.style.left = `${Math.random() * 100}%`;
    el.style.background = colors[i % colors.length];
    el.style.animationDuration = `${1.8 + Math.random() * 1.8}s`;
    el.style.animationDelay = `${Math.random() * 0.7}s`;
    box.appendChild(el);
  }
}

/* --------------------------------- Input ----------------------------------- */
function pointerWorld(e) {
  const v = G.view || makeView(canvas);
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width ? v.cssW / rect.width : 1;
  const sy = rect.height ? v.cssH / rect.height : 1;
  const px = (e.clientX - rect.left) * sx;
  const py = (e.clientY - rect.top) * sy;
  return { x: (px - v.ox) / v.scale, y: (py - v.oy) / v.scale };
}

function onPointerDown(e) {
  if (G.match.phase !== 'aiming') return;
  sfx.unlock();
  const s = getStriker(G.world);
  if (!s) return;
  G.dragging = true;
  G.dragMoved = false;
  G.dragStart = { x: s.x, y: s.y };
  G.preDragAim = { angle: G.aim.angle, power: G.aim.power, spin: G.aim.spin, pos: G.aim.pos };
  G.aim.pull = pointerWorld(e);
  try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ }
  e.preventDefault();
}

function onPointerMove(e) {
  if (!G.dragging || !G.dragStart) return;
  const p = pointerWorld(e);
  const dx = p.x - G.dragStart.x, dy = p.y - G.dragStart.y;
  const dist = Math.hypot(dx, dy);
  G.aim.pull = p;
  if (dist > 0.3) {
    G.dragMoved = true;
    G.aim.angle = Math.atan2(-dy, -dx);
    G.aim.power = clamp(dist / PHYSICS.maxPull, 0, 1);
  }
  syncSliders();
  e.preventDefault();
}

function onPointerUp(e) {
  if (!G.dragging) return;
  G.dragging = false;
  G.aim.pull = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  if (G.dragMoved && G.aim.power >= 0.035) fireShot();
  else if (G.preDragAim) Object.assign(G.aim, G.preDragAim);
  G.dragMoved = false;
  G.preDragAim = null;
  syncSliders();
  e.preventDefault();
}

function cancelDrag() {
  if (!G.dragging) return;
  G.dragging = false;
  G.dragMoved = false;
  G.aim.pull = null;
  if (G.preDragAim) Object.assign(G.aim, G.preDragAim);
  G.preDragAim = null;
  syncSliders();
}

function onKeyDown(e) {
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const k = e.key.toLowerCase();
  // Let focused controls handle their own Space/Enter activation.
  if ((k === ' ' || k === 'enter') && /^(button|a|select|textarea|input)$/.test(tag)) return;
  if (k === 'escape') {
    if (!$('#rulesModal').hidden) $('#rulesModal').hidden = true;
    else if (!$('#winModal').hidden) $('#winModal').hidden = true;
    else cancelDrag();
    return;
  }
  if (k === 'm') { toggleMute(); return; }
  if (k === 'u') { undoShot(); return; }
  if (k === 'r') { if (G.match.phase === 'aiming') { resetStriker(G.world, G.aim.pos); toast('Striker reset'); } return; }
  if (k === ' ' || k === 'enter') { e.preventDefault(); fireShot(); return; }
  if (G.match.phase !== 'aiming') return;
  let handled = true;
  switch (k) {
    case 'arrowleft': G.aim.pos = clamp(G.aim.pos - 0.02, 0, 1); break;
    case 'arrowright': G.aim.pos = clamp(G.aim.pos + 0.02, 0, 1); break;
    case 'a': G.aim.angle -= rad(2); break;
    case 'd': G.aim.angle += rad(2); break;
    case 'w': G.aim.power = clamp(G.aim.power + 0.04, 0, 1); break;
    case 's': G.aim.power = clamp(G.aim.power - 0.04, 0, 1); break;
    case 'q': G.aim.spin = clamp(G.aim.spin - 0.1, -1, 1); break;
    case 'e': G.aim.spin = clamp(G.aim.spin + 0.1, -1, 1); break;
    default: handled = false;
  }
  if (!handled) return;
  e.preventDefault();
  if (k === 'arrowleft' || k === 'arrowright') resetStriker(G.world, G.aim.pos);
  if (G.aim.angle > Math.PI) G.aim.angle -= Math.PI * 2;
  if (G.aim.angle < -Math.PI) G.aim.angle += Math.PI * 2;
  syncSliders();
  save();
}

/* --------------------------------- Wiring ---------------------------------- */
function toggleMute() {
  G.settings.muted = !G.settings.muted;
  sfx.configure({ muted: G.settings.muted });
  $('#muteChk').checked = G.settings.muted;
  $('#soundIcon use').setAttribute('href', G.settings.muted ? '#i-mute' : '#i-sound');
  store.saveSettings(G.settings);
  toast(G.settings.muted ? 'Sound muted' : 'Sound on');
}

function readSettingsForm() {
  const s = G.settings;
  s.player1 = ($('#nameInput1').value || 'Player 1').trim().slice(0, 18);
  s.player2 = ($('#nameInput2').value || 'Player 2').trim().slice(0, 18);
  s.targetScore = clamp(parseInt($('#targetInput').value, 10) || RULES.targetScore, 1, 25);
  s.polish = clamp(Number($('#polishSlider').value) / 100, 0, 1);
  s.bounce = clamp(Number($('#bounceSlider').value) / 100, 0, 1);
  s.volume = clamp(Number($('#volumeSlider').value) / 100, 0, 1);
  s.guides = $('#guidesChk').checked;
  s.reducedFx = !$('#fxChk').checked;
  s.muted = $('#muteChk').checked;
  store.saveSettings(s);
  applyPhysicsSettings();
  if (G.match) {
    G.match.players[0].name = s.player1;
    G.match.players[1].name = s.player2;
  }
  syncSettingsUI();
  updateUI();
  save();
}

function wire() {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', cancelDrag);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
  document.addEventListener('keydown', () => sfx.unlock(), { once: true });
  window.addEventListener('resize', () => { G.view = makeView(canvas); });
  window.addEventListener('beforeunload', save);

  $('#shootBtn').addEventListener('click', fireShot);
  $('#resetStrikerBtn').addEventListener('click', () => {
    if (G.match.phase !== 'aiming') return;
    resetStriker(G.world, G.aim.pos); toast('Striker reset to baseline');
  });
  $('#undoBtn').addEventListener('click', undoShot);
  $('#newGameBtn').addEventListener('click', () => {
    if (G.match.shotCount > 0 && G.match.phase !== 'gameover' && !window.confirm('Start a new match? The current game will be lost.')) return;
    newGame();
  });
  $('#soundBtn').addEventListener('click', toggleMute);
  $('#rulesBtn').addEventListener('click', () => { $('#rulesModal').hidden = false; sfx.uiSfx(); });
  $('#closeRules').addEventListener('click', () => { $('#rulesModal').hidden = true; });
  $('#rulesOk').addEventListener('click', () => { $('#rulesModal').hidden = true; });
  $('#rulesModal').addEventListener('click', e => { if (e.target.id === 'rulesModal') $('#rulesModal').hidden = true; });
  $('#closeWinBtn').addEventListener('click', () => { $('#winModal').hidden = true; });
  $('#playAgainBtn').addEventListener('click', () => { $('#winModal').hidden = true; newGame(); });
  $('#clearLogBtn').addEventListener('click', () => { G.match.log = []; renderLog(); save(); });
  $('#clearHistoryBtn').addEventListener('click', () => { store.clearHistory(); G.history = []; renderHistory(); toast('History cleared'); });
  $('#applySettingsBtn').addEventListener('click', () => { readSettingsForm(); toast('Settings applied'); sfx.uiSfx(); });

  const bindRange = (sel, fn) => $(sel).addEventListener('input', e => { fn(Number(e.target.value)); syncAimLabels(); save(); });
  bindRange('#powerSlider', v => { G.aim.power = v / 100; });
  bindRange('#angleSlider', v => { G.aim.angle = rad(v); });
  bindRange('#spinSlider', v => { G.aim.spin = v / 100; });
  bindRange('#posSlider', v => {
    G.aim.pos = v / 100;
    if (G.match && G.match.phase === 'aiming') resetStriker(G.world, G.aim.pos);
  });

  for (const sel of ['#polishSlider', '#bounceSlider', '#volumeSlider', '#guidesChk', '#fxChk', '#muteChk']) {
    $(sel).addEventListener('input', () => { readSettingsForm(); });
  }
  for (const sel of ['#nameInput1', '#nameInput2', '#targetInput']) {
    $(sel).addEventListener('change', () => { readSettingsForm(); });
  }
}

/* -------------------------------- Game loop -------------------------------- */
function frame(now) {
  const dtReal = G.lastTime ? Math.min(0.05, (now - G.lastTime) / 1000) : 0;
  G.lastTime = now;
  advanceSinks(G.world, dtReal);
  updateFx(dtReal);

  if (G.match.phase === 'simulating') {
    G.accumulator += dtReal;
    let steps = 0;
    while (G.accumulator >= G.world.config.dt && steps < 14) {
      handleEvents(stepWorld(G.world, G.world.config.dt));
      G.accumulator -= G.world.config.dt;
      steps++;
    }
    G.shotElapsed += dtReal;
    if (allAtRest(G.world, 1.2)) G.settle += dtReal; else G.settle = 0;
    if (G.settle > 0.45 || G.shotElapsed > 18) {
      finalizeShot();
      G.accumulator = 0;
    }
    $('#speedReadout').textContent = Math.round(maxSpeed(G.world));
  }

  const alpha = G.match.phase === 'simulating'
    ? clamp(G.accumulator / G.world.config.dt, 0, 1) : 1;
  G.view = drawScene(canvas, G.world, G.match, {
    alpha,
    aim: { ...G.aim, show: G.match.phase === 'aiming' && G.settings.guides },
    fx: G.fx,
  });
  requestAnimationFrame(frame);
}

/* ---------------------------------- Init ----------------------------------- */
function init() {
  sfx.configure({ volume: G.settings.volume, muted: G.settings.muted });
  document.documentElement.dataset.theme = G.settings.theme || 'dark';
  G.view = makeView(canvas);
  wire();
  syncSettingsUI();
  load();
  requestAnimationFrame(frame);
}

init();
