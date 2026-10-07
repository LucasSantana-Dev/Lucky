"""Render Lucky's brand banners to exact-size PNG (+ WebP) with headless Chrome.

Wordmark roles (see ../BRANDING_GUIDE.md): Assinatura = Neonderthaw (hero/social),
Letreiro = Monoton (Discord profile banner), Conservadora = Bungee (labels).
Body copy uses Manrope. Fonts load from Google Fonts, so this needs network.

Run: python3 packages/frontend/branding/source/banners.py   (needs Pillow >= 12.1 + Chrome/Brave;
     set CHROME=/path/to/binary to override). Run cat_cutout.py first if the cat changed.
"""
import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CAT = (HERE / "cat-neon.png").as_uri()

NIGHT, V300, V400, GOLD = "#190428", "#E3A6FA", "#CF7CF6", "#F6C85F"
GLOW = "0 0 2px #fff,0 0 10px #CF7CF6,0 0 24px #B84DF0,0 0 52px #8f2fd0"
TAG = "The Discord music bot that learns your server’s taste and keeps the call playing."
FONTS = ("https://fonts.googleapis.com/css2?family=Neonderthaw&family=Monoton&family=Bungee"
         "&family=Manrope:wght@600&display=block")

# name -> (width, height, layout, outputs relative to repo root)
BANNERS = {
    "social-preview": (1280, 640, "hero", ["assets/lucky-social-preview.png", "assets/lucky-social-preview.webp"]),
    "og-image": (1200, 630, "hero", ["packages/frontend/public/og-image.png"]),
    # Discord profile banner, 2x of 680x240.
    "discord-profile-banner": (1360, 480, "profile", ["assets/lucky-bot-banner.png", "assets/lucky-bot-banner.webp"]),
}


def page(w: int, h: int, body: str) -> str:
    return f'''<!doctype html><html><head><meta charset=utf-8><link href="{FONTS}" rel=stylesheet>
<style>html,body{{margin:0;width:{w}px;height:{h}px;overflow:hidden;background:{NIGHT}}}
.eyebrow{{font-family:Bungee;color:{GOLD};letter-spacing:.08em}}.body{{font-family:Manrope;font-weight:600;color:{V300}}}</style></head>
<body><div style="position:relative;width:{w}px;height:{h}px">{body}</div></body></html>'''


def hero(w: int, h: int) -> str:
    s = h / 640  # designed at 1280x640, scales with height
    cat, cx, cy = 470 * s, 300 * s, h / 2
    return page(w, h, f'''
<div style="position:absolute;left:{cx-330*s}px;top:{cy-330*s}px;width:{660*s}px;height:{660*s}px;
  background:radial-gradient(circle,rgba(184,77,240,.20) 0%,rgba(184,77,240,.06) 45%,rgba(25,4,40,0) 70%)"></div>
<img src="{CAT}" style="position:absolute;left:{cx-cat/2}px;top:{cy-cat/2}px;width:{cat}px;height:{cat}px">
<div style="position:absolute;left:{560*s}px;top:0;height:{h}px;display:flex;flex-direction:column;justify-content:center">
  <div class=eyebrow style="font-size:{17*s}px">VERIFIED DISCORD BOT · OPEN SOURCE · FREE</div>
  <div style="font-family:Neonderthaw;font-size:{186*s}px;line-height:1.05;color:#FFF5FF;text-shadow:{GLOW};margin:{6*s}px 0 {40*s}px -{6*s}px">Lucky</div>
  <div class=body style="font-size:{27*s}px;line-height:1.4;max-width:{600*s}px">{TAG}</div>
  <div class=eyebrow style="font-size:{15*s}px;color:{V400};margin-top:{34*s}px">LUCKY.LUCASSANTANA.TECH</div>
</div>''')


def profile(w: int, h: int) -> str:
    # Discord draws the avatar over the bottom-left: keep x<26% empty.
    return page(w, h, f'''
<div style="position:absolute;left:{w*0.30}px;top:-{h*0.4}px;width:{w*0.62}px;height:{h*1.8}px;
  background:radial-gradient(ellipse,rgba(184,77,240,.18) 0%,rgba(25,4,40,0) 62%)"></div>
<div style="position:absolute;left:{w*0.26}px;right:{w*0.04}px;top:0;height:{h}px;display:flex;flex-direction:column;align-items:center;justify-content:center">
  <div style="font-family:Monoton;font-size:{h*0.34}px;line-height:1;color:#FFF5FF;text-shadow:{GLOW};letter-spacing:.03em">LUCKY</div>
  <div class=eyebrow style="font-size:{h*0.058}px;margin-top:{h*0.07}px">MUSIC · AUTOPLAY · DASHBOARD</div>
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
  const faces = ['16px "Neonderthaw"', '16px "Monoton"', '16px "Bungee"', '600 16px "Manrope"'];
  const loaded = await Promise.all(faces.map(f => document.fonts.load(f).then(r => r.length > 0, () => false)));
  if (!loaded.every(Boolean)) document.documentElement.style.background = document.body.style.background = '#ff00ff';
});</script>"""
MIN_NEON = 0.01  # share of bright pixels (cat + wordmark); a blank render has ~0


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
    if im.getpixel((1, 1)) == (255, 0, 255):
        raise SystemExit(f"{name}: a brand font did not load (Google Fonts unreachable?)")
    bright = sum(1 for p in im.get_flattened_data() if max(p) > 200) / (w * h)
    if bright < MIN_NEON:
        raise SystemExit(f"{name}: looks blank ({bright:.2%} bright pixels, need {MIN_NEON:.0%})")
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
