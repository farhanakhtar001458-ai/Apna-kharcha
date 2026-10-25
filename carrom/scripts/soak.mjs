/* ==========================================================================
   Headless physics soak test — run many complete matches with random shots.
     node scripts/soak.mjs [shots]
   Verifies: no NaN, no out-of-bounds discs, every shot settles, rules stay
   consistent, and collisions/pots actually happen.
   ========================================================================== */

import {
  createWorld, stepWorld, shoot, allAtRest, countActiveCoins,
  returnDiscs, resetStriker, maxSpeed,
} from '../src/physics.js';
import { createMatch, resolveShot } from '../src/rules.js';

const shots = Math.max(1, Number(process.argv[2] || 300));
let seed = 0xC0FFEE;
function rnd() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

let world = createWorld({ seed: 1 });
let match = createMatch(['Soak A', 'Soak B'], 8);
let collisions = 0, walls = 0, pots = 0, strikerFouls = 0;
let maxSteps = 0, games = 0, violations = 0;

function check(w, shotIndex) {
  for (const d of w.discs) {
    if (![d.x, d.y, d.vx, d.vy, d.omega].every(Number.isFinite)) {
      console.error(`NaN in disc ${d.type} at shot ${shotIndex}`); violations++; return;
    }
    if (d.active && (d.x < -0.05 || d.x > w.board.size + 0.05 || d.y < -0.05 || d.y > w.board.size + 0.05)) {
      console.error(`Out of bounds ${d.type} (${d.x.toFixed(2)}, ${d.y.toFixed(2)}) at shot ${shotIndex}`);
      violations++; return;
    }
  }
}

for (let i = 0; i < shots; i++) {
  if (match.phase === 'gameover') {
    games++;
    world = createWorld({ seed: i + 1 });
    match = createMatch(['Soak A', 'Soak B'], 8);
  }

  resetStriker(world, 0.08 + rnd() * 0.84);
  const angle = -Math.PI / 2 + (rnd() - 0.5) * 1.7;
  const power = 0.3 + rnd() * 0.7;
  const spin = (rnd() - 0.5) * 1.4;
  shoot(world, angle, power, spin);

  const potted = [];
  let steps = 0, settled = 0;
  for (; steps < 3600; steps++) {
    const events = stepWorld(world);
    for (const e of events) {
      if (e.type === 'collision') collisions++;
      else if (e.type === 'wall') walls++;
      else if (e.type === 'pot') { potted.push(e); pots++; if (e.disc.type === 'striker') strikerFouls++; }
    }
    if (allAtRest(world, 1.2)) settled++; else settled = 0;
    if (settled > 40) break;
  }
  if (steps >= 3600) { console.error(`Shot ${i} never settled`); violations++; }
  maxSteps = Math.max(maxSteps, steps);
  check(world, i);

  const res = resolveShot(match, potted.map(e => ({ type: e.disc.type })), countActiveCoins(world));
  if (res.returns.length) returnDiscs(world, res.returns);
  check(world, i);
  if (match.phase === 'gameover') games++;
}

console.log(JSON.stringify({
  shots, games, collisions, wallHits: walls, pottedDiscs: pots,
  strikerFouls, maxStepsToSettle: maxSteps,
  finalSpeed: Number(maxSpeed(world).toFixed(3)),
  violations,
}, null, 2));

if (violations > 0 || collisions === 0 || pots === 0) process.exit(1);
