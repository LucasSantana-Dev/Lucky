"""Cut the neon cat out of assets/lucky-banner.png and build the bot avatar.

The cat is never redrawn: alpha comes from luminance only, so every original
colour and glow survives (see decisions/2026-07-12-brand-asset-regen-tooling.md).
Writes, next to this file:
  cat-neon.png     640x640 transparent cat, for dark backgrounds only
  avatar-1024.png  1024x1024 Discord avatar (cat on Night #190428)

Run: python3 packages/frontend/branding/source/cat_cutout.py   (needs Pillow >= 12.1)
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
SRC = ROOT / "assets" / "lucky-banner.png"
BOX = (90, 200, 730, 840)  # square crop with margin around the cat
NIGHT = (25, 4, 40, 255)
RAMP = 45  # luminance range over which alpha goes 0 -> 255
FEATHER = 48  # px faded at the crop border so no tile edge shows


def cutout() -> Image.Image:
    im = Image.open(SRC).convert("RGB").crop(BOX)
    w, h = im.size
    # Noise floor = median brightness of the crop border (the banner background).
    border = sorted(
        max(im.getpixel((x, y)))
        for x in range(w)
        for y in range(h)
        if min(x, y, w - 1 - x, h - 1 - y) < 12
    )
    t0 = border[len(border) // 2]
    out = []
    for i, p in enumerate(im.get_flattened_data()):
        x, y = i % w, i // w
        lum = max(p)
        a = 0.0 if lum <= t0 else 255.0 if lum >= t0 + RAMP else (lum - t0) * 255 / RAMP
        d = min(x, y, w - 1 - x, h - 1 - y)
        if d < FEATHER:
            a *= (d / FEATHER) ** 2
        out.append(p + (int(a),))
    cat = Image.new("RGBA", (w, h))
    cat.putdata(out)
    return cat


def avatar(cat: Image.Image, size: int = 1024) -> Image.Image:
    bg = Image.new("RGBA", (size, size), NIGHT)
    s = int(size * 0.98)
    bg.alpha_composite(cat.resize((s, s), Image.LANCZOS), ((size - s) // 2, (size - s) // 2 + size // 100))
    return bg.convert("RGB")


if __name__ == "__main__":
    cat = cutout()
    cat.save(HERE / "cat-neon.png", optimize=True)
    avatar(cat).save(HERE / "avatar-1024.png", optimize=True)
    print("wrote cat-neon.png, avatar-1024.png")
