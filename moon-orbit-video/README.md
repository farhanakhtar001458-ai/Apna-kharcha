# चाँद अगर पृथ्वी की कक्षा छोड़ दे? — 2D motion graphics

Ek 61-second, 1920×1080 @ 30fps Hindi 2D motion-graphics video, purely code se render hui
(Pillow + ffmpeg). Reference style: Nijat Ibrahimli ka "2D Motion Graphics Delivery
Animation in After Effects" tutorial.

- **Output:** `chand-dur-2d-motion-graphics.mp4` (git-ignored — niche wale command se banao)
- **Analysis + storyboard:** [`VIDEO-ANALYSIS.md`](VIDEO-ANALYSIS.md)
- **Render script:** [`scripts/render.py`](scripts/render.py)

```bash
pip install pillow numpy imageio-ffmpeg
python3 scripts/render.py         # ~2.5 min, writes chand-dur-2d-motion-graphics.mp4
```

Fonts (SIL OFL) `assets/fonts/` mein: Noto Sans Devanagari, Inter.
