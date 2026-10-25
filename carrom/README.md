# Apna Carrom

A **production-level, offline two-player carrom game** for the browser, with a
real rigid-disc physics engine, spin, proper match rules and a polished UI.

**There is no AI.** Both players are human and share one device. It is a new,
original implementation — no third-party game code or assets are used.

## Run it

```sh
cd carrom
npm start                 # http://localhost:3100
# or: PORT=4173 node server.mjs
```

Zero runtime dependencies — only Node.js 18+ is needed to serve the static files.
The server binds `0.0.0.0` so it also works behind a preview proxy. The game
itself runs entirely in the browser; nothing is sent to a server.

## Features

**Physics**
- Impulse-based disc↔disc collisions with restitution, Coulomb friction and
  **spin transfer** (angular velocity + moment of inertia `I = ½mr²`).
- Solid cushions with reduced restitution near pocket jaws, plus tangential
  cushion friction that also induces spin.
- Rolling resistance + viscous damping + angular damping → believable rest.
- Fixed timestep (1/120 s) with **adaptive sub-stepping** so a 400 cm/s striker
  cannot tunnel through a 3 cm coin.
- Sequential-impulse solver (6 iterations) with positional correction; the
  19-man rack settles without jitter or overlap.
- Corner pocket capture by centre distance with a sink animation.
- Interpolated rendering (`alpha`) so motion is smooth on 60/120/144 Hz screens.

**Game**
- 9 white, 9 black, 1 queen; Player 1 = white, Player 2 = black.
- Own man `+1` and shoot again · opponent's man `+1` to them, turn passes.
- Queen `+3` only when **covered**: pot it with one of your own men, or use the
  single grace stroke it grants you to cover it. Fail and it returns to the centre.
- Striker potted = foul: that stroke's coins are returned and you owe a **due**;
  your next own man clears it instead of scoring.
- First to the target score (default 8) wins; empty board ends the match;
  equal scores = draw.
- Shot log, match history, **undo last shot**, resumable match (localStorage),
  player names, target score, table polish, cushion bounce, volume, aim guides,
  effects toggle and mute.

**Presentation**
- Hand-drawn wooden board: frame bevel, felt speckle, double border, diagonals
  with arrowheads, centre rings, baseline, four shaded pockets.
- Glossy coins with shadows, a star on the queen, a ringed striker whose accent
  follows the current player.
- Aim guide: dashed ray to the first impact, ghost striker, predicted target
  direction, power ring and a slingshot elastic band.
- Synthesised Web Audio sounds (click/clack, cushion thud, pocket drop, foul,
  win chord) — no audio files.
- Collision particles, pocket flashes, winner confetti, toasts, responsive
  layout, reduced-motion support and keyboard shortcuts.

## Controls

| Action | Input |
| --- | --- |
| Aim + power | Drag back anywhere on the board, release to shoot |
| Shoot with current settings | `Space` / `Enter` / **Shoot** button |
| Move striker along baseline | `←` `→` or the **Striker position** slider |
| Fine aim | `A` / `D` (±2°) or the **Aim** slider |
| Power | `W` / `S` or the **Power** slider |
| Spin / cut | `Q` / `E` or the **Spin** slider |
| Reset striker | `R` or the reset button |
| Undo last shot | `U` or **Undo** |
| Mute | `M` or the speaker button |
| Close dialog / cancel drag | `Esc` |

## Project structure

```
carrom/
  index.html            markup + modals + inline SVG icon sprite
  styles.css            theme, layout, responsive, animations
  favicon.svg           original board mark
  server.mjs            zero-dependency static server (CSP, path guard)
  src/
    constants.js        board/physics/rules/settings constants
    physics.js          pure 2D rigid-disc engine (no DOM)
    rules.js            pure turn/score state machine
    render.js           canvas drawing + interpolation
    sound.js            Web Audio synthesis
    storage.js          guarded localStorage persistence
    main.js             input, fixed-step game loop, UI wiring
  test/
    physics.test.js     11 engine tests
    rules.test.js       16 rules tests
  scripts/soak.mjs      headless 300–800 shot stress test
  docs/PHYSICS.md       the maths and the tuning knobs
```

`physics.js` and `rules.js` import nothing from the DOM, so they run unchanged
under `node --test`. Keep them that way.

## Verification

```sh
cd carrom
npm run check                    # node --check on every module
npm test                         # 27 unit tests
node scripts/soak.mjs 300        # headless physics soak
node scripts/soak.mjs 800        # longer soak
```

Results on this branch:

- `27/27` unit tests (elastic collisions, cushion restitution, rolling rest,
  anti-tunnelling, pocket capture, rack settling, raycast, returns, queen grace
  strokes and all rules cases).
- 800-shot soak: **34 complete games**, 3,908 disc collisions, 4,181 cushion
  hits, 520 potted discs, 151 striker fouls, `maxStepsToSettle = 424`
  (~3.5 s), **0 NaN / out-of-bounds / non-settling violations**.
- Browser-less jsdom smoke test: 28 assertions covering initial state,
  sliders, keyboard, modals, a full simulated shot, undo, settings persistence,
  new game and pointer-drag aiming — **0 console errors**.
- HTTP smoke tests: static assets, `/api/health`, CSP `frame-ancestors *`,
  encoded path traversal (403), NUL path (400), unknown API (404), POST (405).

## Tuning

**Table polish** and **cushion bounce** in the Settings panel map to:

| Setting | Range | Physics |
| --- | --- | --- |
| Polish | 0 → 1 | `rolling = 60 − 52·polish` cm/s², `friction = 0.46 − 0.32·polish` 1/s |
| Bounce | 0 → 1 | `restitutionWall = 0.50 + 0.52·bounce`, `restitutionCoin = 0.86 + 0.14·bounce` |

Defaults (0.5) reproduce `PHYSICS` in `constants.js`. See
[`docs/PHYSICS.md`](docs/PHYSICS.md) for the equations.

## Limitations / not implemented

- **No AI opponent** (by design) and no online multiplayer — local pass-and-play only.
- Pocket jaws are approximated by solid cushions with reduced restitution near
  corners; there is no cut-out geometry or cloth deformation.
- Striker "cut" spin is an approximation: off-centre hits are modelled as an
  initial angular velocity plus a small lateral velocity, not full finger
  biomechanics.
- No real-browser visual regression was possible in this sandbox (no browser
  binary); the jsdom test verifies behaviour, not pixel appearance.
- The Android `app/` project is unrelated and untouched by this module.

## Deploy

Any static host works — the game needs no backend. Keep the CSP
`frame-ancestors *` (or restrict it to your embedding origin) if you serve the
board inside an iframe.
