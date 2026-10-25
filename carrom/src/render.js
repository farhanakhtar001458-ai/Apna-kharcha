/* ==========================================================================
   Apna Carrom — canvas renderer.

   World coordinates are centimetres; the view maps them to CSS pixels and
   handles devicePixelRatio.  Rendering interpolates between the previous and
   current physics states (`alpha`) so motion is smooth at any refresh rate.
   ========================================================================== */

import { BOARD } from './constants.js';
import { getStriker, raycast } from './physics.js';

const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

export function makeView(canvas) {
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  const cssW = canvas.clientWidth || 640;
  const cssH = canvas.clientHeight || 640;
  const pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
  if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pad = Math.max(13, cssW * 0.055);
  const span = Math.min(cssW, cssH) - pad * 2;
  const scale = span / BOARD.size;
  const ox = (cssW - BOARD.size * scale) / 2;
  const oy = (cssH - BOARD.size * scale) / 2;
  return {
    ctx, cssW, cssH, dpr, pad, scale, ox, oy, span,
    X: x => ox + x * scale,
    Y: y => oy + y * scale,
    S: v => v * scale,
  };
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRound(ctx, x, y, w, h, r, fill) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill; ctx.fill();
}

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* --------------------------------- Board --------------------------------- */
function drawBoard(v, match) {
  const { ctx, cssW, cssH, scale } = v;
  const S = BOARD.size * scale;
  const x0 = v.ox, y0 = v.oy;

  ctx.clearRect(0, 0, cssW, cssH);

  // Ambient backdrop.
  const bg = ctx.createLinearGradient(0, 0, cssW, cssH);
  bg.addColorStop(0, '#0e1519'); bg.addColorStop(1, '#070b0d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, cssW, cssH);

  // Drop shadow + outer wooden frame.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = v.pad * 1.1; ctx.shadowOffsetY = v.pad * 0.35;
  const wood = ctx.createLinearGradient(x0 - v.pad, y0 - v.pad, x0 + S + v.pad, y0 + S + v.pad);
  wood.addColorStop(0, '#7a4a26'); wood.addColorStop(0.18, '#a9703b');
  wood.addColorStop(0.5, '#8a562c'); wood.addColorStop(0.82, '#a06a36'); wood.addColorStop(1, '#683d1f');
  fillRound(ctx, x0 - v.pad * 0.82, y0 - v.pad * 0.82, S + v.pad * 1.64, S + v.pad * 1.64, v.pad * 0.55, wood);
  ctx.restore();

  // Frame bevel.
  ctx.lineWidth = Math.max(1, v.pad * 0.10);
  ctx.strokeStyle = 'rgba(255,224,180,.16)';
  roundRectPath(ctx, x0 - v.pad * 0.82, y0 - v.pad * 0.82, S + v.pad * 1.64, S + v.pad * 1.64, v.pad * 0.55);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, v.pad * 0.07);
  ctx.strokeStyle = 'rgba(40,20,8,.55)';
  roundRectPath(ctx, x0 - v.pad * 0.42, y0 - v.pad * 0.42, S + v.pad * 0.84, S + v.pad * 0.84, v.pad * 0.3);
  ctx.stroke();

  // Playing surface.
  const surf = ctx.createRadialGradient(x0 + S * 0.38, y0 + S * 0.30, S * 0.05, x0 + S * 0.5, y0 + S * 0.5, S * 0.78);
  surf.addColorStop(0, '#fbf4df'); surf.addColorStop(0.55, '#f2e6c6'); surf.addColorStop(1, '#e4d3aa');
  fillRound(ctx, x0, y0, S, S, scale * 1.2, surf);

  // Subtle static speckle (deterministic — never shimmers between frames).
  ctx.save();
  roundRectPath(ctx, x0, y0, S, S, scale * 1.2); ctx.clip();
  for (let i = 0; i < 210; i++) {
    const px = x0 + hash(i * 3.1) * S, py = y0 + hash(i * 7.7 + 5) * S;
    ctx.globalAlpha = 0.018 + hash(i * 1.9) * 0.03;
    ctx.fillStyle = hash(i * 4.3) > 0.5 ? '#6b4a22' : '#ffffff';
    ctx.fillRect(px, py, Math.max(0.7, scale * 0.09), Math.max(0.7, scale * 0.09));
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Double border line.
  const inset = scale * 0.9;
  ctx.strokeStyle = 'rgba(70,45,20,.62)';
  ctx.lineWidth = Math.max(1, scale * 0.13);
  ctx.strokeRect(x0 + inset, y0 + inset, S - inset * 2, S - inset * 2);
  ctx.strokeStyle = 'rgba(70,45,20,.26)';
  ctx.lineWidth = Math.max(1, scale * 0.08);
  ctx.strokeRect(x0 + inset * 2.1, y0 + inset * 2.1, S - inset * 4.2, S - inset * 4.2);

  // Corner diagonals + arrowheads.
  ctx.strokeStyle = 'rgba(88,58,28,.34)';
  ctx.lineWidth = Math.max(1, scale * 0.11);
  const cx = x0 + S / 2, cy = y0 + S / 2;
  const diag = scale * 20;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * scale * BOARD.centerRadius * 0.75, cy + sy * scale * BOARD.centerRadius * 0.75);
    ctx.lineTo(cx + sx * diag, cy + sy * diag);
    ctx.stroke();
    const ax = cx + sx * diag, ay = cy + sy * diag;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - sx * scale * 1.6, ay);
    ctx.lineTo(ax, ay - sy * scale * 1.6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(88,58,28,.34)'; ctx.fill();
  }

  // Centre rings.
  ctx.strokeStyle = 'rgba(84,52,24,.55)';
  for (const [f, w] of [[1, 0.16], [0.74, 0.10], [0.30, 0.10]]) {
    ctx.lineWidth = Math.max(1, scale * w);
    ctx.beginPath(); ctx.arc(cx, cy, scale * BOARD.centerRadius * f, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(84,52,24,.6)';
  ctx.beginPath(); ctx.arc(cx, cy, scale * 0.5, 0, TAU); ctx.fill();

  // Small decorative dots near the centre ring.
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    ctx.fillStyle = 'rgba(84,52,24,.35)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * scale * BOARD.centerRadius * 0.87, cy + Math.sin(a) * scale * BOARD.centerRadius * 0.87, scale * 0.22, 0, TAU);
    ctx.fill();
  }

  // Baseline (striker line) with end caps.
  const by = v.Y(BOARD.baselineY);
  const bx1 = v.X(BOARD.strikerMinX - 1.6), bx2 = v.X(BOARD.strikerMaxX + 1.6);
  ctx.strokeStyle = 'rgba(70,45,20,.5)';
  ctx.lineWidth = Math.max(1, scale * 0.14);
  ctx.beginPath(); ctx.moveTo(bx1, by); ctx.lineTo(bx2, by); ctx.stroke();
  for (const bx of [bx1, bx2]) {
    ctx.beginPath(); ctx.arc(bx, by, scale * 0.42, 0, TAU);
    ctx.fillStyle = 'rgba(70,45,20,.45)'; ctx.fill();
  }

  // Pockets.
  drawPockets(v);

  // Current player's subtle baseline glow.
  if (match && match.phase !== 'gameover') {
    const col = match.turn === 0 ? 'rgba(255,236,190,.55)' : 'rgba(120,190,210,.55)';
    const g = ctx.createLinearGradient(bx1, by - scale * 3, bx2, by + scale * 3);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(bx1, by - scale * 0.5, bx2 - bx1, scale * 1);
  }

  // Brand on the frame.
  ctx.save();
  ctx.font = `600 ${Math.max(9, v.pad * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,235,205,.55)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('APNA CARROM', cssW / 2, y0 + S + v.pad * 0.46);
  ctx.restore();
}

function drawPockets(v) {
  const { ctx } = v;
  for (const p of [
    [BOARD.pocketInset, BOARD.pocketInset], [BOARD.size - BOARD.pocketInset, BOARD.pocketInset],
    [BOARD.pocketInset, BOARD.size - BOARD.pocketInset], [BOARD.size - BOARD.pocketInset, BOARD.size - BOARD.pocketInset],
  ]) {
    const x = v.X(p[0]), y = v.Y(p[1]), r = v.S(BOARD.pocketRadius);
    // Rim.
    ctx.beginPath(); ctx.arc(x, y, r + v.S(0.20), 0, TAU);
    ctx.fillStyle = 'rgba(90,62,32,.45)'; ctx.fill();
    // Hole.
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#241a12'); g.addColorStop(0.65, '#100b08'); g.addColorStop(1, '#050403');
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1, v.S(0.13));
    ctx.strokeStyle = 'rgba(255,240,210,.28)';
    ctx.stroke();
    // Inner highlight.
    ctx.beginPath(); ctx.arc(x - r * 0.28, y - r * 0.30, r * 0.32, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill();
  }
}

/* --------------------------------- Discs --------------------------------- */
const PALETTE = {
  white: { base: '#f7f0df', edge: '#b9a681', dark: '#d8c9a6', text: '#5b4a2c' },
  black: { base: '#33353c', edge: '#121317', dark: '#1d1f24', text: '#c9cdd6' },
  queen: { base: '#d8444c', edge: '#6f141b', dark: '#a3262e', text: '#ffe9c9' },
  striker: { base: '#e0c695', edge: '#6e5730', dark: '#b99c6a', text: '#4a3617' },
};

function drawDisc(v, d, x, y, opts = {}) {
  const { ctx } = v;
  const s = opts.scale ?? 1;
  const alpha = opts.alpha ?? 1;
  const r = v.S(d.r) * s;
  if (r <= 0.2) return;
  const pal = PALETTE[d.type] || PALETTE.white;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Shadow.
  ctx.beginPath();
  ctx.ellipse(x + v.S(0.28), y + v.S(0.42), r * 1.02, r * 0.88, 0, 0, TAU);
  ctx.fillStyle = 'rgba(35,22,8,.28)'; ctx.fill();

  // Body.
  const g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.40, r * 0.08, x, y, r * 1.12);
  g.addColorStop(0, pal.base); g.addColorStop(0.62, pal.base); g.addColorStop(1, pal.dark);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = Math.max(1, v.S(0.12));
  ctx.strokeStyle = pal.edge; ctx.stroke();

  // Glossy top-left highlight.
  ctx.beginPath();
  ctx.ellipse(x - r * 0.30, y - r * 0.36, r * 0.42, r * 0.20, -0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();

  if (d.type === 'striker') {
    ctx.beginPath(); ctx.arc(x, y, r * 0.70, 0, TAU);
    ctx.lineWidth = Math.max(1, v.S(0.20));
    ctx.strokeStyle = opts.ring || 'rgba(255,240,205,.85)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.20, 0, TAU);
    ctx.fillStyle = opts.ring || 'rgba(255,240,205,.85)'; ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(x, y, r * 0.74, 0, TAU);
    ctx.lineWidth = Math.max(1, v.S(0.09));
    ctx.strokeStyle = d.type === 'queen' ? 'rgba(255,225,150,.65)' : 'rgba(90,70,40,.28)';
    ctx.stroke();
    if (d.type === 'queen') {
      ctx.fillStyle = 'rgba(255,232,170,.92)';
      star(ctx, x, y, r * 0.46, r * 0.20, 5, d.angle * 0.2);
    }
  }
  ctx.restore();
}

function star(ctx, cx, cy, outer, inner, points, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}

function drawSinks(v, world) {
  const { ctx } = v;
  for (const d of world.discs) {
    if (!d.sink || d.sink.t >= 1) continue;
    const t = d.sink.t;
    const ease = 1 - Math.pow(1 - t, 2);
    const x = v.X(lerp(d.sink.x0, d.sink.x1, ease));
    const y = v.Y(lerp(d.sink.y0, d.sink.y1, ease));
    drawDisc(v, d, x, y, { scale: 1 - 0.78 * ease, alpha: 1 - 0.85 * t });
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.55;
    ctx.beginPath(); ctx.arc(v.X(d.sink.x1), v.Y(d.sink.y1), v.S(BOARD.pocketRadius) * (1 + t * 0.45), 0, TAU);
    ctx.lineWidth = Math.max(1, v.S(0.16));
    ctx.strokeStyle = d.type === 'queen' ? '#ffd27a' : '#ffffff';
    ctx.stroke();
    ctx.restore();
  }
}

/* ------------------------------ Aim assistance ----------------------------- */
function drawAim(v, world, aim, match) {
  if (!aim || !aim.show) return;
  const { ctx } = v;
  const s = getStriker(world);
  if (!s) return;
  const x = v.X(s.x), y = v.Y(s.y);
  const dir = { x: Math.cos(aim.angle), y: Math.sin(aim.angle) };
  const hit = raycast(world, { x: s.x, y: s.y }, dir, 105);
  const endX = v.X(hit ? hit.x : s.x + dir.x * 105);
  const endY = v.Y(hit ? hit.y : s.y + dir.y * 105);
  const accent = match && match.turn === 1 ? 'rgba(125,211,235,.9)' : 'rgba(255,214,130,.92)';

  // Ray.
  ctx.save();
  ctx.setLineDash([v.S(1.1), v.S(1.0)]);
  ctx.lineWidth = Math.max(1, v.S(0.16));
  ctx.strokeStyle = accent;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.setLineDash([]);

  // Ghost striker at impact.
  ctx.globalAlpha = 0.30;
  ctx.beginPath(); ctx.arc(endX, endY, v.S(s.r), 0, TAU);
  ctx.fillStyle = accent; ctx.fill();
  ctx.globalAlpha = 1;

  if (hit && hit.kind === 'disc' && hit.disc) {
    const nx = (hit.disc.x - hit.x), ny = (hit.disc.y - hit.y);
    const nl = Math.hypot(nx, ny) || 1;
    const ux = nx / nl, uy = ny / nl;
    const tx = v.X(hit.disc.x), ty = v.Y(hit.disc.y);
    const ex = tx + ux * v.S(8), ey = ty + uy * v.S(8);
    ctx.lineWidth = Math.max(1, v.S(0.2));
    ctx.strokeStyle = 'rgba(255,120,120,.75)';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ex, ey); ctx.stroke();
    // arrow head
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * v.S(1.4) - uy * v.S(0.7), ey - uy * v.S(1.4) + ux * v.S(0.7));
    ctx.lineTo(ex - ux * v.S(1.4) + uy * v.S(0.7), ey - uy * v.S(1.4) - ux * v.S(0.7));
    ctx.closePath(); ctx.fillStyle = 'rgba(255,120,120,.75)'; ctx.fill();
  } else if (hit && hit.kind === 'wall') {
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = Math.max(1, v.S(0.14));
    ctx.beginPath(); ctx.moveTo(endX, endY);
    ctx.lineTo(endX + dir.x * v.S(6), endY + dir.y * v.S(6) * (hit.sign || 1));
    ctx.stroke();
  }

  // Power ring around the striker.
  ctx.beginPath();
  ctx.arc(x, y, v.S(s.r + 0.85), -Math.PI / 2, -Math.PI / 2 + TAU * aim.power);
  ctx.lineWidth = Math.max(2, v.S(0.34));
  ctx.strokeStyle = aim.power > 0.85 ? 'rgba(255,110,110,.95)' : accent;
  ctx.stroke();
  ctx.restore();

  // Slingshot elastic band.
  if (aim.pull) {
    ctx.save();
    ctx.setLineDash([v.S(0.7), v.S(0.7)]);
    ctx.lineWidth = Math.max(1, v.S(0.13));
    ctx.strokeStyle = 'rgba(255,255,255,.42)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(v.X(aim.pull.x), v.Y(aim.pull.y)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(v.X(aim.pull.x), v.Y(aim.pull.y), v.S(0.55), 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fill();
    ctx.restore();
  }
}

/* ------------------------------- Particles ------------------------------- */
function drawParticles(v, fx) {
  if (!fx || !fx.length) return;
  const { ctx } = v;
  ctx.save();
  for (const p of fx) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a * (p.alpha ?? 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(v.X(p.x), v.Y(p.y), Math.max(0.4, v.S(p.size) * a), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* --------------------------------- Scene --------------------------------- */
export function drawScene(canvas, world, match, opts = {}) {
  const v = makeView(canvas);
  const { ctx } = v;
  const alpha = opts.alpha ?? 1;
  drawBoard(v, match);
  drawSinks(v, world);
  drawAim(v, world, opts.aim, match);

  const ringColor = match && match.turn === 1 ? 'rgba(125,211,235,.95)' : 'rgba(255,236,190,.95)';
  for (const d of world.discs) {
    if (!d.active) continue;
    const x = v.X(lerp(d.px, d.x, alpha));
    const y = v.Y(lerp(d.py, d.y, alpha));
    drawDisc(v, d, x, y, d.type === 'striker' ? { ring: ringColor } : {});
  }
  drawParticles(v, opts.fx);
  return v;
}
