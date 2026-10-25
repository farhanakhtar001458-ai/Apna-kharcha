import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, cloneMatch, resolveShot, statusText } from '../src/rules.js';

const pot = (...types) => types.map(type => ({ type }));

test('createMatch sets colours, scores and target', () => {
  const m = createMatch(['Asha', 'Ravi'], 6);
  assert.equal(m.players[0].color, 'white');
  assert.equal(m.players[1].color, 'black');
  assert.equal(m.players[0].name, 'Asha');
  assert.equal(m.target, 6);
  assert.equal(m.turn, 0);
  assert.equal(m.queen.status, 'onBoard');
});

test('potting your own man scores +1 and keeps the turn', () => {
  const m = createMatch();
  const r = resolveShot(m, pot('white'), 18);
  assert.equal(m.players[0].score, 1);
  assert.equal(m.turn, 0);
  assert.equal(r.extraTurn, true);
  assert.equal(r.gameOver, false);
  assert.deepEqual(r.returns, []);
});

test('potting an opponent man scores for the opponent and passes the turn', () => {
  const m = createMatch();
  const r = resolveShot(m, pot('black'), 18);
  assert.equal(m.players[0].score, 0);
  assert.equal(m.players[1].score, 1);
  assert.equal(m.turn, 1);
  assert.equal(r.extraTurn, false);
});

test('own + opponent man in one stroke still passes the turn (foul)', () => {
  const m = createMatch();
  const r = resolveShot(m, pot('white', 'black'), 17);
  assert.equal(m.players[0].score, 1);
  assert.equal(m.players[1].score, 1);
  assert.equal(m.turn, 1);
  assert.equal(r.extraTurn, false);
});

test('striker foul returns every potted coin and adds a due', () => {
  const m = createMatch();
  const r = resolveShot(m, pot('white', 'queen', 'striker'), 17);
  assert.equal(m.players[0].score, 0);
  assert.equal(m.players[0].due, 1);
  assert.equal(m.turn, 1);
  assert.equal(r.extraTurn, false);
  assert.deepEqual(r.returns, ['white', 'queen']);
  assert.equal(m.queen.status, 'onBoard');
  assert.equal(r.summary.striker, true);
});

test('a due is cleared by the next own coin instead of scoring', () => {
  const m = createMatch();
  m.players[0].due = 1;
  const r = resolveShot(m, pot('white'), 18);
  assert.equal(m.players[0].score, 0);
  assert.equal(m.players[0].due, 0);
  assert.deepEqual(r.returns, ['white']);
  assert.equal(r.extraTurn, false);
  assert.equal(m.turn, 1);
});

test('queen + own man in one stroke is covered for +3', () => {
  const m = createMatch();
  const r = resolveShot(m, pot('queen', 'white'), 17);
  assert.equal(m.players[0].score, 4);           // 1 + 3
  assert.equal(m.queen.status, 'covered');
  assert.equal(m.queen.by, 0);
  assert.equal(r.extraTurn, true);
  assert.deepEqual(r.returns, []);
});

test('potting the queen alone grants exactly one grace stroke', () => {
  const m = createMatch();
  const r = resolveShot(m, pot('queen'), 18);
  assert.equal(m.players[0].score, 0);
  assert.deepEqual(r.returns, []);
  assert.equal(m.queen.status, 'pending');
  assert.equal(r.extraTurn, true);
  assert.equal(m.turn, 0);
});

test('covering the queen on the grace stroke scores +3', () => {
  const m = createMatch();
  resolveShot(m, pot('queen'), 18);
  const r = resolveShot(m, pot('white'), 17);
  assert.equal(m.players[0].score, 4);            // 1 own + 3 queen
  assert.equal(m.queen.status, 'covered');
  assert.equal(r.extraTurn, true);
  assert.equal(r.gameOver, false);
});

test('failing to cover on the grace stroke returns the queen', () => {
  const m = createMatch();
  resolveShot(m, pot('queen'), 18);
  const r = resolveShot(m, pot(), 17);
  assert.equal(m.players[0].score, 0);
  assert.deepEqual(r.returns, ['queen']);
  assert.equal(m.queen.status, 'onBoard');
  assert.equal(m.turn, 1);
  assert.equal(r.extraTurn, false);
});

test('a foul while the queen is pending returns the queen', () => {
  const m = createMatch();
  resolveShot(m, pot('queen'), 18);
  const r = resolveShot(m, pot('black'), 17);
  assert.equal(m.players[1].score, 1);
  assert.deepEqual(r.returns, ['queen']);
  assert.equal(m.queen.status, 'onBoard');
  assert.equal(m.turn, 1);
});

test('striker foul cancels a pending queen and adds a due', () => {
  const m = createMatch();
  resolveShot(m, pot('queen'), 18);
  const r = resolveShot(m, pot('white', 'striker'), 17);
  assert.equal(m.players[0].due, 1);
  assert.equal(m.players[0].score, 0);
  assert.deepEqual(r.returns, ['white', 'queen']);
  assert.equal(m.queen.status, 'onBoard');
});

test('reaching the target ends the match with the leader as winner', () => {
  const m = createMatch();
  m.players[0].score = 7;
  const r = resolveShot(m, pot('white'), 5);
  assert.equal(r.gameOver, true);
  assert.equal(r.winner, 0);
  assert.equal(m.phase, 'gameover');
});

test('an empty board ends the match; equal scores are a draw', () => {
  const m = createMatch();
  m.players[0].score = 4;
  m.players[1].score = 4;
  const r = resolveShot(m, pot(), 0);
  assert.equal(r.gameOver, true);
  assert.equal(r.winner, null);
});

test('statusText reflects turn, dues and queen state', () => {
  const m = createMatch(['Asha', 'Ravi']);
  assert.match(statusText(m), /Asha's turn/);
  m.players[0].due = 2;
  assert.match(statusText(m), /2 due/);
  m.queen.status = 'pending'; m.queen.by = 0;
  assert.match(statusText(m), /cover the queen/);
});

test('cloneMatch is a deep copy', () => {
  const m = createMatch();
  const c = cloneMatch(m);
  c.players[0].score = 5;
  assert.equal(m.players[0].score, 0);
});
