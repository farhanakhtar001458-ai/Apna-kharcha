#!/usr/bin/env python3
"""
CHAND DUR — "What if the Moon left Earth's orbit?"
A 2D motion-graphics explainer rendered procedurally with Pillow + ffmpeg.

Every frame is drawn by code (no stock footage), so the whole video is
reproducible:  python3 scripts/render.py  ->  chand-dur-2d-motion-graphics.mp4

Style notes borrowed from the reference tutorial (Nijat Ibrahimli, "2D Motion
Graphics Delivery Animation in After Effects"):
  * flat vector shapes, no gradients on characters
  * stacked assets pre-composed, then whole-scene camera moves (position +
     rotation + overshoot) instead of animating every element separately
  * soft elliptical "drop shadow" layers under floating objects
  * every move uses ease-in/ease-out + a 3-6% overshoot squash
  * click/impact feedback = scale bounce pop
  * background is a calm flat colour with a second, darker tone for depth
"""

import math
import os
import random
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

# --------------------------------------------------------------------------
# config
# --------------------------------------------------------------------------
W, H = 1920, 1080
FPS = 30
DUR = 61.0
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "chand-dur-2d-motion-graphics.mp4")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DEV = os.path.join(HERE, "assets/fonts/NotoSansDevanagari.ttf")
FONT_LAT = os.path.join(HERE, "assets/fonts/Inter.ttf")
FFMPEG = os.environ.get("FFMPEG") or imageio_ffmpeg.get_ffmpeg_exe()
AUDIO_DIR = os.path.join(HERE, "audio")
VOICEOVER = not os.environ.get("NO_VO")      # NO_VO=1 -> silent render
VO_LEAD = 0.85      # seconds of quiet before each narration line starts
VO_TAIL = 1.15      # breathing room after each narration line ends
FPS_SAFE_MIN = 6.0  # no scene shorter than this
START_PAD = 4.6     # title builds before narration starts

# palette
BG0 = (9, 13, 31)
BG1 = (14, 20, 45)
BG2 = (19, 27, 58)
INK = (243, 245, 255)
MUTED = (150, 162, 196)
MOON = (246, 244, 229)
MOON_SH = (196, 190, 168)
MOON_SPOT = (216, 210, 188)
EARTH_B = (56, 132, 232)
EARTH_G = (66, 186, 130)
EARTH_L = (98, 203, 246)
WARM = (255, 196, 88)
DANGER = (255, 99, 92)
LIME = (156, 226, 122)
VIOLET = (161, 132, 255)

_FONTS = {}


def font(size, latin=False):
    key = (size, latin)
    if key not in _FONTS:
        _FONTS[key] = ImageFont.truetype(FONT_LAT if latin else FONT_DEV, size)
    return _FONTS[key]


# --------------------------------------------------------------------------
# easing helpers  (After Effects style curves)
# --------------------------------------------------------------------------
def clamp(v, a=0.0, b=1.0):
    return a if v < a else b if v > b else v


def lin(t, a, b):
    return clamp((t - a) / (b - a)) if b > a else 0.0


def smooth(t):
    return t * t * (3.0 - 2.0 * t)


def ease_io(t, a, b):
    return smooth(lin(t, a, b))


def ease_out(t, a, b):
    x = lin(t, a, b)
    return 1.0 - (1.0 - x) ** 3


def ease_in(t, a, b):
    x = lin(t, a, b)
    return x ** 3


def back_out(t, a, b, k=1.9):
    """ease with overshoot — the 'easy ease + 108% scale' AE trick"""
    x = lin(t, a, b)
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    return 1.0 + (k + 1) * (x - 1) ** 3 + k * (x - 1) ** 2


def lerp(a, b, t):
    return a + (b - a) * t


def lerp2(p, q, t):
    return (lerp(p[0], q[0], t), lerp(p[1], q[1], t))


def smooth_hand(ll):
    """clock hand that decelerates: fast at first, crawling later"""
    return 2.6 * (1 - math.exp(-1.1 * max(0.0, ll)))


def pop(t, t0, dur=0.34):
    """scale-bounce used for clicks / impacts: 0 -> 1.12 -> 0.97 -> 1"""
    x = lin(t, t0, t0 + dur)
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    return 1.0 + math.sin(x * math.pi * 2.0) * 0.14 * (1 - x) * 2.0 * (1 - x)


def typed(t, a, b, text):
    """typewriter slice of text for kinetic captions"""
    n = int(len(text) * ease_out(t, a, b))
    return text[:n]


def alpha_fade(t, a, b, c, d):
    """fade in between a..b, out between c..d"""
    i = ease_io(t, a, b)
    o = ease_io(t, c, d)
    return clamp(i - o)


# --------------------------------------------------------------------------
# drawing primitives
# --------------------------------------------------------------------------
_BG = None


def new_canvas():
    global _BG
    if _BG is None:
        g = Image.new("RGB", (1, 256))
        dg = ImageDraw.Draw(g)
        top, bot = (15, 21, 49), (6, 9, 24)
        for y in range(256):
            k = (y / 255) ** 2.4
            dg.point((0, y), tuple(int(lerp(top[i], bot[i], k)) for i in range(3)))
        _BG = g.resize((W, H), Image.BILINEAR)
    return _BG.copy()


def blob_shadow(im, cx, cy, rx, ry, color=(4, 6, 16), a=110):
    """soft elliptical contact shadow (the reference video's 'shadow' layer)"""
    pad = 3
    sh = Image.new("RGBA", (int(rx * 2) + pad * 2, int(ry * 2) + pad * 2), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    ds.ellipse([pad, pad, pad + rx * 2, pad + ry * 2], fill=color + (a,))
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    im.paste(sh, (int(cx - rx - pad), int(cy - ry - pad)), sh)


def glow(im, cx, cy, r, color, a=90, blur=40):
    pad = blur
    g = Image.new("RGBA", (int(r * 2) + pad * 2, int(r * 2) + pad * 2), (0, 0, 0, 0))
    dg = ImageDraw.Draw(g)
    dg.ellipse([pad, pad, pad + r * 2, pad + r * 2], fill=color + (a,))
    g = g.filter(ImageFilter.GaussianBlur(blur))
    im.paste(g, (int(cx - r - pad), int(cy - r - pad)), g)


def rrect(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def text_center(d, cy, s, f, fill, cx=W // 2, anchor="mm"):
    d.text((cx, cy), s, font=f, fill=fill, anchor=anchor)


def wrap(d, txt, f, maxw):
    """word wrap by measured width, honours explicit \n"""
    out = []
    for para in txt.split("\n"):
        line = ""
        for w in para.split():
            cand = (line + " " + w).strip()
            if d.textlength(cand, font=f) <= maxw or not line:
                line = cand
            else:
                out.append(line)
                line = w
        out.append(line)
    return "\n".join(out)


# --------------------------------------------------------------------------
# moon + earth art (drawn once, reused as sprites for speed)
# --------------------------------------------------------------------------
def make_moon(r):
    s = int(r * 2 + 8)
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = s / 2
    d.ellipse([4, 4, s - 4, s - 4], fill=MOON)
    # craters (flat, vector-ish)
    rng = random.Random(7)
    for _ in range(11):
        ang = rng.uniform(0, math.tau)
        rad = rng.uniform(0.15, 0.62) * r
        cr = rng.uniform(0.09, 0.2) * r
        x = c + math.cos(ang) * rad
        y = c + math.sin(ang) * rad * 0.95
        d.ellipse([x - cr, y - cr, x + cr, y + cr], fill=MOON_SPOT)
        d.ellipse([x - cr * .55, y - cr * .55, x + cr * .55, y + cr * .55], fill=MOON_SH)
    # terminator shading wedge (soft crescent)
    sh = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    ds.ellipse([s * 0.42, 4, s * 1.1, s - 4], fill=(120, 112, 92, 70))
    sh = sh.filter(ImageFilter.GaussianBlur(26))
    im = Image.alpha_composite(im, Image.composite(sh, Image.new("RGBA", (s, s), (0, 0, 0, 0)),
                                                   im.split()[3]))
    return im


def paste_sprite(im, sprite, cx, cy, scale=1.0, rot=0.0, opacity=1.0):
    if scale <= 0.01 or opacity <= 0.01:
        return
    sp = sprite
    if abs(scale - 1.0) > 0.001:
        w = max(1, int(sp.width * scale))
        sp = sp.resize((w, w), Image.LANCZOS)
    if abs(rot) > 0.01:
        sp = sp.rotate(rot, resample=Image.BICUBIC, expand=False)
    if opacity < 0.999:
        a = sp.split()[3].point(lambda v: int(v * opacity))
        sp = sp.copy()
        sp.putalpha(a)
    im.paste(sp, (int(cx - sp.width / 2), int(cy - sp.height / 2)), sp)


EARTH_R = 108


def make_earth(r):
    """Earth drawn once as an RGBA sprite -> the 'pre-comp' from the reference
    video: build the asset, then only animate scale / rotation / opacity."""
    r = max(8, int(r))
    pad = 30
    s = r * 2 + pad * 2
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    o = pad
    d.ellipse([o, o, o + r * 2, o + r * 2], fill=EARTH_B)
    # chunky flat continents
    lands = [(-0.42, -0.62, 0.52, 0.34), (0.02, -0.22, 0.36, 0.52),
             (-0.66, 0.10, 0.34, 0.40), (0.34, 0.26, 0.40, 0.26),
             (-0.10, -0.94, 0.44, 0.22)]
    for (ux, uy, uw, uh) in lands:
        x = o + (ux + 1) * r
        y = o + (uy + 1) * r
        d.ellipse([x, y, x + uw * r, y + uh * r], fill=EARTH_G)
    # ice caps clipped to the disc
    cap = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    dc = ImageDraw.Draw(cap)
    dc.ellipse([o + r * .10, o - r * .42, o + r * 1.90, o + r * .34], fill=(240, 247, 255, 230))
    dc.ellipse([o + r * .12, o + 2 * r - r * .32, o + r * 1.88, o + 2 * r + r * .42], fill=(240, 247, 255, 230))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse([o, o, o + 2 * r, o + 2 * r], fill=255)
    im.paste(cap, (0, 0), Image.composite(cap.split()[3], Image.new("L", (s, s), 0), mask))
    # day/night shading from the right + atmosphere rim on the lit edge
    sh = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([o + r * .78, o, o + 2 * r + r * .3, o + 2 * r],
                               fill=(12, 20, 50, 58))
    sh = sh.filter(ImageFilter.GaussianBlur(int(r * .16) + 2))
    im = Image.alpha_composite(im, Image.composite(sh, Image.new("RGBA", (s, s), (0, 0, 0, 0)), mask))
    d2 = ImageDraw.Draw(im)
    d2.arc([o, o, o + 2 * r, o + 2 * r], 130, 255, fill=EARTH_L, width=max(3, int(r * .07)))
    return im


_EARTH_CACHE = {}


def draw_earth(im, cx, cy, r=EARTH_R, t=0.0, opacity=1.0, rot=0.0):
    if opacity <= 0.01:
        return
    r = max(8, int(r))
    key = (r, int(rot / 6))
    if key not in _EARTH_CACHE:
        _EARTH_CACHE[key] = make_earth(r).rotate(key[1] * 6, resample=Image.BICUBIC)
    sp = _EARTH_CACHE[key]
    glow(im, cx, cy, r * 1.45, (60, 130, 230), a=int(70 * opacity), blur=42)
    if opacity < .999:
        a = sp.split()[3].point(lambda v: int(v * opacity))
        sp = sp.copy()
        sp.putalpha(a)
    im.paste(sp, (int(cx - sp.width / 2), int(cy - sp.height / 2)), sp)


# --------------------------------------------------------------------------
# reusable UI / graphic modules
# --------------------------------------------------------------------------
def header(im, d, t, kicker, title, a_in, a_out=999):
    op = alpha_fade(t, a_in, a_in + .5, a_out, a_out + .4)
    if op <= .01:
        return
    col = tuple(int(lerp(BG1[i], 255, op * 0)) for i in range(3))
    ink = tuple(int(lerp(BG1[i], INK[i], op)) for i in range(3))
    mut = tuple(int(lerp(BG1[i], MUTED[i], op)) for i in range(3))
    d.rectangle([120, 96, 132, 176], fill=WARM if op > .5 else BG1)
    d.text((160, 88), kicker, font=font(28), fill=mut)
    d.text((158, 130), title, font=font(62), fill=ink)
    return op


def chip(im, d, cx, cy, label, col, t, t0, w=None):
    x = ease_out(t, t0, t0 + .45)
    if x <= 0:
        return
    op = clamp(x)
    f = font(34)
    tw = d.textlength(label, font=f)
    ww = w or tw + 64
    hh = 62
    c = tuple(int(lerp(BG1[i], col[i], op)) for i in range(3))
    rrect(d, [cx - ww / 2, cy - hh / 2 + (1 - x) * 18, cx + ww / 2, cy + hh / 2 + (1 - x) * 18],
          hh / 2, fill=tuple(int(lerp(BG0[i], col[i], op * .18)) for i in range(3)))
    d.rounded_rectangle([cx - ww / 2, cy - hh / 2 + (1 - x) * 18, cx + ww / 2,
                         cy + hh / 2 + (1 - x) * 18], radius=hh / 2, outline=c, width=2)
    d.text((cx, cy + (1 - x) * 18), label, font=f,
           fill=tuple(int(lerp(BG0[i], c[i], op)) for i in range(3)), anchor="mm")


def arrow(d, p, q, col=INK, w=5, head=18, t=1.0):
    p = lerp2(p, q, t)
    d.line([p, q], fill=col, width=w)
    if t > .9:
        ang = math.atan2(q[1] - p[1], q[0] - p[0])
        for s in (-1, 1):
            a = ang + s * .5
            d.line([q, (q[0] - math.cos(a) * head, q[1] - math.sin(a) * head)], fill=col, width=w)


def icon_brain(im, d, cx, cy, s=1.0, t=0.0):
    """stylised Earth-moon system icon (used in the 'physics' card)"""
    glow(im, cx, cy, 90 * s, (120, 160, 255), a=40, blur=36)
    d.ellipse([cx - 34 * s, cy - 34 * s, cx + 34 * s, cy + 34 * s], fill=EARTH_B)
    d.ellipse([cx - 26 * s, cy - 30 * s, cx + 6 * s, cy - 4 * s], fill=EARTH_G)
    d.ellipse([cx + 2 * s, cy + 2 * s, cx + 26 * s, cy + 26 * s], fill=EARTH_G)
    ang = t * 3
    mx, my = cx + 62 * s * math.cos(ang), cy + 26 * s * math.sin(ang)
    d.ellipse([mx - 11 * s, my - 11 * s, mx + 11 * s, my + 11 * s], fill=MOON)


# --------------------------------------------------------------------------
# scene: 1 — title
# --------------------------------------------------------------------------
def scene_title(im, d, t, moon):
    p = lerp(0, 1, ease_io(t, 0, .8))
    cx = W / 2 + math.sin(t * 1.4) * 12
    cy = 470 + math.cos(t * 1.7) * 8

    # slow rotating orbit ring + a second tilted ring
    d.ellipse([cx - 300, cy - 96, cx + 300, cy + 96], outline=(70, 82, 130), width=2)
    d.ellipse([cx - 220, cy - 70, cx + 220, cy + 70], outline=(52, 62, 104), width=1)

    blob_shadow(im, cx, cy + 250, 230, 42, a=90)
    draw_earth(im, cx, cy, r=150, opacity=clamp(p * 1.2))

    # moon flies in from the right along its orbit and overshoots into place
    s_in = ease_io(t, .45, 1.6)
    ang = lerp(-0.9, 0.55, s_in)
    mx = cx + 300 * math.cos(ang) * 1.0
    my = cy + 96 * math.sin(ang)
    ms = 0.62 * (0.6 + .4 * ease_out(t, .45, 1.4))
    paste_sprite(im, moon, mx, my, ms, rot=0, opacity=clamp(s_in * 1.6))

    # title words rise + settle (kinetic type, word-by-word stagger)
    words = ["चाँद", "अगर", "पृथ्वी", "की", "कक्षा", "छोड़", "दे?"]
    f = font(92)
    gaps = 34
    widths = [d.textlength(w, font=f) for w in words]
    total = sum(widths) + gaps * (len(words) - 1)
    x = W / 2 - total / 2
    for i, w in enumerate(words):
        ta = .55 + i * .09
        e = back_out(t, ta, ta + .42)
        if e > 0:
            yy = 790 + (1 - e) * 54
            col = WARM if w in ("कक्षा", "दे?") else INK
            d.text((x, yy), w, font=f, fill=col)
        x += widths[i] + gaps

    sub = alpha_fade(t, 1.9, 2.4, 4.2, 4.6)
    d.text((W / 2, 950), "एक 2D मोशन-ग्राफ़िक्स कहानी", font=font(36),
           fill=tuple(int(lerp(BG0[i], MUTED[i], sub)) for i in range(3)), anchor="mm")


# --------------------------------------------------------------------------
# scene 2 — why it happens
# --------------------------------------------------------------------------
def scene_why(im, d, t, moon=None):
    ll = t - 5.2
    header(im, d, ll, "भाग 01 · कारण", "चाँद क्यों टिका है?", 0)
    op = ease_io(ll, 0, .6)

    # left: orbit diagram, animated
    cx, cy = 560, 640
    rx, ry = 330, 130
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=(72, 84, 134), width=2)
    prog = clamp(ease_io(ll, .2, 2.0))
    idle = max(0.0, ll - 2.4) * 0.42          # keeps the orbit alive for the VO
    spin = ll * 9
    # dashed trail
    n = 46
    for i in range(int(n * prog)):
        a = i / n * math.tau
        x, y = cx + rx * math.cos(a), cy + ry * math.sin(a)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(110, 128, 190))
    draw_earth(im, cx, cy, r=70, rot=spin)
    ma = -1.2 + prog * 2.2 + idle
    mx, my = cx + rx * math.cos(ma), cy + ry * math.sin(ma)
    blob_shadow(im, cx, cy + 150, 190, 26, a=70)
    d.ellipse([mx - 26, my - 26, mx + 26, my + 26], fill=MOON)
    d.ellipse([mx - 8, my - 10, mx - 2, my - 4], fill=MOON_SH)
    arrow(d, (cx, cy), (mx, my), col=(120, 140, 200), w=3, head=14, t=clamp(ease_io(ll, .9, 1.6)))
    d.text((cx + 150, cy + 26), "गुरुत्वाकर्षण", font=font(30), fill=(150, 190, 240))
    d.text((cx - 168, cy + 148), "पृथ्वी", font=font(28), fill=EARTH_L)

    # right: three reasons on cards
    items = [
        ("1", "गुरुत्वाकर्षण", "पृथ्वी चाँद को खींचती है", EARTH_L),
        ("2", "कक्षीय गति", "1.02 km/s — चाँद गिरता ही है,\nपर हमेशा बाहर निकल जाता है", WARM),
        ("3", "चाँद की जड़ता", "दूर नहीं जाता, क्योंकि\nतोड़ने वाला कोई बल ही नहीं", LIME),
    ]
    bx = 1080
    for i, (num, head, body, col) in enumerate(items):
        ta = .35 + i * .35
        e = back_out(ll, ta, ta + .5)
        if e <= 0:
            continue
        y = 330 + i * 165 + (1 - e) * 30
        rrect(d, [bx, y, W - 140, y + 132], 24, fill=(21, 29, 62),
              outline=(40, 52, 96), width=2)
        d.ellipse([bx + 26, y + 34, bx + 90, y + 98], fill=col)
        d.text((bx + 58, y + 66), num, font=font(34), fill=BG0, anchor="mm")
        d.text((bx + 112, y + 26), head, font=font(40), fill=INK)
        d.multiline_text((bx + 112, y + 78), body, font=font(27), fill=MUTED, spacing=8)


# --------------------------------------------------------------------------
# scene 3 — Day 0: snap
# --------------------------------------------------------------------------
def scene_snap(im, d, t, moon):
    ll = t - 12.4
    header(im, d, ll, "भाग 02 · दिन 0", "एक झटका — कक्षा ख़त्म", 0)

    cx, cy = W / 2 - 30, 640
    push = ease_io(ll, 0, 2.4)      # slow push-in (camera move)
    creep = ease_io(ll, 5.0, 20.0)  # keeps the shot breathing under the narration
    base_r = 210
    r = base_r * (1.06 + 0.02 * push + 0.05 * creep)
    cy = cy - 26 * creep
    # far starfield drifting slowly (depth layer)
    rng0 = random.Random(5)
    for k in range(90):
        sx = (rng0.uniform(0, W) - ll * 6 * (0.3 + (k % 5) * 0.2)) % W
        sy = rng0.uniform(0, H)
        v = 60 + (k % 7) * 8
        d.ellipse([sx, sy, sx + 2, sy + 2], fill=(v, v, v + 26))

    # expanding shockwave rings right after the snap
    for i in range(3):
        ph = lin(ll, 1.2 + i * .22, 3.2 + i * .3)
        if 0 < ph < 1:
            rr = r + ph * 760
            a = int(90 * (1 - ph))
            ring = Image.new("RGBA", (int(rr * 2 + 40), int(rr * 2 + 40)), (0, 0, 0, 0))
            dr = ImageDraw.Draw(ring)
            dr.ellipse([20, 20, 20 + rr * 2, 20 + rr * 2], outline=DANGER + (a,),
                       width=max(2, int(9 * (1 - ph))))
            im.paste(ring, (int(cx - rr - 20), int(cy - rr - 20)), ring)

    # moon breaks away: starts on the old orbit, accelerates out to the right
    snap = back_out(ll, 1.0, 1.5, k=2.4)
    fly = ease_in(ll, 1.3, 5.4) ** 1.6
    ang0 = -0.62
    ox, oy = cx + 470 * math.cos(ang0), cy + 190 * math.sin(ang0)
    mx = lerp(ox, W + 420, fly)
    my = lerp(oy, oy - 300, fly) + math.sin(ll * 2.2) * 12
    mscale = lerp(1.0, .35, fly)

    # orbit ring snaps and fades
    ring_op = 1 - ease_io(ll, 1.1, 1.8)
    if ring_op > .02:
        col = tuple(int(lerp(BG0[i], 78, ring_op)) for i in range(3))
        d.ellipse([cx - 470, cy - 190, cx + 470, cy + 190], outline=col, width=2)

    blob_shadow(im, cx, cy + r * 1.15, r * 1.15, r * .2, a=100)
    draw_earth(im, cx, cy, r=r)

    # broken gravity-arrow stubs
    br = ease_io(ll, .9, 2.0)
    if br > 0 and fly < .85:
        p1 = lerp2((ox, oy), (cx + 200, cy), .35 * br)
        arrow(d, (ox, oy), p1, col=DANGER, w=5, head=20, t=br)

    if fly < .92:
        paste_sprite(im, moon, mx, my, 0.95 * mscale, rot=fly * -140)
    else:
        # receding spec: stays visible, gets smaller, trails a thin motion line
        dot_a = clamp(1 - lin(ll, 6.0, 19.0) * .75)
        drift = (ll - 4.6)
        dx, dy = W - 300 - drift * 1.6, 232 + drift * 1.1
        d.line([(dx - 60, dy + 13), (dx, dy)], fill=(70, 80, 120), width=2)
        d.ellipse([dx - 7, dy - 7, dx + 7, dy + 7], fill=tuple(int(v * dot_a) for v in MOON))
        d.text((dx + 16, dy - 10), "चाँद", font=font(26),
               fill=tuple(int(v * dot_a) for v in MUTED))

    # labels
    a1 = alpha_fade(ll, .2, .7, 1.0, 1.3)
    if a1 > .01:
        d.text((W / 2, 900), "पृथ्वी और चाँद की गुरुत्व-डोर टूट गई",
               font=font(46), fill=tuple(int(lerp(BG0[i], INK[i], a1)) for i in range(3)), anchor="mm")
    a2 = alpha_fade(ll, 1.3, 1.7, 3.6, 4.1)
    if a2 > .01:
        d.text((W / 2, 900), "चाँद अब सीधी रेखा में — 1.02 km/s की रफ़्तार से",
               font=font(46), fill=tuple(int(lerp(BG0[i], WARM[i], a2)) for i in range(3)), anchor="mm")

    # ---- beat 2: the moon is gone; the tangent path keeps drawing ----
    if fly > .9:
        h = alpha_fade(ll, 4.6, 5.3, 900, 901)
        if h > .01:
            dash = (ll * 130) % 44
            x = -100 + dash
            while x < W + 100:
                x1, x2 = max(-20, x), min(W + 20, x + 26)
                # leave a gap where the Earth sits, the path only shows outside it
                clear = abs(((x1 + x2) / 2) - cx) > r + 30
                if x2 > x1 and clear:
                    d.line([(x1, oy), (x2, oy)],
                           fill=tuple(int(v * h * .55) for v in (96, 110, 158)), width=3)
                x += 44
            d.text((W / 2, 952), "पृथ्वी अकेली रह गई — पर उसकी कक्षा सूर्य के इर्द-गिर्द वैसी ही है",
                   font=font(38), fill=tuple(int(v * h) for v in MUTED), anchor="mm")
            # 1 s of screen time = 1 story day -> 1.02 km/s * 86400 s ~ 0.88 lakh km
            dist = max(0.0, ll - 5.0) * 0.88
            d.text((W - 160, 856), f"चाँद अब {dist:4.1f} लाख किमी दूर",
                   font=font(32), fill=tuple(int(v * h) for v in WARM), anchor="ra")

    # speed streak particles behind the moon
    if .3 < fly < .95:
        rng = random.Random(11)
        for i in range(26):
            k = (i / 26 + ll * .8) % 1
            px = mx - k * 900
            py = my + rng.uniform(-120, 120) * mscale
            aa = int(120 * (1 - k) * (1 - fly * .4))
            d.line([(px, py), (px + 90 * (1 - k), py)], fill=(120, 130, 170), width=2)


# --------------------------------------------------------------------------
# scene 4 — Day 1
# --------------------------------------------------------------------------
def scene_day1(im, d, t, moon):
    ll = t - 18.6
    header(im, d, ll, "भाग 03 · दिन 1", "बिना चाँद के, तेज़ और अंधेरी रातें", 0)

    # day counter badge (sits under the header, right aligned to the kicker)
    e = back_out(ll, .1, .55)
    bx0, by0 = 1420, 96
    rrect(d, [bx0, by0, bx0 + 330, by0 + 104], 24, fill=(30, 24, 20), outline=WARM, width=2)
    d.text((bx0 + 28, by0 + 30), "दिन", font=font(28), fill=MUTED)
    d.text((bx0 + 120, by0 + 18), f"{min(30, int(1 + ll * 3)):02d}",
           font=font(62, latin=True), fill=WARM)

    # left column: day-length bars
    bx, by = 160, 330
    d.text((bx, by), "एक दिन की लंबाई", font=font(34), fill=MUTED)
    w1 = 560
    d.rectangle([bx, by + 64, bx + w1, by + 108], fill=(44, 56, 96))
    d.rectangle([bx, by + 64, bx + w1 * ease_io(ll, .3, 1.2), by + 108], fill=EARTH_L)
    d.text((bx, by + 122), "अब: 24 घंटे", font=font(32), fill=INK)
    d.rectangle([bx, by + 214, bx + w1, by + 258], fill=(44, 56, 96))
    d.rectangle([bx, by + 214, bx + w1 * ease_io(ll, .9, 1.9), by + 258], fill=WARM)
    d.text((bx, by + 272), "बिना चाँद: ~31 घंटे", font=font(32), fill=INK)
    d.multiline_text((bx, by + 350),
                     "हर साल केवल 1.8 ms का बदलाव —\nपर 4 अरब साल बहुत लंबा वक़्त है।",
                     font=font(27), fill=MUTED, spacing=12)

    # right: the slowing clock
    cx, cy, rr = 1330, 600, 195
    op = ease_io(ll, .2, .9)
    if op > .01:
        glow(im, cx, cy, rr * 1.4, (90, 110, 200), a=int(55 * op), blur=44)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(26, 34, 74))
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(74, 92, 156), width=3)
        for i in range(12):
            a = i / 12 * math.tau
            x1, y1 = cx + math.cos(a) * (rr - 24), cy + math.sin(a) * (rr - 24)
            x2, y2 = cx + math.cos(a) * (rr - 46), cy + math.sin(a) * (rr - 46)
            d.line([(x1, y1), (x2, y2)], fill=(118, 136, 198), width=3)
        d.line([(cx, cy), (cx + 108 * math.cos(-2.2), cy + 108 * math.sin(-2.2))],
               fill=INK, width=9)
        sa = -1.4 + smooth_hand(ll)
        d.line([(cx, cy), (cx + 148 * math.cos(sa), cy + 148 * math.sin(sa))], fill=DANGER, width=5)
        d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=WARM)
        d.text((cx, cy + rr + 50), "पृथ्वी का स्पिन अब बिना ब्रेक",
               font=font(27), fill=MUTED, anchor="mm")

    # live ticker: the day keeps stretching while you watch
    tk = alpha_fade(ll, 2.6, 3.2, 900, 901)
    if tk > .01:
        ms = 1.8 * clamp((ll - 2.6) / 3.2)
        d.text((bx, by + 496), "हर सदी में बढ़ रहा है:", font=font(26),
               fill=tuple(int(v * tk) for v in MUTED))
        d.text((bx, by + 532), f"+ {ms:4.2f} मिलीसेकंड",
               font=font(42), fill=tuple(int(v * tk) for v in EARTH_L))

    for i, txt in enumerate(["तारे ज़्यादा दिखेंगे", "ज्वार-भाटा छोटे होंगे", "धुरी लड़खड़ाएगी"]):
        chip(im, d, 380 + i * 420, 1000, txt, [MUTED, WARM, VIOLET][i], ll, 1.2 + i * .25)


# --------------------------------------------------------------------------
# scene 5 — Day 30
# --------------------------------------------------------------------------
def scene_day30(im, d, t, moon):
    ll = t - 26.4
    header(im, d, ll, "भाग 04 · दिन 30", "धुरी हिलने लगी", 0)

    e = back_out(ll, 0, .5)
    rrect(d, [140, 210, 470, 320], 26, fill=(26, 22, 38), outline=VIOLET, width=2)
    d.text((170, 232), "दिन", font=font(30), fill=MUTED)
    d.text((285, 228), f"{min(90, 30 + int(ll * 12)):02d}", font=font(64, latin=True), fill=VIOLET)

    # big tilted earth with a wobbling axis, charted against a fixed reference axis
    cx, cy = 560, 660
    tilt = 23.5 + math.sin(ll * 2.4) * 7.0 * ease_io(ll, .4, 1.4)
    draw_earth(im, cx, cy, r=180, rot=ll * 9)

    # reference vertical + wobbling axis (extended)
    d.line([(cx, cy - 300), (cx, cy + 300)], fill=(64, 76, 122), width=2)
    a = math.radians(-90 + tilt)
    ax, ay = cx + 330 * math.cos(a), cy + 330 * math.sin(a)
    d.line([(cx, cy), (ax, ay)], fill=VIOLET, width=6)
    d.ellipse([ax - 9, ay - 9, ax + 9, ay + 9], fill=VIOLET)
    d.text((ax + 20, ay - 10), f"{tilt:4.1f}°", font=font(34, latin=True), fill=VIOLET)
    if int(ll * 2) % 2 == 0:
        d.ellipse([ay and 0 or 0, 0, 0, 0]) if False else None
        d.ellipse([cx - 6, cy - 300 - 6, cx + 6, cy - 300 + 6], fill=(90, 104, 158))
    d.text((cx + 12, cy + 320), "धुरी का झुकाव", font=font(26), fill=MUTED)

    # wobble sine wave
    gx0, gy0, gw, gh = 980, 420, 700, 220
    d.line([(gx0, gy0 + gh / 2), (gx0 + gw, gy0 + gh / 2)], fill=(50, 60, 104), width=2)
    pts = []
    grow = ease_io(ll, .6, 2.8)
    for i in range(0, gw + 1, 8):
        xx = gx0 + i
        if i > gw * grow:
            break
        th = (i / gw) * math.tau * 2.2
        pts.append((xx, gy0 + gh / 2 - math.sin(th) * (gh / 2 - 20)))
    if len(pts) > 2:
        d.line(pts, fill=VIOLET, width=5, joint="curve")
    d.text((gx0, gy0 - 24), "अक्ष का कंपन (चाँद की गुरुत्व-मुद्रा खोने पर)",
           font=font(28), fill=MUTED)

    # consequences list with icons
    items = [("मौसम का पहिया तेज़", "साल भर में झुकाव 22°–32° तक घूमेगा", WARM),
             ("खगोलीय ध्रुव डगमग", "नक़्शे और GPS की दिशा बदलेगी", VIOLET),
             ("मानसून-जैसी गड़बड़", "बारिश का पैटर्न बेकाबू", EARTH_L)]
    for i, (h, b, col) in enumerate(items):
        ta = .9 + i * .3
        e = back_out(ll, ta, ta + .5)
        if e <= 0:
            continue
        y = 720 + i * 96 + (1 - e) * 26
        d.ellipse([980, y, 1004, y + 24], fill=col)
        d.text((1024, y - 10), h, font=font(34), fill=INK)
        d.text((1400, y - 8), b, font=font(26), fill=MUTED)


# --------------------------------------------------------------------------
# scene 6 — Year 1
# --------------------------------------------------------------------------
def scene_year1(im, d, t, moon):
    ll = t - 34.6
    header(im, d, ll, "भाग 05 · साल 1", "ज्वार-भाटा और स्थिरता", 0)
    op = ease_io(ll, .1, .8)

    # left: tide diagram — big sun vs small moon pull
    cx, cy = 620, 760
    d.ellipse([cx - 560, cy - 140, cx + 560, cy + 140], outline=(46, 58, 100), width=2)
    d.ellipse([cx - 300, cy - 74, cx + 300, cy + 74], outline=(70, 96, 170), width=3, )
    # earth at centre with slight bulge
    blob_shadow(im, cx, cy + 190, 210, 30, a=90)
    blend_pulse = .5 + .5 * math.sin(ll * 1.5)
    for k in range(3):
        ph = (ll * .32 + k / 3) % 1.0
        trr = 96 + ph * 380
        a = int(70 * (1 - ph) * op)
        if a > 3:
            ring = Image.new("RGBA", (int(trr * 2 + 30), int(trr * 2 + 30)), (0, 0, 0, 0))
            ImageDraw.Draw(ring).ellipse([15, 15, 15 + trr * 2, 15 + trr * 2],
                                         outline=(140, 205, 255, a), width=3)
            ring = ring.resize((ring.width, int(ring.height * .34)), Image.BILINEAR)
            im.paste(ring, (int(cx - ring.width / 2), int(cy - ring.height / 2)), ring)
    bulge = 1.0 + .05 * math.sin(ll * 3.1) * op
    draw_earth(im, cx, cy, r=96, rot=ll * 16)
    d.ellipse([cx - 96 / bulge, cy - 96 * bulge, cx + 96 / bulge, cy + 96 * bulge],
              outline=(140, 200, 255), width=3)

    sun_x = cx + lerp(300, 560, ease_out(ll, .2, 1.6))
    sun_y = cy - 20
    if op > .02:
        glow(im, sun_x, sun_y, 150, (255, 190, 60), a=int(100 * op), blur=58)
        sr = 74 * (1 + .03 * math.sin(ll * 2.2))
        d.ellipse([sun_x - sr, sun_y - sr, sun_x + sr, sun_y + sr], fill=(255, 214, 96))
        d.text((sun_x, sun_y + 104), "सूर्य", font=font(27), fill=WARM, anchor="mm")

    # moon ghost on the far orbit
    mx, my = cx - 470, cy - 96
    if op > .05:
        paste_sprite(im, moon, mx, my, .34, opacity=op * .75)
        d.text((mx, my - 70), "चाँद गया", font=font(24), fill=MUTED, anchor="mm")

    d.text((150, 300), "ज्वार-भाटा अब सिर्फ़ सूर्य से", font=font(38), fill=INK)
    d.text((150, 356), "पहले ~100%", font=font(28), fill=MUTED)
    a = back_out(ll, .5, 1.0)
    if a > 0:
        pct = max(40, int(72 - ll * 6))
        d.text((150, 396), f"{pct}%", font=font(62, latin=True), fill=EARTH_L)
        d.text((150, 470), "ज्वार की ताक़त", font=font(26), fill=MUTED)

    # right: three stability columns dropping in with a stagger (AE-style)
    cards = [("समुद्री जीवन", "ज्वार-चक्र छोटा, टाइमिंग बदलेगी", LIME),
             ("रात की रोशनी", "केवल तारों की रोशनी", WARM),
             ("पृथ्वी का झुकाव", "पूरी तरह स्थिर नहीं रहेगा", DANGER)]
    for i, (h, b, col) in enumerate(cards):
        ta = .7 + i * .3
        e = back_out(ll, ta, ta + .55)
        if e <= 0:
            continue
        x = 1046 + i * 252
        y = 300 + (1 - e) * -50
        rrect(d, [x, y, x + 232, y + 290], 22, fill=(20, 28, 60), outline=col, width=2)
        d.ellipse([x + 88, y + 46, x + 148, y + 106], fill=col)
        d.text((x + 118, y + 76), str(i + 1), font=font(34), fill=BG0, anchor="mm")
        d.multiline_text((x + 26, y + 140), wrap(d, h, font(31), 180), font=font(31),
                         fill=INK, spacing=8)
        d.multiline_text((x + 26, y + 210), wrap(d, b, font(23), 182), font=font(23),
                         fill=MUTED, spacing=8)


# --------------------------------------------------------------------------
# scene 7 — Year 10 / long term
# --------------------------------------------------------------------------
def scene_decade(im, d, t, moon):
    ll = t - 42.6
    header(im, d, ll, "भाग 06 · दसक से सदी", "धीरे-धीरे होने वाले बदलाव", 0)

    # timeline hairline with markers
    y0 = 360
    d.line([(200, y0), (W - 200, y0)], fill=(54, 66, 112), width=3)
    prog = ease_io(ll, .2, 2.4)
    d.line([(250, y0), (250 + (W - 500) * prog, y0)], fill=WARM, width=5)
    marks = [(0.0, "आज", "24 घंटे का दिन"), (0.25, "+10 साल", "लंबे दिन"),
             (0.5, "+100 साल", "नई सामान्य स्थिति"), (0.75, "+1000 साल", "अलग पृथ्वी")]
    for i, (p, lab, sub) in enumerate(marks):
        x = 250 + (W - 500) * p
        e = back_out(ll, .3 + i * .35, .75 + i * .35)
        if e <= 0:
            continue
        d.ellipse([x - 13, y0 - 13, x + 13, y0 + 13], fill=WARM if p <= prog else (60, 72, 120))
        d.text((x, y0 - 46), lab, font=font(30), fill=INK, anchor="mm")
        d.text((x, y0 + 44), sub, font=font(24), fill=MUTED, anchor="mm")

    # day-length curve: 24h -> 31h asymptote
    gx, gy, gw, gh = 300, 520, 1320, 380
    d.line([(gx, gy + gh), (gx + gw, gy + gh)], fill=(54, 66, 112), width=2)
    d.line([(gx, gy), (gx, gy + gh)], fill=(54, 66, 112), width=2)
    for hgt in (24, 27, 31):
        pass
    d.text((gx - 60, gy + gh - 6), "24h", font=font(26, latin=True), fill=MUTED, anchor="ra")
    d.text((gx - 60, gy + 6), "31h", font=font(26, latin=True), fill=MUTED, anchor="ra")
    pts = []
    steps = 80
    for i in range(steps + 1):
        f = i / steps
        if f > prog:
            break
        x = gx + gw * f
        val = 24 + 7 * (1 - math.exp(-3.2 * f))
        y = gy + gh - (val - 24) / 7 * gh
        pts.append((x, y))
    if len(pts) > 2:
        d.line(pts, fill=EARTH_L, width=6, joint="curve")
        d.ellipse([pts[-1][0] - 9, pts[-1][1] - 9, pts[-1][0] + 9, pts[-1][1] + 9], fill=INK)
        if prog < .999:      # static end label only until the playhead takes over
            d.text((pts[-1][0] + 20, pts[-1][1] - 6),
                   f"{24 + 7 * (1 - math.exp(-3.2 * prog)):4.1f} घंटे",
                   font=font(30), fill=INK)
    # playhead walking along the finished curve (keeps the chart alive)
    if prog >= .999:
        walk = clamp((ll - 2.6) / 7.0)
        f = walk
        px = gx + gw * f
        val = 24 + 7 * (1 - math.exp(-3.2 * f))
        py = gy + gh - (val - 24) / 7 * gh
        d.line([(px, gy), (px, gy + gh)], fill=(44, 54, 92), width=2)
        d.ellipse([px - 11, py - 11, px + 11, py + 11], outline=INK, width=3)
        d.ellipse([px - 4, py - 4, px + 4, py + 4], fill=WARM)
        d.text((px + 18, py - 40), f"{val:4.1f} घंटे", font=font(28), fill=INK)

    d.text((gx, gy - 56), "दिन की लंबाई कैसे बढ़ती जाएगी (अनुमानित)",
           font=font(30), fill=MUTED)

    chip(im, d, W / 2, 1000, "अगली सदी में जलवायु का नया 'सामान्य' तय होने लगेगा",
         WARM, ll, 2.0)


# --------------------------------------------------------------------------
# scene 8 — outro
# --------------------------------------------------------------------------
def scene_outro(im, d, t, moon):
    ll = t - SCENES[7][0]
    # slow drift-in of the camera (whole-comp move, reference-video style)
    cam = ease_io(ll, 0, 4.0)
    cz = 1.0 + 0.06 * cam

    # twinkling starfield
    rng = random.Random(3)
    for i in range(210):
        x = (rng.uniform(0, W) - W / 2) * cz + W / 2
        y = (rng.uniform(0, H) - H / 2) * cz + H / 2
        b = rng.uniform(.25, 1)
        tw = .55 + .45 * math.sin(t * 2 + i)
        v = int(80 + 150 * b * tw)
        d.ellipse([x, y, x + 2.5, y + 2.5], fill=(v, v, min(255, v + 35)))

    cx, cy = W / 2, 500
    draw_earth(im, cx, cy, r=136 * cz)

    # empty orbit + a ghost trail where the Moon used to be
    rx, ry = 600 * cz, 232 * cz
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=(48, 58, 100), width=2)
    sweep = ease_io(ll, 1.2, 3.6)
    n = 40
    for i in range(int(n * sweep)):
        a = -0.5 + i / n * math.tau * .55
        x, y = cx + rx * math.cos(a), cy + ry * math.sin(a)
        d.ellipse([x - 2.4, y - 2.4, x + 2.4, y + 2.4], fill=(96, 112, 172))
    # ghost moon that slides away and fades
    ga = lerp(-0.5, 0.9, ease_in(ll, .4, 3.2))
    gx, gy = cx + rx * math.cos(ga), cy + ry * math.sin(ga)
    paste_sprite(im, moon, gx, gy, .38 * cz, opacity=clamp(1 - lin(ll, 1.6, 3.4)) * .8)
    if sweep > .6:
        d.text((cx + rx * math.cos(-0.5), cy + ry * math.sin(-0.5) - 52), "ख़ाली कक्षा",
               font=font(27), fill=MUTED, anchor="mm")

    lines = [("चाँद दूर हो जाए, तो दुनिया ख़त्म नहीं होगी।", 792, 44, INK),
             ("पर हमारा हर दिन, हर ज्वार, हर मौसम —", 862, 38, MUTED),
             ("उस एक छोटी-सी चाँदनी पर टिका है।", 922, 38, MUTED)]
    for i, (tx, y, sz, col) in enumerate(lines):
        e = back_out(ll, .7 + i * .28, 1.15 + i * .28)
        if e <= 0:
            continue
        d.text((W / 2, y + (1 - e) * 26), tx, font=font(sz),
               fill=tuple(int(lerp(BG0[j], col[j], clamp(e))) for j in range(3)), anchor="mm")

    # end card + a slow "breathing" CTA, then everything settles
    e = back_out(ll, 2.1, 2.75)
    if e > 0:
        w = 780 * clamp(e)
        rrect(d, [W / 2 - w / 2, 992, W / 2 + w / 2, 1058], 33, fill=(24, 32, 66),
              outline=WARM, width=2)
        d.text((W / 2, 1025), "धन्यवाद — देखते रहिए, सोचते रहिए",
               font=font(32), fill=WARM, anchor="mm")

    # closing shimmer: a thin light sweep across the frame (AE light-sweep trick)
    sw = lin(ll, 2.6, 4.2)
    if sw >= 1:
        sw = lin(ll, 7.4, 9.0)
    if 0 < sw < 1:
        band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        db = ImageDraw.Draw(band)
        px = -500 + (W + 1000) * sw
        db.polygon([(px, 0), (px + 220, 0), (px + 520, H), (px + 300, H)],
                   fill=(255, 240, 200, 16))
        im.paste(Image.alpha_composite(im.convert("RGBA"), band).convert("RGB"), (0, 0))


# --------------------------------------------------------------------------
# post: vignette + film grain (keeps flat vector art from looking sterile)
# --------------------------------------------------------------------------
_VIG = None


def vignette():
    global _VIG
    if _VIG is None:
        v = Image.new("L", (W // 4, H // 4), 0)
        dv = ImageDraw.Draw(v)
        dv.ellipse([-W // 16, -H // 16, W // 4 + W // 16, H // 4 + H // 16], fill=255)
        v = v.filter(ImageFilter.GaussianBlur(46)).resize((W, H), Image.BILINEAR)
        v = v.point(lambda x: 132 + int(x * 123 / 255))   # edges 132, centre 255
        _VIG = v
    return _VIG


# scene table — filled by build_timeline(): (start, end)
SCENES = []
DUR = 61.0


def vo_duration(path):
    import re
    out = subprocess.run([FFMPEG, "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0


VO_FILES = ["vo-01-intro.mp3", "vo-02-day0.mp3", "vo-03-day1.mp3", "vo-04-day30.mp3",
            "vo-05-year1.mp3", "vo-06-decade.mp3", "vo-07-outro.mp3"]
VO_TIMES = []        # (scene_index, start_seconds, file)


def build_timeline():
    """Scene lengths follow the narration so nothing gets cut off mid-sentence."""
    global SCENES, DUR, VO_TIMES
    durs = [max(FPS_SAFE_MIN, vo_duration(os.path.join(AUDIO_DIR, f)) if VOICEOVER else 0)
            for f in VO_FILES]
    if not VOICEOVER:
        durs = [5.2, 7.2, 6.2, 7.8, 8.2, 8.0, 7.4, 11.0]
    # scene 0 = title (no VO), 1..7 = one VO line each
    lengths = [START_PAD + 0.6] + [d + VO_LEAD + VO_TAIL for d in durs]
    # outro keeps its own tail so the end card can breathe
    lengths[-1] = durs[-1] + 1.0 + 2.6
    SCENES = []
    t0 = 0.0
    for L in lengths:
        SCENES.append((t0, t0 + L))
        t0 += L
    DUR = t0
    VO_TIMES = []
    for i, f in enumerate(VO_FILES):
        VO_TIMES.append((i + 1, SCENES[i + 1][0] + VO_LEAD, os.path.join(AUDIO_DIR, f)))
    print(f"timeline: {DUR:.1f}s, {len(SCENES)} scenes")
SCENE_FN = [scene_title, scene_why, scene_snap, scene_day1,
            scene_day30, scene_year1, scene_decade, scene_outro]
XF = 0.30         # dip length either side of a cut, seconds
_SPRITES = {}


def draw_scene(idx, t, moon_sprite):
    im = new_canvas()
    d = ImageDraw.Draw(im)
    SCENE_FN[idx](im, d, t, moon_sprite)
    return im


def frame(i, moon_big):
    t = i / FPS
    idx = 0
    for k, (a, b) in enumerate(SCENES):
        if a <= t < b:
            idx = k
    else:
        if t >= SCENES[-1][1]:
            idx = len(SCENES) - 1
    im = draw_scene(idx, t, moon_big)
    # dip-to-background transition at every cut (clean, no double exposure)
    dip = 0.0
    for (a, b) in SCENES[1:]:
        d2 = abs(t - a)
        if d2 < XF:
            dip = max(dip, 1.0 - d2 / XF)
    if dip > 0.001:
        im = Image.blend(im, Image.new("RGB", (W, H), (5, 8, 20)), smooth(dip) * .92)

    # vignette
    im = Image.composite(im, Image.new("RGB", (W, H), (0, 0, 0)), vignette())

    # subtle grain, only every other frame for speed
    if i % 2 == 0:
        noise = Image.effect_noise((W // 2, H // 2), 14).resize((W, H), Image.BILINEAR)
        im = Image.blend(im, Image.composite(Image.new("RGB", (W, H), (255, 255, 255)),
                                            Image.new("RGB", (W, H), (0, 0, 0)), noise), 0.035)
    return im


def audio_filter():
    """narration clips at fixed scene offsets, mixed over a soft synth pad"""
    inputs, filters, labels = [], [], []
    for n, (scene, at, path) in enumerate(VO_TIMES):
        inputs += ["-i", path]
        filters.append(f"[{n + 1}:a]aresample=48000,adelay={int(at * 1000)}|{int(at * 1000)},"
                       f"volume=1.0[v{n}]")
        labels.append(f"[v{n}]")
    total = DUR
    # gentle pad: two detuned sines + slow tremolo, very low in the mix
    filters.append(
        f"aevalsrc='0.055*sin(2*PI*110*t)+0.035*sin(2*PI*164.81*t)"
        f"+0.028*sin(2*PI*220*t)':s=48000:d={total:.2f}[pad]")
    filters.append("[pad]tremolo=f=0.12:d=0.55,lowpass=f=900,volume=0.9[pad2]")
    labels.append("[pad2]")
    mix = "".join(labels) + f"amix=inputs={len(labels)}:normalize=0:dropout_transition=0[mix]"
    filters.append(mix)
    filters.append("[mix]alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11[aout]")
    return inputs, ";".join(filters)


def main():
    build_timeline()
    NF = int(DUR * FPS)
    only = sys.argv[1] if len(sys.argv) > 1 else None
    moon_big = make_moon(120)
    silent = os.path.join(HERE, "_silent.mp4")
    cmd = [FFMPEG, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-",
           "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for i in range(NF):
            proc.stdin.write(frame(i, moon_big).tobytes())
            if i % 60 == 0:
                print(f"  frame {i}/{NF}  ({i / FPS:5.1f}s)", flush=True)
    finally:
        proc.stdin.close()
        proc.wait()
    print("video encoded ->", silent)

    if not VOICEOVER:
        os.replace(silent, OUT)
        print("done (silent) ->", OUT)
        return

    inputs, af = audio_filter()
    cmd2 = [FFMPEG, "-y", "-loglevel", "error", "-i", silent] + inputs + [
        "-filter_complex", af, "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
        "-movflags", "+faststart", OUT]
    subprocess.run(cmd2, check=True)
    os.remove(silent)
    print("done ->", OUT)


if __name__ == "__main__":
    main()
