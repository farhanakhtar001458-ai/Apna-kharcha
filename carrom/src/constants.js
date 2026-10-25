/* ==========================================================================
   Apna Carrom — world constants.
   Units: centimetres, seconds, grams (arbitrary mass unit).  A real carrom
   board is ~74 cm across the playing surface, coins ~3.02 cm diameter.
   ========================================================================== */

export const BOARD = Object.freeze({
  size: 74,               // inner playing surface (cm), square
  frame: 6.2,             // wooden frame thickness (cm) — visual only
  coinRadius: 1.51,
  strikerRadius: 2.06,
  pocketInset: 3.05,      // pocket centre distance from each adjacent edge
  pocketRadius: 2.75,     // drawn pocket radius
  captureRadius: 2.30,    // centre-to-centre distance at which a disc drops
  baselineY: 67.6,        // striker's line (near player's end)
  strikerMinX: 9.5,       // striker may slide along the baseline between…
  strikerMaxX: 64.5,
  centerRadius: 6.6,
  rackGap: 0.03,          // tiny gap so the rack starts non-overlapping
});

export const PHYSICS = Object.freeze({
  dt: 1 / 120,            // fixed simulation step
  rolling: 34,            // constant rolling deceleration (cm/s²)
  friction: 0.30,         // viscous damping (1/s)
  spinFriction: 1.7,      // angular damping (1/s)
  restitutionCoin: 0.93,  // disc↔disc coefficient of restitution
  restitutionWall: 0.76,  // disc↔cushion coefficient of restitution
  coinFriction: 0.16,     // tangential (Coulomb) friction between discs
  wallFriction: 0.055,    // tangential friction against cushions
  iterations: 6,          // sequential impulse solver iterations
  sleepSpeed: 0.9,        // below this a disc is forced to rest (cm/s)
  maxSubsteps: 24,        // continuous-collision guard
  minShotSpeed: 85,
  maxShotSpeed: 410,
  maxPull: 22,            // centimetres of slingshot pull for full power
});

export const COIN_MASS = 1.0;
export const STRIKER_MASS = 1.9;

export const RULES = Object.freeze({
  coinPoints: 1,
  queenPoints: 3,
  targetScore: 8,
  whiteCount: 9,
  blackCount: 9,
});

export const SETTINGS_DEFAULTS = Object.freeze({
  player1: 'Player 1',
  player2: 'Player 2',
  targetScore: 8,
  polish: 0.5,            // 0 = grippy/slow, 1 = glassy/fast
  bounce: 0.5,            // 0 = dead cushions, 1 = lively cushions
  volume: 0.6,
  muted: false,
  guides: true,
  reducedFx: false,
  theme: 'dark',
});

export const STORAGE_KEYS = Object.freeze({
  settings: 'apna_carrom.settings.v1',
  match: 'apna_carrom.match.v1',
  history: 'apna_carrom.history.v1',
});
