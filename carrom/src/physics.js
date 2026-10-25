/* ==========================================================================
   Apna Carrom — 2D rigid-disc physics.

   Pure module: no DOM, no canvas, no Web Audio.  Everything is deterministic
   given a seed, which makes it unit-testable under `node --test`.

   Model
   -----
   • Discs are rigid circles with mass, moment of inertia I = ½mr², linear
     velocity and angular velocity (spin).
   • Fixed timestep + adaptive sub-stepping so fast discs cannot tunnel.
   • Sequential-impulse collision solver: normal impulse with restitution,
     Coulomb tangential impulse with spin transfer, plus Baumgarte-style
     positional correction to remove overlap.
   • Rolling resistance (constant deceleration) + viscous damping + angular
     damping, so discs come to a believable rest instead of rolling forever.
   • Solid cushions with reduced restitution near pocket jaws.
   • Corner pockets capture by centre distance, with a short sink animation.
   ========================================================================== */

import { BOARD, PHYSICS, COIN_MASS, STRIKER_MASS } from './constants.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const EPS = 1e-9;

/** Small deterministic PRNG so rack angles / tests are reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeDisc(type, x, y, r, mass, random = Math.random) {
  const invM = 1 / mass;
  const I = 0.5 * mass * r * r;
  return {
    id: 0,
    type,                       // 'white' | 'black' | 'queen' | 'striker'
    x, y, px: x, py: y,
    vx: 0, vy: 0,
    omega: 0,
    angle: random() * Math.PI * 2,
    r, m: mass, invM, I, invI: 1 / I,
    active: true,               // still on the table
    inPlay: type !== 'striker', // striker is immune to pockets until shot
    pocketed: false,
    sink: null,                 // { t, x0, y0, x1, y1 }
  };
}

function buildPockets(board) {
  const a = board.pocketInset, b = board.size - board.pocketInset;
  return [
    { x: a, y: a }, { x: b, y: a },
    { x: a, y: b }, { x: b, y: b },
  ].map(p => ({ ...p, r: board.pocketRadius }));
}

/** World with the standard 19-man rack + striker on the baseline. */
export function createWorld(overrides = {}) {
  const world = createEmptyWorld(overrides);
  const { board, random } = world;
  const step = 2 * board.coinRadius + board.rackGap;
  const innerR = step;                                   // 6 coins
  const outerR = step / (2 * Math.sin(Math.PI / 12));   // 12 coins
  const cx = board.size / 2, cy = board.size / 2;

  world.discs.push(makeDisc('queen', cx, cy, board.coinRadius, COIN_MASS, random));
  for (let i = 0; i < 6; i++) {
    const a = (-90 + i * 60) * Math.PI / 180;
    world.discs.push(makeDisc(i % 2 === 0 ? 'white' : 'black',
      cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR,
      board.coinRadius, COIN_MASS, random));
  }
  for (let i = 0; i < 12; i++) {
    const a = (-90 + 15 + i * 30) * Math.PI / 180;
    world.discs.push(makeDisc(i % 2 === 0 ? 'black' : 'white',
      cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR,
      board.coinRadius, COIN_MASS, random));
  }
  const striker = makeDisc('striker', cx, board.baselineY, board.strikerRadius, STRIKER_MASS, random);
  striker.inPlay = false;
  world.discs.push(striker);

  let id = 1;
  for (const d of world.discs) d.id = id++;
  return world;
}

/** Empty world for tests / custom setups. */
export function createEmptyWorld(overrides = {}) {
  const board = { ...BOARD, ...(overrides.board || {}) };
  const config = { ...PHYSICS, ...(overrides.physics || {}) };
  const random = mulberry32(overrides.seed ?? 20261025);
  return { board, config, pockets: buildPockets(board), discs: [], random, time: 0 };
}

export function getStriker(world) {
  return world.discs.find(d => d.type === 'striker');
}

export function countActiveCoins(world) {
  return world.discs.filter(d => d.type !== 'striker' && d.active).length;
}

/** Place the striker back on the baseline. `t` is 0..1 along the line. */
export function resetStriker(world, t = 0.5) {
  const s = getStriker(world);
  if (!s) return;
  const { board } = world;
  s.x = board.strikerMinX + clamp(t, 0, 1) * (board.strikerMaxX - board.strikerMinX);
  s.y = board.baselineY;
  s.px = s.x; s.py = s.y;
  s.vx = s.vy = s.omega = 0;
  s.active = true; s.pocketed = false; s.inPlay = false; s.sink = null;
}

/** Launch the striker. angle in radians (0 = +x, -π/2 = toward opponent). */
export function shoot(world, angle, power, spin = 0) {
  const s = getStriker(world);
  if (!s) return null;
  const { config } = world;
  const speed = config.minShotSpeed + clamp(power, 0, 1) * (config.maxShotSpeed - config.minShotSpeed);
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const cut = clamp(spin, -1, 1) * 14;   // off-centre hit → slight lateral drift
  s.inPlay = true;
  s.vx = dx * speed - dy * cut;
  s.vy = dy * speed + dx * cut;
  s.omega = clamp(spin, -1, 1) * 26;
  return { speed, angle, power, spin };
}

/* ------------------------------- Integration ------------------------------- */

function integrate(world, h, events) {
  const { config, discs } = world;

  for (const d of discs) {
    if (!d.active) continue;
    const sp = Math.hypot(d.vx, d.vy);
    if (sp > EPS) {
      const slowed = Math.max(0, sp - config.rolling * h);
      const damp = Math.exp(-config.friction * h);
      const scale = sp > EPS ? (slowed / sp) * damp : 0;
      d.vx *= scale; d.vy *= scale;
    }
    d.omega *= Math.exp(-config.spinFriction * h);
    d.x += d.vx * h;
    d.y += d.vy * h;
    d.angle += d.omega * h;
  }

  for (let iter = 0; iter < config.iterations; iter++) {
    const first = iter === 0;
    resolveDiscCollisions(world, events, first);
    resolveCushions(world, events, first);
  }
  checkPockets(world, events);

  // Put very slow discs fully to sleep (kills residual jitter in the rack).
  for (const d of discs) {
    if (!d.active) continue;
    if (Math.hypot(d.vx, d.vy) < config.sleepSpeed) { d.vx = 0; d.vy = 0; d.omega = 0; }
  }
}

function resolveDiscCollisions(world, events, emit) {
  const { discs, config } = world;
  for (let i = 0; i < discs.length; i++) {
    const a = discs[i];
    if (!a.active) continue;
    for (let j = i + 1; j < discs.length; j++) {
      const b = discs[j];
      if (!b.active) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const rsum = a.r + b.r;
      let d2 = dx * dx + dy * dy;
      if (d2 >= rsum * rsum) continue;
      if (d2 < EPS) { dx = rsum * 0.001; dy = 0; d2 = dx * dx; }
      const dist = Math.sqrt(d2);
      const nx = dx / dist, ny = dy / dist;
      const tx = -ny, ty = nx;

      // Positional correction (remove penetration without adding energy).
      const invSum = a.invM + b.invM;
      const overlap = Math.max(0, rsum - dist - 0.002);
      const corr = (overlap * 0.65) / invSum;
      a.x -= nx * corr * a.invM; a.y -= ny * corr * a.invM;
      b.x += nx * corr * b.invM; b.y += ny * corr * b.invM;

      const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn >= 0) continue;                        // already separating

      // Normal impulse with restitution.
      const jn = -(1 + config.restitutionCoin) * vn / invSum;
      a.vx -= jn * nx * a.invM; a.vy -= jn * ny * a.invM;
      b.vx += jn * nx * b.invM; b.vy += jn * ny * b.invM;

      // Tangential impulse with spin (surface velocity at the contact point).
      const vt = rvx * tx + rvy * ty - (a.omega * a.r + b.omega * b.r);
      const denom = invSum + a.r * a.r * a.invI + b.r * b.r * b.invI;
      const maxJt = config.coinFriction * Math.abs(jn);
      const jt = clamp(-vt / Math.max(denom, EPS), -maxJt, maxJt);
      a.vx -= jt * tx * a.invM; a.vy -= jt * ty * a.invM;
      b.vx += jt * tx * b.invM; b.vy += jt * ty * b.invM;
      a.omega -= jt * a.r * a.invI;
      b.omega -= jt * b.r * b.invI;

      if (emit && Math.abs(vn) > 4) {
        events.push({ type: 'collision', strength: Math.abs(vn),
          x: a.x + nx * a.r, y: a.y + ny * a.r, a: a.type, b: b.type });
      }
    }
  }
}

function nearPocketJaw(world, d) {
  for (const p of world.pockets) {
    if (Math.hypot(d.x - p.x, d.y - p.y) < p.r * 1.9) return true;
  }
  return false;
}

function resolveCushions(world, events, emit) {
  const { discs, config, board } = world;
  const L = board.size;
  for (const d of discs) {
    if (!d.active) continue;
    const jaw = nearPocketJaw(world, d);
    const e = jaw ? config.restitutionWall * 0.7 : config.restitutionWall;
    const wf = 1 - config.wallFriction;
    let hit = 0;

    if (d.x < d.r) {
      d.x = d.r;
      if (d.vx < 0) { hit = Math.abs(d.vx); d.vx = -d.vx * e; d.vy *= wf; d.omega = d.omega * 0.85 + d.vy / Math.max(d.r, EPS) * 0.12; }
    } else if (d.x > L - d.r) {
      d.x = L - d.r;
      if (d.vx > 0) { hit = Math.abs(d.vx); d.vx = -d.vx * e; d.vy *= wf; d.omega = d.omega * 0.85 - d.vy / Math.max(d.r, EPS) * 0.12; }
    }
    if (d.y < d.r) {
      d.y = d.r;
      if (d.vy < 0) { hit = Math.max(hit, Math.abs(d.vy)); d.vy = -d.vy * e; d.vx *= wf; d.omega = d.omega * 0.85 - d.vx / Math.max(d.r, EPS) * 0.12; }
    } else if (d.y > L - d.r) {
      d.y = L - d.r;
      if (d.vy > 0) { hit = Math.max(hit, Math.abs(d.vy)); d.vy = -d.vy * e; d.vx *= wf; d.omega = d.omega * 0.85 + d.vx / Math.max(d.r, EPS) * 0.12; }
    }
    if (emit && hit > 5) events.push({ type: 'wall', strength: hit, x: d.x, y: d.y, who: d.type });
  }
}

function checkPockets(world, events) {
  const { discs, pockets, config } = world;
  const capture = world.board.captureRadius;
  for (const d of discs) {
    if (!d.active || !d.inPlay) continue;
    for (const p of pockets) {
      const dist = Math.hypot(d.x - p.x, d.y - p.y);
      const allowance = d.type === 'striker' ? 0.12 : 0;
      if (dist < capture + allowance) {
        d.active = false;
        d.pocketed = true;
        d.vx = d.vy = d.omega = 0;
        d.sink = { t: 0, x0: d.x, y0: d.y, x1: p.x, y1: p.y };
        events.push({ type: 'pot', disc: d, pocket: p, strength: config.maxShotSpeed * 0.25 });
        break;
      }
    }
  }
}

/** Advance visual-only sink animations (called once per rendered frame). */
export function advanceSinks(world, dt) {
  for (const d of world.discs) {
    if (d.sink && d.sink.t < 1) d.sink.t = Math.min(1, d.sink.t + dt / 0.34);
  }
}

export function maxSpeed(world) {
  let m = 0;
  for (const d of world.discs) if (d.active) m = Math.max(m, Math.hypot(d.vx, d.vy));
  return m;
}

export function allAtRest(world, threshold = 1.2) {
  return maxSpeed(world) < threshold;
}

/**
 * Advance the world by one fixed step.  Returns the events produced
 * (collision / wall / pot) for sound, particles and rule resolution.
 */
export function stepWorld(world, dt = world.config.dt) {
  const events = [];
  const discs = world.discs;
  for (const d of discs) { d.px = d.x; d.py = d.y; }

  const vmax = maxSpeed(world);
  let minR = Infinity;
  for (const d of discs) minR = Math.min(minR, d.r);
  const substeps = clamp(Math.ceil(vmax * dt / (Math.max(minR, 0.1) * 0.42)), 1, world.config.maxSubsteps);
  const h = dt / substeps;

  for (let s = 0; s < substeps; s++) integrate(world, h, events);
  world.time += dt;
  return events;
}

/* --------------------------- Aiming / prediction --------------------------- */

/** First thing the striker would hit: a disc or a cushion. */
export function raycast(world, origin, dir, maxDist = 130) {
  const { board } = world;
  const s = getStriker(world);
  const r = s ? s.r : board.strikerRadius;
  let best = null;

  for (const d of world.discs) {
    if (!d.active || d.type === 'striker') continue;
    const R = r + d.r;
    const ox = origin.x - d.x, oy = origin.y - d.y;
    const bq = ox * dir.x + oy * dir.y;
    const cq = ox * ox + oy * oy - R * R;
    const disc = bq * bq - cq;
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    if (t > 0.001 && t < maxDist && (!best || t < best.t)) {
      best = { t, kind: 'disc', disc: d, x: origin.x + dir.x * t, y: origin.y + dir.y * t };
    }
  }
  const walls = [
    { axis: 'x', v: r, sign: 1 }, { axis: 'x', v: board.size - r, sign: -1 },
    { axis: 'y', v: r, sign: 1 }, { axis: 'y', v: board.size - r, sign: -1 },
  ];
  for (const w of walls) {
    const o = w.axis === 'x' ? origin.x : origin.y;
    const dv = w.axis === 'x' ? dir.x : dir.y;
    if (Math.abs(dv) < EPS) continue;
    const t = (w.v - o) / dv;
    if (t > 0.001 && t < maxDist && (!best || t < best.t)) {
      best = { t, kind: 'wall', x: origin.x + dir.x * t, y: origin.y + dir.y * t, sign: w.sign };
    }
  }
  return best;
}

/* --------------------------- Returning discs --------------------------- */

function isFree(world, x, y, r, ignore) {
  const { board, pockets } = world;
  if (x < r || x > board.size - r || y < r || y > board.size - r) return false;
  for (const p of pockets) if (Math.hypot(x - p.x, y - p.y) < board.captureRadius + r * 0.6) return false;
  for (const o of world.discs) {
    if (!o.active || o === ignore) continue;
    if (Math.hypot(o.x - x, o.y - y) < o.r + r + 0.08) return false;
  }
  return true;
}

function findFreeSpot(world, d) {
  const cx = world.board.size / 2, cy = world.board.size / 2;
  const ringStep = 2 * d.r + 0.18;
  for (let ring = 0; ring < 16; ring++) {
    const R = ring * ringStep;
    const n = Math.max(10, Math.ceil(2 * Math.PI * R / ringStep));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.37;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      if (isFree(world, x, y, d.r, d)) return { x, y };
    }
  }
  return { x: cx, y: cy };
}

/** Reactivate pocketed discs by type (used for fouls, dues and queen returns). */
export function returnDiscs(world, types) {
  const used = new Set();
  const placed = [];
  for (const type of types) {
    const d = world.discs.find(x => x.type === type && x.pocketed && !used.has(x.id));
    if (!d) continue;
    used.add(d.id);
    const pos = findFreeSpot(world, d);
    d.x = pos.x; d.y = pos.y; d.px = pos.x; d.py = pos.y;
    d.vx = d.vy = d.omega = 0;
    d.active = true; d.pocketed = false; d.inPlay = true; d.sink = null;
    placed.push(d);
  }
  return placed;
}

/** Deep-ish clone of the physics state, for undo / persistence. */
export function snapshotWorld(world) {
  return {
    time: world.time,
    discs: world.discs.map(d => ({
      id: d.id, type: d.type, x: d.x, y: d.y, px: d.px, py: d.py,
      vx: d.vx, vy: d.vy, omega: d.omega, angle: d.angle,
      r: d.r, m: d.m, active: d.active, inPlay: d.inPlay,
      pocketed: d.pocketed, sink: d.sink ? { ...d.sink } : null,
    })),
  };
}

export function restoreWorld(world, snap) {
  if (!snap) return;
  world.time = snap.time || 0;
  for (const s of snap.discs) {
    const d = world.discs.find(x => x.id === s.id);
    if (!d) continue;
    Object.assign(d, s, { invM: 1 / s.m, I: 0.5 * s.m * s.r * s.r });
    d.invI = 1 / d.I;
  }
}
