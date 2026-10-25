/* ==========================================================================
   Apna Carrom — synthesised sound.  No audio files, no network requests.
   Every effect is generated with the Web Audio API on first user gesture.
   ========================================================================== */

let ctx = null;
let volume = 0.6;
let muted = false;
let collisionBudget = 0;
let lastRefill = 0;

export function configure({ volume: v, muted: m } = {}) {
  if (typeof v === 'number') volume = Math.max(0, Math.min(1, v));
  if (typeof m === 'boolean') muted = m;
}

export function unlock() {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch { /* audio unavailable — game stays fully playable */ }
}

function ready() { return !!ctx && !muted && volume > 0.001 && ctx.state !== 'closed'; }

function env(node, t0, peak, attack, decay) {
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone({ freq = 440, type = 'sine', dur = 0.09, gain = 0.2, sweep = 0, delay = 0, q = 0 }) {
  if (!ready()) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t0 + dur);
  let tail = amp;
  if (q) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    amp.connect(filter);
    tail = filter;
  }
  env(amp, t0, gain * volume, 0.004, dur);
  osc.connect(amp);
  tail.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise({ dur = 0.05, gain = 0.15, freq = 1800, delay = 0 }) {
  if (!ready()) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = 0.8;
  const amp = ctx.createGain();
  env(amp, t0, gain * volume, 0.002, dur);
  src.connect(filter); filter.connect(amp); amp.connect(ctx.destination);
  src.start(t0);
}

/** Disc↔disc click and cushion thud. `strength` is impact speed in cm/s. */
export function impact(strength, kind = 'collision') {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (now - lastRefill > 60) { lastRefill = now; collisionBudget = 9; }
  if (collisionBudget <= 0) return;
  collisionBudget--;
  const s = Math.min(1, Math.max(0.08, strength / 260));
  if (kind === 'wall') {
    tone({ freq: 150 + s * 90, type: 'triangle', dur: 0.075, gain: 0.05 + s * 0.10, sweep: -70 });
    noise({ dur: 0.035, gain: 0.02 + s * 0.035, freq: 700 });
  } else {
    tone({ freq: 820 + s * 900, type: 'triangle', dur: 0.045, gain: 0.045 + s * 0.12, sweep: -420, q: 1.4 });
    noise({ dur: 0.025, gain: 0.018 + s * 0.05, freq: 2600 + s * 1800 });
  }
}

export function shootSfx(power) {
  tone({ freq: 210 + power * 130, type: 'sine', dur: 0.11, gain: 0.16, sweep: 260 });
  noise({ dur: 0.06, gain: 0.05, freq: 1200 });
}

export function pocketSfx(queen = false) {
  tone({ freq: queen ? 520 : 380, type: 'sine', dur: 0.20, gain: 0.20, sweep: -240 });
  tone({ freq: queen ? 780 : 560, type: 'sine', dur: 0.13, gain: 0.09, sweep: -180, delay: 0.045 });
  noise({ dur: 0.09, gain: 0.05, freq: 500, delay: 0.02 });
}

export function foulSfx() {
  tone({ freq: 180, type: 'sawtooth', dur: 0.22, gain: 0.10, sweep: -80 });
  tone({ freq: 120, type: 'square', dur: 0.16, gain: 0.05, delay: 0.06 });
}

export function winSfx() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone({ freq: f, type: 'triangle', dur: 0.30, gain: 0.13, delay: i * 0.12 }));
}

export function uiSfx() {
  tone({ freq: 660, type: 'sine', dur: 0.045, gain: 0.055, sweep: 180 });
}

export function setVolume(v) { configure({ volume: v }); }
export function setMuted(m) { configure({ muted: m }); }
