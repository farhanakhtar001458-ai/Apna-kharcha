# Apna Carrom — physics model

This note documents the equations behind `src/physics.js`, the units, and which
simplifications are deliberate. It is intentionally implementation-level so the
tuning knobs in `src/constants.js` can be changed without guessing.

## Units and world

| Quantity | Unit |
| --- | --- |
| Position, radius, board size | centimetres (cm) |
| Velocity | cm/s |
| Angular velocity | rad/s |
| Mass | arbitrary "coin masses" (coin = 1.0, striker = 1.9) |
| Time | seconds |

The playing surface is a `74 × 74` cm square, `BOARD.size`. World `+y` points
**down** the screen, so an attacking shot toward the opponent is
`angle = −π/2` → direction `(0, −1)`. The four pocket centres sit at
`(3.05, 3.05)`, `(70.95, 3.05)`, `(3.05, 70.95)`, `(70.95, 70.95)`.

Standard dimensions: carrom man radius `1.51` cm, striker radius `2.06` cm,
pocket radius `2.75` cm, capture radius `2.30` cm.

Each disc carries `x, y, vx, vy, omega, angle, r, m`, plus
`invM = 1/m`, `I = ½mr²`, `invI = 1/I`.

```
I = (1/2) m r²
invM = 1/m
invI = 2/(m r²)
```

## Integration

The game loop uses a fixed step `dt = 1/120 s` with an accumulator; rendering
interpolates between `prev` and `current` positions with
`alpha = accumulator / dt`. This decouples physics from refresh rate.

Within one step, adaptive sub-stepping prevents tunnelling:

```
substeps = clamp(ceil(vmax · dt / (r_min · 0.42)), 1, 24)
h = dt / substeps
```

`vmax` is the fastest disc speed. The bound `r_min · 0.42 ≈ 0.63 cm` keeps each
sub-step displacement well below the 3.02 cm coin diameter. At 410 cm/s this
yields ~13 sub-steps; at 1500 cm/s (test only) ~24.

Each sub-step:

1. **Forces / damping**

   ```
   slowed = max(0, |v| − rolling · h)
   scale  = (slowed / |v|) · exp(−friction · h)
   v     *= scale
   omega *= exp(−spinFriction · h)
   x     += vx · h ;  y += vy · h
   angle += omega · h
   ```

   `rolling` is a constant deceleration (cm/s²) modelling rolling resistance;
   `friction` is viscous damping (1/s). Defaults: `rolling = 34`,
   `friction = 0.30`, `spinFriction = 1.7`.

2. **Collision solve** — `iterations = 6` passes of disc collisions and
   cushions, with positional correction on each pass. Multiple passes stabilise
   the tightly packed starting rack.

3. **Pocket capture** (once per sub-step).

4. **Sleep** — any disc slower than `sleepSpeed = 0.9 cm/s` is forced to rest.
   This kills residual rack jitter without adding visible energy loss.

## Disc ↔ disc collision

For discs `a`, `b` with `n = (b.pos − a.pos)/|…|`, `t = (−n.y, n.x)` and
relative velocity `v_rel = v_b − v_a`:

**Positional correction** (Baumgarte-style, no energy injection):

```
overlap = max(0, (r_a + r_b) − dist − 0.002)
corr    = 0.65 · overlap / (invM_a + invM_b)
a.pos  -= n · corr · invM_a
b.pos  += n · corr · invM_b
```

**Normal impulse** (only when approaching, `vn = v_rel · n < 0`):

```
jn = −(1 + e) · vn / (invM_a + invM_b)       e = restitutionCoin (0.93)
v_a -= n · jn · invM_a
v_b += n · jn · invM_b
```

**Tangential impulse with spin.** The relative *surface* velocity along `t` is

```
vt = v_rel · t − (omega_a · r_a + omega_b · r_b)
```

(the sign comes from the contact-point vectors `+n·r_a` and `−n·r_b`).
The effective mass including rotational terms is

```
denom = invM_a + invM_b + r_a²·invI_a + r_b²·invI_b
jt    = clamp(−vt / denom, −μ·|jn|, +μ·|jn|)   μ = coinFriction (0.16)
```

Apply `±jt·t` to the linear velocities, and

```
omega_a −= jt · r_a · invI_a
omega_b −= jt · r_b · invI_b
```

This is Coulomb friction at the contact: a cut/ spinning striker transfers real
angular momentum into the object ball instead of only deflecting its path.

Collision events are emitted only on iteration 0 with `strength = |vn|`, which
drives sound volume and particle count.

## Cushions

Four solid walls at `x = r`, `x = L − r`, `y = r`, `y = L − r`. On penetration
the disc is projected back onto the wall and the normal velocity is reflected:

```
vn' = −e · vn                 e = restitutionWall (0.76)
```

Tangential velocity is reduced by `wallFriction = 0.055` and a little spin is
induced. Near a pocket (distance `< 1.9 · pocketRadius`) `e` is multiplied by
`0.7` — a cheap approximation of the rounded pocket jaw "giving" on impact.
Because the walls stay solid and the pocket centres are *inside* the board,
discs are captured before they can escape: a coin centre at `(1.51, 1.51)` is
only `2.18 cm` from `(3.05, 3.05)`, inside the `2.30 cm` capture radius.

## Pockets

A disc is captured when `|centre − pocket| < captureRadius + allowance`
(`allowance = 0.12` for the striker). The striker also has an `inPlay` flag:
while resting on the baseline it is immune, so merely positioning it near a
bottom pocket cannot pot it. Capture sets `active = false`, zeroes velocity and
starts a 0.34 s sink animation (scale + alpha + move toward pocket centre).

Pocketed discs can be reactivated by `returnDiscs(world, types)` (fouls, dues,
uncovered queen). Placement uses an outward spiral from the centre, rejecting
spots that overlap another active disc or sit inside a pocket mouth.

## The rack

19 men in a compact hexagon: queen at centre, inner ring of 6 at
`R = 2r + gap ≈ 3.05 cm`, outer ring of 12 at
`R = (2r + gap)/(2 sin 15°) ≈ 5.89 cm`, offset by 15°. With `gap = 0.03 cm`
all neighbours start ~3.05 cm apart, i.e. just touching, so the solver does
not have to resolve a large initial overlap.

## Shot

```
speed = minShotSpeed + power · (maxShotSpeed − minShotSpeed)   // 85…410 cm/s
dir   = (cos θ, sin θ)
cut   = spin · 14
v     = dir · speed + perpendicular(dir) · cut
omega = spin · 26
```

Real carrom "cut" shots come from an off-centre finger strike; here that is
approximated by initial angular velocity plus a small lateral velocity. It is
not a full contact model of the finger, but it produces repeatable curve and
throw on cushion contact.

## Tuning knobs

All in `src/constants.js` (`PHYSICS`), with the UI mapping in
`src/main.js#applyPhysicsSettings`:

| Knob | Default | Effect |
| --- | --- | --- |
| `rolling` | 34 | constant deceleration; higher = shorter rolls |
| `friction` | 0.30 | viscous damping |
| `spinFriction` | 1.7 | how fast spin dies |
| `restitutionCoin` | 0.93 | liveliness of disc collisions |
| `restitutionWall` | 0.76 | liveliness of cushions |
| `coinFriction` | 0.16 | tangential grip / spin transfer |
| `wallFriction` | 0.055 | tangential grip on cushions |
| `iterations` | 6 | solver stability |
| `sleepSpeed` | 0.9 | rest threshold |
| `maxSubsteps` | 24 | CCD ceiling |
| `captureRadius` | 2.30 | pocket generosity (in `BOARD`) |

## Deliberate simplifications

- Discs are perfectly rigid and infinitely thin; no rolling-vs-sliding phase
  transition, no cloth compliance, no vertical bounce.
- Pocket jaws are solid walls with softened restitution, not circular cut-outs.
- Air drag, table tilt, humidity (powder) and coin thickness are ignored.
- Spin affects tangential impulses and cushion friction, but there is no Magnus
  force — a spinning coin does not curve through the air (it never leaves the
  surface).
- The striker's off-centre hit is approximated as described above.

These are bounded, documented approximations rather than silent guesses; the
engine stays deterministic, testable and fast enough for a 144 Hz browser loop.
