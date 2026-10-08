# Lucky design

The full brand language (cat, lockups, wordmark, banners) lives in
`packages/frontend/branding/BRANDING_GUIDE.md`; the decision is
`decisions/2026-10-07-brand-retro-maneki-edo-purple.md`; the diagnosis and owner picks are in
`docs/design/identity-brief.md`. This file is the short contract every surface builds against.

## Identity

- **Source:** the owner's picks on 2026-10-07 from a board of human-made maneki-neko work
  (Rick Calzi, Zellene Guanlao, Jesslin Lee), after rejecting the neon system as "generic AI".
- **Theme:** flat retro Japanese print maneki-neko.
- **Genre reference (form only):** mid-century Japanese screen-print and matchbox labels: two
  or three spot inks on cream paper, one thick ink line.
- **Exclusions:** neon, glow, gradients, sparkles, drop shadows, 3D, glassmorphism, red-and-gold
  as the signature, agent-drawn SVG cats, retyping the wordmark in a font.
- **Signature family:** the winking cat (ink-oval open eye), the Edo purple sun disc, the custom
  LUCKY lettering, the katakana ラッキー.

## Tokens

Surfaces use only these. Contrast is against Cream unless noted.

| Token       | HEX       | Use                                                    |
| ----------- | --------- | ------------------------------------------------------ |
| Edo purple  | `#52387B` | signature: sun disc, dark field, katakana, links (7.7) |
| Ink         | `#211D2E` | outlines, wordmark and text on light (13.3)            |
| Vermilion   | `#B83A24` | small accents, eyebrows; never large fields (4.6)      |
| Gold        | `#C9922E` | koban and decoration only; never text (2.2)            |
| Cream paper | `#F3E6CB` | light background; text on Edo purple (7.7 there)       |

Type: the LUCKY wordmark is `branding/source/wordmark.svg` (never a font). Dela Gothic One for
eyebrows, numbers, URLs and ラッキー; Manrope 600 for body.

Shapes: square ink frames and full circles (the sun disc); flat fills; one ink stroke weight per
piece. No rounded-rectangle cards with soft shadows.

## Surfaces

| Surface                                             | Status                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Banners, social preview, og-image, avatar, app icon | built by `cat_cutout.py` and `banners.py`                         |
| Weekly recap card (`packages/render`)               | to redraw in this language before 2026-10-11 18:00 UTC            |
| Dashboard UI                                        | keeps its own palette until the owner decides (accent still pink) |
