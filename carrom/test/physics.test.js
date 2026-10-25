import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld, createEmptyWorld, makeDisc, stepWorld, shoot, getStriker,
  maxSpeed, allAtRest, countActiveCoins, returnDiscs, raycast, resetStriker,
} from '../src/physics.js';

const frictionless = {
  rolling: 0, friction: 0, spinFriction: 0, coinFriction: 0,
  sleepSpeed: 0, iterations: 8, restitutionCoin: 1, restitutionWall: 1,
};

function pair(world, x, y, r = 1.51) {
  const a = makeDisc('white', x, y, r, 1, world.random);
  const b = makeDisc('black', x + 2 * r + 0.3, y, r, 1, world.random);
  world.discs.push(a, b);
  return [a, b];
}

test('head-on equal-mass elastic collision exchanges velocity', () => {
  const w = createEmptyWorld({ physics: frictionless, seed: 1 });
  const [a, b] = pair(w, 30, 37);
  a.vx = 120;
  for (let i = 0; i < 6; i++) stepWorld(w, 1 / 120);
  assert.ok(Math.abs(a.vx) < 6, `a.vx should be ~0, got ${a.vx}`);
  assert.ok(Math.abs(b.vx - 120) < 6, `b.vx should be ~120, got ${b.vx}`);
  assert.ok(b.x > a.x, 'discs must not pass through one another');
});

test('cushion reflects with the configured restitution', () => {
  const w = createEmptyWorld({ physics: { ...frictionless, restitutionWall: 0.8 }, seed: 2 });
  const d = makeDisc('white', 1.6, 37, 1.51, 1, w.random);
  d.vx = -100;
  w.discs.push(d);
  stepWorld(w, 1 / 120);
  assert.ok(d.vx > 0, 'velocity must reverse');
  assert.ok(Math.abs(d.vx - 80) < 14, `expected ~80, got ${d.vx}`);
  assert.ok(d.x >= w.board.coinRadius - 1e-9, 'disc must never penetrate the cushion');
});

test('rolling resistance brings a disc to rest', () => {
  const w = createEmptyWorld({ physics: { rolling: 100, friction: 0.5, sleepSpeed: 0.5 }, seed: 3 });
  const d = makeDisc('white', 37, 37, 1.51, 1, w.random);
  d.vx = 200;
  w.discs.push(d);
  for (let i = 0; i < 700; i++) stepWorld(w, 1 / 120);
  assert.ok(allAtRest(w, 0.6), `speed should be ~0, got ${maxSpeed(w)}`);
});

test('adaptive sub-stepping prevents tunnelling at high speed', () => {
  const w = createEmptyWorld({ physics: { ...frictionless, maxSubsteps: 32 }, seed: 4 });
  const a = makeDisc('white', 20, 37, 1.51, 1, w.random);
  a.vx = 1500;
  const b = makeDisc('black', 20 + 3.02 + 1.0, 37, 1.51, 1, w.random);
  w.discs.push(a, b);
  let sawCollision = false;
  for (let i = 0; i < 3; i++) {
    if (stepWorld(w, 1 / 120).some(e => e.type === 'collision')) sawCollision = true;
  }
  assert.ok(sawCollision, 'a collision event must be emitted');
  assert.ok(b.vx > 100, `target disc must be struck, got vx=${b.vx}`);
  assert.ok(a.vx < 1500, 'shooter must lose speed');
});

test('a disc inside the pocket mouth is captured exactly once', () => {
  const w = createEmptyWorld({ seed: 5 });
  const d = makeDisc('white', 2.0, 2.0, 1.51, 1, w.random);
  w.discs.push(d);
  const events = stepWorld(w, 1 / 120);
  assert.equal(events.filter(e => e.type === 'pot').length, 1);
  assert.equal(d.active, false);
  assert.equal(d.pocketed, true);
  assert.equal(stepWorld(w, 1 / 120).filter(e => e.type === 'pot').length, 0);
});

test('a striker resting on the baseline is not captured before being shot', () => {
  const w = createWorld({ seed: 6 });
  const s = getStriker(w);
  assert.equal(s.inPlay, false);
  stepWorld(w, 1 / 120);
  assert.equal(s.active, true, 'ready striker must stay on the table');
});

test('standard rack has 19 men + striker and settles without jitter or NaN', () => {
  const w = createWorld({ seed: 7 });
  assert.equal(w.discs.length, 20);
  assert.equal(countActiveCoins(w), 19);
  for (let i = 0; i < 420; i++) stepWorld(w, 1 / 120);

  let maxOverlap = 0;
  for (const d of w.discs) {
    assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.vx), 'no NaN');
  }
  for (let i = 0; i < w.discs.length; i++) {
    const a = w.discs[i];
    if (!a.active) continue;
    for (let j = i + 1; j < w.discs.length; j++) {
      const b = w.discs[j];
      if (!b.active) continue;
      maxOverlap = Math.max(maxOverlap, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  assert.ok(maxOverlap < 0.14, `rack should not overlap, max=${maxOverlap}`);
  assert.ok(allAtRest(w, 0.6));
});

test('a full-power shot stays finite and eventually stops', () => {
  const w = createWorld({ seed: 8 });
  shoot(w, -Math.PI / 2, 1, 0.4);
  const s = getStriker(w);
  assert.equal(s.inPlay, true);
  let iterations = 0;
  for (; iterations < 3000; iterations++) {
    stepWorld(w, 1 / 120);
    if (iterations > 30 && allAtRest(w, 1.2)) break;
  }
  assert.ok(iterations < 3000, `shot should settle, ran ${iterations} steps`);
  for (const d of w.discs) {
    assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y), 'positions finite');
    assert.ok(Number.isFinite(d.vx) && Number.isFinite(d.vy) && Number.isFinite(d.omega), 'velocities finite');
    assert.ok(d.x >= -0.01 && d.x <= w.board.size + 0.01, 'x inside board');
    assert.ok(d.y >= -0.01 && d.y <= w.board.size + 0.01, 'y inside board');
  }
});

test('raycast finds the first disc along the aim line', () => {
  const w = createWorld({ seed: 9 });
  const s = getStriker(w);
  const hit = raycast(w, { x: s.x, y: s.y }, { x: 0, y: -1 }, 105);
  assert.ok(hit, 'expected a hit');
  assert.equal(hit.kind, 'disc');
  assert.ok(hit.t > 0 && hit.t < 105);
});

test('returnDiscs reactivates a pocketed disc in a free spot', () => {
  const w = createWorld({ seed: 10 });
  const white = w.discs.find(d => d.type === 'white');
  white.active = false; white.pocketed = true;
  const placed = returnDiscs(w, ['white']);
  assert.equal(placed.length, 1);
  assert.equal(placed[0].active, true);
  assert.equal(placed[0].pocketed, false);
  for (const p of w.pockets) {
    assert.ok(Math.hypot(placed[0].x - p.x, placed[0].y - p.y) > w.board.captureRadius, 'not inside a pocket');
  }
});

test('resetStriker restores an intact striker on the baseline', () => {
  const w = createWorld({ seed: 11 });
  const s = getStriker(w);
  s.active = false; s.pocketed = true; s.vx = 99;
  resetStriker(w, 0.25);
  assert.equal(s.active, true);
  assert.equal(s.pocketed, false);
  assert.equal(s.inPlay, false);
  assert.equal(s.vx, 0);
  assert.equal(s.y, w.board.baselineY);
});
