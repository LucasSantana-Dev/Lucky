"""Cut the winking maneki-neko out of its source art and build the bot avatar and app icons.

The cat is never redrawn: `cat-wink-src.png` (image model, cream background) is cut with a
flood fill from the corners, which stops at the thick ink outline, so every original pixel
inside the cat survives (see decisions/2026-10-07-brand-retro-maneki-edo-purple.md).
Writes, next to this file unless noted:
  cat.png          transparent cat (any background)
  avatar-1024.png  Discord avatar: cat on a cream sun disc over Edo purple
  ../../public/lucky-logo.png, ../../public/favicon.png  256 px app icon (head in a purple disc)

Run: python3 packages/frontend/branding/source/cat_cutout.py   (needs Pillow >= 12.1)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[1] / "public"
SRC = HERE / "cat-wink-src.png"
INSET = 60  # source is a browser capture with dark rounded corners; drop them
BG_TOL = 40  # flood fill tolerance against the cream background
PAD = 8
# Open-eye retouch, in source pixels: area to cover, new eye centre and radii.
EYE_PATCH = (444, 362, 526, 420)
EYE_CENTRE = (484, 391)
EYE_RADII = (15, 18)
FACE = (244, 227, 194, 255)

PURPLE = (82, 56, 123, 255)  # Edo purple #52387B
CREAM = (243, 230, 203, 255)  # paper #F3E6CB
INK = (33, 29, 46, 255)  # #211D2E


def open_eye(im: Image.Image) -> Image.Image:
    """The model drew the open eye as a human almond (lid line, highlight); the owner wants a cat.
    Cover it with face colour (feathered alpha) and stamp a solid ink oval, like a vintage toy."""
    s = 4
    w, h = EYE_PATCH[2] - EYE_PATCH[0], EYE_PATCH[3] - EYE_PATCH[1]
    alpha = Image.new("L", (w * s, h * s))
    ImageDraw.Draw(alpha).ellipse((0, 0, w * s - 1, h * s - 1), fill=255)
    patch = Image.new("RGBA", (w * s, h * s), FACE)
    patch.putalpha(alpha.filter(ImageFilter.GaussianBlur(s * 1.5)))
    cx, cy = (EYE_CENTRE[0] - EYE_PATCH[0]) * s, (EYE_CENTRE[1] - EYE_PATCH[1]) * s
    rx, ry = EYE_RADII[0] * s, EYE_RADII[1] * s
    ImageDraw.Draw(patch).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=INK)
    patch = patch.resize((w, h), Image.LANCZOS)
    out = im.copy()
    out.paste(patch, EYE_PATCH[:2], patch)
    return out


def cutout() -> Image.Image:
    im = open_eye(Image.open(SRC).convert("RGB"))
    im = im.crop((INSET, INSET, im.width - INSET, im.height - INSET))
    probe = im.copy()
    for seed in ((0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)):
        ImageDraw.floodfill(probe, seed, (255, 0, 255), thresh=BG_TOL)
    alpha = Image.new("L", im.size)
    alpha.putdata([0 if p == (255, 0, 255) else 255 for p in probe.get_flattened_data()])
    cat = im.convert("RGBA")
    cat.putalpha(alpha)
    l, t, r, b = alpha.getbbox()
    return cat.crop((l - PAD, t - PAD, r + PAD, b + PAD))


def fit(cat: Image.Image, height: int) -> Image.Image:
    return cat.resize((round(cat.width * height / cat.height), height), Image.LANCZOS)


def disc(size: int, d: int, colour: tuple) -> Image.Image:
    """Transparent canvas with a centred filled circle of diameter d (4x supersampled)."""
    big = Image.new("RGBA", (size * 4, size * 4))
    o = (size - d) * 2
    ImageDraw.Draw(big).ellipse((o, o, o + d * 4, o + d * 4), fill=colour)
    return big.resize((size, size), Image.LANCZOS)


def avatar(cat: Image.Image, size: int = 1024) -> Image.Image:
    """Version B: Edo purple field, cream sun disc, cat standing on the disc's lower half.
    Discord crops the avatar to a circle, so everything stays inside it."""
    bg = Image.new("RGBA", (size, size), PURPLE)
    bg.alpha_composite(disc(size, int(size * 0.74), CREAM))
    c = fit(cat, int(size * 0.66))
    bg.alpha_composite(c, ((size - c.width) // 2, int(size * 0.20)))
    return bg.convert("RGB")


def icon(cat: Image.Image, size: int = 256) -> Image.Image:
    """Small-size cut: the cat's head peeks into a purple disc, body clipped by the disc edge,
    so the face, ears and wink stay legible at 16-32 px."""
    canvas = Image.new("RGBA", (size, size))
    canvas.alpha_composite(disc(size, size, INK))
    canvas.alpha_composite(disc(size, size - max(4, size // 24) * 2, PURPLE))
    c = fit(cat, int(size * 1.30))
    layer = Image.new("RGBA", (size, size))
    # The head sits left of the body's centre (the raised paw is on the right).
    layer.alpha_composite(c, ((size - c.width) // 2 + int(c.width * 0.07), int(size * 0.13)))
    mask = disc(size, size - max(4, size // 24) * 2, (0, 0, 0, 255)).getchannel("A")
    canvas.paste(layer, (0, 0), Image.composite(layer.getchannel("A"), Image.new("L", (size, size)), mask))
    return canvas


if __name__ == "__main__":
    cat = cutout()
    cat.save(HERE / "cat.png", optimize=True)
    avatar(cat).save(HERE / "avatar-1024.png", optimize=True)
    ico = icon(cat, 1024).resize((256, 256), Image.LANCZOS)
    for name in ("lucky-logo", "favicon"):
        ico.save(PUBLIC / f"{name}.png", optimize=True)
        ico.save(PUBLIC / f"{name}.webp", "WEBP", quality=90, method=6)
    print("wrote cat.png, avatar-1024.png, public/{lucky-logo,favicon}.{png,webp}")
