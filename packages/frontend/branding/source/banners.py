"""Render Lucky's brand banners to exact-size PNG (+ WebP) with headless Chrome.

Identity (see ../BRANDING_GUIDE.md): flat retro Japanese print. Cream paper, Edo purple sun
disc, the winking maneki-neko (`cat.png`, from cat_cutout.py) and the custom LUCKY lettering
(`wordmark.svg`). Supporting type: Dela Gothic One (eyebrows, katakana), Manrope (body copy).
Fonts load from Google Fonts, so this needs network.

Run: python3 packages/frontend/branding/source/banners.py   (needs Pillow >= 12.1 + Chrome/Brave;
     set CHROME=/path/to/binary to override). Run cat_cutout.py first if the cat changed.
"""
import os
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import quote

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CAT = (HERE / "cat.png").as_uri()
WORDMARK = (HERE / "wordmark.svg").read_text(encoding="utf-8")

CREAM, PURPLE, INK, VERMILION = "#F3E6CB", "#52387B", "#211D2E", "#B83A24"
TAG = "The Discord music bot that learns your server’s taste and keeps the call playing."
FONTS = "https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Manrope:wght@600&display=block"

# name -> (width, height, layout, outputs relative to repo root)
BANNERS = {
    "social-preview": (1280, 640, "hero", ["assets/lucky-social-preview.png", "assets/lucky-social-preview.webp"]),
    "og-image": (1200, 630, "hero", ["packages/frontend/public/og-image.png"]),
    # Discord profile banner, 2x of 680x240.
    "discord-profile-banner": (1360, 480, "profile", ["assets/lucky-bot-banner.png", "assets/lucky-bot-banner.webp"]),
}


def wordmark(height: float, colour: str) -> str:
    svg = WORDMARK.replace(f'fill="{INK}"', f'fill="{colour}"')
    return f'<img alt="Lucky" src="data:image/svg+xml;utf8,{quote(svg)}" style="height:{height}px;display:block">'


def page(w: int, h: int, bg: str, body: str) -> str:
    return f'''<!doctype html><html><head><meta charset=utf-8><link href="{FONTS}" rel=stylesheet>
<style>html,body{{margin:0;width:{w}px;height:{h}px;overflow:hidden;background:{bg}}}
.dela{{font-family:"Dela Gothic One";letter-spacing:.06em}}.body{{font-family:Manrope;font-weight:600;color:{INK}}}</style></head>
<body><div style="position:relative;width:{w}px;height:{h}px">{body}</div></body></html>'''


def mark(cx: float, cy: float, box: float) -> str:
    """Version A: ink frame, Edo purple sun disc, cat seated on the frame's bottom line."""
    stroke, d, cat_h = box * 0.014, box * 0.74, box * 0.78
    cat_w = cat_h * 468 / 595  # cat.png aspect
    top = cy - box / 2
    return f'''
<div style="position:absolute;left:{cx-box/2}px;top:{top}px;width:{box}px;height:{box}px;box-sizing:border-box;border:{stroke}px solid {INK}"></div>
<div style="position:absolute;left:{cx-d/2}px;top:{cy-d/2-box*0.06}px;width:{d}px;height:{d}px;border-radius:50%;background:{PURPLE}"></div>
<img src="{CAT}" style="position:absolute;left:{cx-cat_w/2+box*0.03}px;top:{top+box-cat_h-box*0.03}px;height:{cat_h}px">'''


def hero(w: int, h: int) -> str:
    s = h / 640  # designed at 1280x640, scales with height
    return page(w, h, CREAM, mark(300 * s, h / 2 + 18 * s, 400 * s) + f'''
<div style="position:absolute;left:{580*s}px;top:0;height:{h}px;display:flex;flex-direction:column;justify-content:center">
  <div class=dela style="font-size:{17*s}px;color:{VERMILION}">VERIFIED DISCORD BOT · OPEN SOURCE · FREE</div>
  <div style="margin:{22*s}px 0 {6*s}px -{6*s}px">{wordmark(132 * s, INK)}</div>
  <div class=dela style="font-size:{30*s}px;color:{PURPLE};letter-spacing:.32em;margin-bottom:{28*s}px">ラッキー</div>
  <div class=body style="font-size:{26*s}px;line-height:1.4;max-width:{580*s}px">{TAG}</div>
  <div class=dela style="font-size:{15*s}px;color:{PURPLE};margin-top:{30*s}px">LUCKY.LUCASSANTANA.TECH</div>
</div>''')


def profile(w: int, h: int) -> str:
    # Discord draws the avatar over the bottom-left: keep x<26% empty.
    return page(w, h, PURPLE, f'''
<div style="position:absolute;left:{w*0.26}px;right:{w*0.04}px;top:0;height:{h}px;display:flex;flex-direction:column;align-items:center;justify-content:center">
  {wordmark(h * 0.30, CREAM)}
  <div class=dela style="font-size:{h*0.056}px;color:{CREAM};margin-top:{h*0.08}px">ラッキー · MUSIC · AUTOPLAY · DASHBOARD</div>
</div>''')


def chrome() -> str:
    for c in (os.environ.get("CHROME"),
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
              "/usr/bin/google-chrome", "/usr/bin/chromium"):
        if c and Path(c).exists():
            return c
    raise SystemExit("No Chrome/Brave found; set CHROME=/path/to/binary")


# Paints the page magenta if any brand font failed to load, so the check below rejects it.
FONT_GUARD = """<script>window.addEventListener('load', async () => {
  const faces = ['16px "Dela Gothic One"', '600 16px "Manrope"'];
  const loaded = await Promise.all(faces.map(f => document.fonts.load(f).then(r => r.length > 0, () => false)));
  if (!loaded.every(Boolean)) document.documentElement.style.background = document.body.style.background = '#ff00ff';
});</script>"""
MIN_INK = 0.04  # share of pixels that differ from the background; a blank render has ~0


def render(name: str, w: int, h: int, layout: str, browser: str, tmp: Path) -> Image.Image:
    html = tmp / f"{name}.html"
    page_html = hero(w, h) if layout == "hero" else profile(w, h)
    html.write_text(page_html.replace("</body>", FONT_GUARD + "</body>"), encoding="utf-8")
    shot = tmp / f"{name}.png"
    subprocess.run([browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", "--virtual-time-budget=15000",
                    f"--window-size={w},{h}", f"--screenshot={shot}", html.as_uri()],
                   check=True, capture_output=True, timeout=120)
    im = Image.open(shot).convert("RGB")
    if im.size != (w, h):
        raise SystemExit(f"{name}: got {im.size}, expected {(w, h)}")
    bg = im.getpixel((1, 1))
    if bg == (255, 0, 255):
        raise SystemExit(f"{name}: a brand font did not load (Google Fonts unreachable?)")
    ink = sum(1 for p in im.get_flattened_data() if sum(abs(a - b) for a, b in zip(p, bg)) > 60) / (w * h)
    if ink < MIN_INK:
        raise SystemExit(f"{name}: looks blank ({ink:.2%} non-background pixels, need {MIN_INK:.0%})")
    return im


def save(im: Image.Image, outputs: list[str]) -> None:
    for rel in outputs:
        dest = ROOT / rel
        if dest.suffix == ".webp":
            im.save(dest, "WEBP", quality=88, method=6)
        else:
            im.save(dest, "PNG", optimize=True)
        print("wrote", rel)


if __name__ == "__main__":
    browser = chrome()
    with tempfile.TemporaryDirectory() as t:
        # Render and check everything first; shipped files are only touched if all pass.
        done = [(render(n, w, h, layout, browser, Path(t)), outs) for n, (w, h, layout, outs) in BANNERS.items()]
    for im, outs in done:
        save(im, outs)
