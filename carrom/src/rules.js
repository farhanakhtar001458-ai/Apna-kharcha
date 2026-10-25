/* ==========================================================================
   Apna Carrom — match rules and turn/score state machine.

   Pure module: no DOM, no physics imports.  `resolveShot` receives the list of
   discs potted during a stroke and the number of coins still on the board;
   it returns what must be put back, what changed, and whether play continues.

   Implemented rules (see README / in-app Rules panel)
   ---------------------------------------------------
   • 9 white, 9 black, 1 queen (red). Player 1 = white, Player 2 = black.
   • Your own carrom man  → +1 and you shoot again.
   • Opponent's carrom man → opponent +1, your turn ends (foul).
   • Queen → +3, but only if "covered": pot it together with one of your own
     men in the same stroke, or use the one grace stroke it grants you to cover
     it.  Fail and the queen returns to centre.
   • Striker potted → foul: every coin potted in that stroke is returned to
     the board and one "due" is added.  Your next own coin clears a due
     (returned, no point) instead of scoring.
   • First to the target score wins; if all coins leave the board earlier,
     the higher score wins.  Equal scores = draw.
   ========================================================================== */

import { RULES } from './constants.js';

export function createMatch(names = ['Player 1', 'Player 2'], target = RULES.targetScore) {
  return {
    players: [
      { name: names[0] || 'Player 1', color: 'white', score: 0, due: 0 },
      { name: names[1] || 'Player 2', color: 'black', score: 0, due: 0 },
    ],
    turn: 0,
    target: Math.max(1, target | 0),
    phase: 'aiming',                       // 'aiming' | 'simulating' | 'gameover'
    queen: { status: 'onBoard', by: null }, // 'onBoard' | 'pending' | 'covered'
    winner: null,                          // 0 | 1 | null (draw)
    shotCount: 0,
    log: [],
  };
}

export function cloneMatch(m) {
  return JSON.parse(JSON.stringify(m));
}

/**
 * @param {object} match        mutable match state
 * @param {Array<{type:string}>} pots  discs pocketed this stroke (incl. striker)
 * @param {number} activeCoins  coins still active on the board BEFORE returns
 */
export function resolveShot(match, pots, activeCoins = 0) {
  const p = match.turn, opp = 1 - p;
  const result = {
    returns: [],          // disc types to reactivate on the board
    messages: [],
    extraTurn: false,
    gameOver: false,
    winner: null,
    summary: { own: 0, opp: 0, queen: 0, striker: false },
  };

  const coins = pots.filter(x => x.type !== 'striker');
  const strikerPotted = pots.some(x => x.type === 'striker');
  const own = coins.filter(c => c.type === match.players[p].color);
  const oppCoins = coins.filter(c => c.type === match.players[opp].color);
  const queens = coins.filter(c => c.type === 'queen');
  result.summary = { own: own.length, opp: oppCoins.length, queen: queens.length, striker: strikerPotted };
  match.shotCount += 1;

  /* ------------------------------- Striker foul ------------------------------ */
  if (strikerPotted) {
    result.returns.push(...coins.map(c => c.type));
    if (match.queen.status === 'pending' && queens.length === 0) result.returns.push('queen');
    match.players[p].due += 1;
    match.queen.status = 'onBoard';
    match.queen.by = null;
    result.messages.push(`Foul — striker potted. ${coins.length} coin(s) returned; 1 due added.`);
    finishTurn(match, result, activeCoins, false);
    return result;
  }

  /* ---------------------------------- Dues ---------------------------------- */
  let effectiveOwn = own.length;
  const absorbed = Math.min(match.players[p].due, effectiveOwn);
  if (absorbed > 0) {
    result.returns.push(...own.slice(0, absorbed).map(c => c.type));
    effectiveOwn -= absorbed;
    match.players[p].due -= absorbed;
    result.messages.push(`${absorbed} coin(s) returned to clear due.`);
  }

  /* -------------------------------- Scoring --------------------------------- */
  if (oppCoins.length > 0) {
    match.players[opp].score += oppCoins.length * RULES.coinPoints;
    result.messages.push(`${oppCoins.length} opponent coin(s) potted — ${match.players[opp].name} +${oppCoins.length}.`);
  }
  if (effectiveOwn > 0) {
    match.players[p].score += effectiveOwn * RULES.coinPoints;
    result.messages.push(`${effectiveOwn} coin(s) potted — ${match.players[p].name} +${effectiveOwn}.`);
  }

  /* --------------------------------- Queen ---------------------------------- */
  // Potting the queen starts a "pending" window that lasts for the rest of the
  // current turn.  You get one more stroke to pot one of your own men; fail and
  // the queen goes back to the centre.  Potting queen + own man together covers
  // it immediately.
  let covered = false;
  let queenGrace = false;
  if (queens.length > 0) {
    match.queen.status = 'pending';
    match.queen.by = p;
    result.messages.push('Queen potted — cover it with one of your own coins this turn.');
  }
  if (match.queen.status === 'pending') {
    if (match.queen.by !== p) {
      match.queen.status = 'onBoard';
      match.queen.by = null;
      result.returns.push('queen');
      result.messages.push('Queen was not covered by its owner — returned to the centre.');
    } else if (effectiveOwn > 0) {
      match.players[p].score += RULES.queenPoints;
      match.queen.status = 'covered';
      covered = true;
      result.messages.push(`Queen covered! +${RULES.queenPoints} points.`);
    } else if (queens.length > 0) {
      queenGrace = true;
      result.messages.push('One more shot to cover the queen.');
    }
  }

  const foul = oppCoins.length > 0;
  const extraTurn = !foul && (effectiveOwn > 0 || covered || queenGrace);
  finishTurn(match, result, activeCoins, extraTurn);
  return result;
}

function finishTurn(match, result, activeCoins, extraTurn) {
  result.extraTurn = extraTurn;

  if (!extraTurn && match.queen.status === 'pending') {
    match.queen.status = 'onBoard';
    match.queen.by = null;
    result.returns.push('queen');
    result.messages.push('Queen not covered this visit — returned to the centre.');
  }
  if (!extraTurn) match.turn = 1 - match.turn;

  const remaining = activeCoins + result.returns.length;
  const reached = match.players.some(pl => pl.score >= match.target);
  result.gameOver = reached || remaining <= 0;
  if (result.gameOver) {
    const [a, b] = match.players;
    result.winner = a.score === b.score ? null : (a.score > b.score ? 0 : 1);
    match.phase = 'gameover';
    match.winner = result.winner;
  } else {
    match.phase = 'aiming';
  }
}

export function statusText(match) {
  if (match.phase === 'gameover') {
    if (match.winner === null) return "It's a draw!";
    return `${match.players[match.winner].name} wins!`;
  }
  const pl = match.players[match.turn];
  const due = pl.due > 0 ? ` · ${pl.due} due` : '';
  const queen = match.queen.status === 'pending' ? ' · cover the queen!' : '';
  return `${pl.name}'s turn (${pl.color})${due}${queen}`;
}
