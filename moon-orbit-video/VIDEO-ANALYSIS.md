# Reference video ka analysis + naya video

**Reference:** [2D Motion Graphics Delivery Animation in After Effects Tutorials](https://youtu.be/MaHx9A5lDsg) — Nijat Ibrahimli, 28:33, 8K views
**Naya video:** `moon-orbit-video/chand-dur-2d-motion-graphics.mp4` — 61 sec, 1920×1080, 30 fps, Hindi text, 2D motion graphics

---

## 1. Reference video ka breakdown

### Kya hai ye video
Sirf ek tutorial nahi — ye ek **"delivery / online-shopping" 2D explainer animation** ka full
after-effects build hai. Adobe Illustrator mein banaye gaye flat vectors ko After Effects
mein import karke ~12 second ka motion-graphics shot banate hain, phir usko delivery-truck
scene tak extend karte hain.

### Structure (chapters se)
| Time | Kya hota hai |
|---|---|
| 0:00 | Intro + final animation ka preview |
| 0:12–1:03 | Project overview, layers ki organization (vector layers ko pre-comp karna) |
| 1:03–2:19 | Laptop ko center mein laana, scale/position keyframes, camera move |
| 1:45 | **Easing** — har keyframe pe F9 (Easy Ease) + speed graph |
| 2:19–2:59 | Laptop rotation ka overshoot, phir **shadow layer** (soft ellipse) add karna |
| 2:59–5:31 | Mouse ka move + **click feedback** (rotation keyframes, chhota scale bounce) |
| 7:11 | Graph editor mein curve ko smooth karna (timing refine) |
| 7:59–9:54 | Text animation + button scaling pop + **light sweep** effect |
| 11:03–12:57 | Coin/card elements, random stagger se elements ka fall |
| 14:57–16:08 | Scene timing adjust, phir car wala shot |
| 17:06–22:53 | Truck: wheels, body, box, road-line loop |
| 24:52–27:32 | Building background + parallax background animation |
| 27:32 | Final scene assembly, sound/beat pe timing |

### Style ke core rules (jo maine copy kiye)
1. **Flat vector look** — koi realistic texture nahi, solid fills + ek shade darker tone.
2. **Pre-comp / asset-first workflow** — pehle asset banao (car, laptop), phir usko sirf
   scale / position / rotation / opacity se animate karo. Har element ko alag animate nahi karte.
3. **Ease + overshoot** — har move `Easy Ease` se, aur end pe 3–8% overshoot (108% → 100%).
4. **Click / impact = scale bounce pop** — 100 → 112 → 97 → 100.
5. **Soft elliptical shadow** har floating object ke neeche (achanak "flat" se "designed" lagta hai).
6. **Do-tone background** — ek base colour, uske upar ek halka darker band; depth banti hai.
7. **Stagger** — list/card items ek saath nahi, 0.25–0.35 s ke gap se aate hain.
8. **Kinetic type** — text word-by-word rise hota hai, poora block ek saath nahi.
9. **Light sweep** — ek patla chamakta band frame ke upar se guzarta hai (premium feel).
10. **Beat pe timing** — cut aur pop music ke beat pe rakhe jaate hain.

Ye rules maine code mein function bana diye hain: `ease_io()`, `back_out()` (overshoot),
`pop()` (click bounce), `blob_shadow()`, `chip()` (staggered card), `header()` (kicker + title).

---

## 2. Naya video — "चाँद अगर पृथ्वी की कक्षा छोड़ दे?"

**Format:** 1920×1080 · 30 fps · 61 sec · H.264 (YouTube-ready) · Hindi (Devanagari) text
**File:** `moon-orbit-video/chand-dur-2d-motion-graphics.mp4`

### Shot list / storyboard
| # | Time | Scene | Motion |
|---|---|---|---|
| 1 | 0:00–0:05 | **Title** — "चाँद अगर पृथ्वी की कक्षा छोड़ दे?" | Earth orbit mein settle hota hai, chand orbit pe fly-in karta hai, title 7 words mein kinetic rise, subtitle fade |
| 2 | 0:05–0:12 | **भाग 01 · कारण** — chand kyun tika hai? | Orbit ellipse draw hoti hai (dash-by-dash), chand orbit pe ghoomta hai, gravity arrow; 3 reason-cards stagger se aate hain |
| 3 | 0:12–0:18 | **भाग 02 · दिन 0** — ek jhatka, kaksha khatam | 3 red shockwave rings expand, orbit ring snap + fade, chand tangent pe accelerate karke frame se bahar, speed streaks, do captions |
| 4 | 0:18–0:26 | **भाग 03 · दिन 1** | Day-length bars fill hote hain (24h vs ~31h), ghungta clock jiski second-hand dheemi hoti jaati hai, 3 chips |
| 5 | 0:26–0:34 | **भाग 04 · दिन 30** | Earth ka axis 23.5° se 22–32° tak wobble karta hai (live degree readout), sine wobble graph draw hota hai, 3 consequence rows |
| 6 | 0:34–0:42 | **भाग 05 · साल 1** | Sun slide-in, tide rings, "ज्वार की ताक़त" counter 72% → 40% drop, 3 stability cards |
| 7 | 0:42–0:50 | **भाग 06 · दसक से सदी** | Timeline markers, day-length curve 24h → 30.7h (exponential, live dot + label) |
| 8 | 0:50–1:01 | **Outro** | Starfield, earth with empty orbit + ghost moon jo fade hota hai, 3-line payoff, end-card, light sweep |

### Science jo script mein use hui
- Chand ki orbital speed ~**1.02 km/s** — agar gravity bandhan hat jaye to wo isi speed se
  tangent pe seedha nikal jayega (Newton's cannonball logic).
- Din lamba hona: Moon ki tidal braking ~**1.8 ms/din per century**; chand ke bina ye
  braking ruk jaati hai aur Earth ka rotation mainly Sun ki tidal braking pe chalta hai —
  isliye din bahut dheere badhta hai, isliye video "~31 hours over billions of years"
  ko clearly **"4 arab saal bahut lamba waqt hai"** kehkar qualify karta hai.
- **Jwar-bhata**: Moon ~2/3 tidal force deta hai, Sun ~1/3 — chand ke jaane se amplitude
  ~**40–50%** tak gir jaata hai.
- **Axis stability**: Moon Earth ke axial tilt (23.5°) ko stabilise karta hai; uske bina
  tilt lakhon saal mein kaafi range mein wander karega → mausam ka pattern badlega.
- Jo cheez **nahi** hoti: Earth orbit se nahi udti, seasons khatam nahi hote, life turant
  khatam nahi hoti — video yehi "reassuring" message deta hai.

---

## 3. Video kaise banaya gaya (reproducible)

```bash
pip install pillow numpy imageio-ffmpeg
python3 moon-orbit-video/scripts/render.py
```

- Sab kuch **code se draw** hota hai (Pillow), koi stock footage/licensed font-asset nahi.
- Har frame 1920×1080 par draw → raw RGB pipe → **ffmpeg/libx264** (CRF 18, yuv420p,
  faststart) se encode. Render time ~2.5 min.
- Fonts: **Noto Sans Devanagari** + **Inter** (SIL OFL), `assets/fonts/` mein rakhe hain —
  Hindi shaping ke liye glyphs already correct niklate hain.
- Post: subtle vignette + 3.5% film grain (flat vector art ko sterile hone se bachata hai).
- Scene cuts pe 0.3 s ka **dip-to-background** (clean transition, double exposure nahi).

### Kya easily badla ja sakta hai
| Chahiye | Kahan |
|---|---|
| Duration / fps / resolution | `W, H, FPS, DUR` (file ke top pe) |
| Colours | `BG0…VIOLET` palette block |
| Koi bhi Hindi line | us scene function ka `d.text(...)` |
| Music add karna | `ffmpeg -i video.mp4 -i track.mp3 -c:v copy -c:a aac -shortest out.mp4` |
| Vertical (Reels/Shorts) | `W, H = 1080, 1920`, phir layouts ko center-stack karna padega |
| Naya scene | `SCENES` list + `SCENE_FN` mein ek `scene_*(im, d, t, moon)` add karo |

> Note: file `moon-orbit-video/` folder mein hai. 19 MB MP4 repo mein commit nahi kiya
> gaya (build artifact) — render script chalate hi same video regenerate ho jaata hai.
