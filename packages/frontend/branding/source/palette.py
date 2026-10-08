"""Single source for the Lucky brand palette (see ../BRANDING_GUIDE.md). Hex strings plus rgb()."""

PURPLE = "#52387B"  # Edo purple
INK = "#211D2E"
VERMILION = "#B83A24"
GOLD = "#C9922E"
CREAM = "#F3E6CB"  # paper


def rgb(hex_colour: str, alpha: int = 255) -> tuple:
    """'#RRGGBB' -> (r, g, b, alpha)."""
    h = hex_colour.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha)
