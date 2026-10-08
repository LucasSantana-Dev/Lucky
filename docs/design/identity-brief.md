# Lucky identity brief

Status on 2026-10-07: direction chosen by the owner, language not yet written down.

## Owner's diagnosis

- On the purple and gold neon system shipped in #2689: "still looks very generic AI" (the
  neon glow, the cat drawing, the composition and the colours).
- On the agent-drawn and neon cats before it: rejected four times; the next round was anchored
  on real references instead of more process.
- Picked from a board of 12 human-made maneki-neko pieces: Rick Calzi (flat retro cat on a sun),
  Zellene Guanlao (retro print with large 招き猫 kanji), Jesslin Lee (mascot plus wordmark).
- Picked lockup A (Edo purple sun on cream) over B (purple field, cream disc).
- On the open eye of the winking cat: "olho muito humano" (too human). Picked fix 1, the solid
  ink oval, over 2, the gold slit pupil (2026-10-07).
- On the weekly recap card still in neon: redraw it in the retro language before the first
  Sunday post (2026-10-11 18:00 UTC) (2026-10-07).

## Theme

Flat retro Japanese print maneki-neko. Genre reference for form: mid-century Japanese
screen-print and matchbox labels (two or three spot inks, one thick ink line, paper texture).

Exclusions: neon, glow, gradients, sparkles, 3D, glassmorphism, red-and-gold as the signature
(the category default), agent-drawn SVG cats, stock rounded fonts for the wordmark.

## Official artifacts (branch `feature/brand-retro-maneki`)

| Artifact                                 | Path                                                     | sha256 (12)  |
| ---------------------------------------- | -------------------------------------------------------- | ------------ |
| Cat source (Gemini, ~1000 px capture)    | `packages/frontend/branding/source/cat-wink-src.png`     | c107d371fd9a |
| Cat cutout                               | `packages/frontend/branding/source/cat.png`              | bba30faf14f4 |
| Wordmark (potrace of approved lettering) | `packages/frontend/branding/source/wordmark.svg`         | 1a74e15863c1 |
| Discord avatar                           | `packages/frontend/branding/source/avatar-1024.png`      | dd800be30328 |
| App icon / favicon                       | `packages/frontend/public/lucky-logo.png`, `favicon.png` | 28f73b38363c |
| Social preview                           | `packages/frontend/public/og-image.png`                  | 557434d8d029 |
| Bot banner                               | `assets/lucky-bot-banner.png`                            | 7abe108dd94e |
| ADR (accepted)                           | `decisions/2026-10-07-brand-retro-maneki-edo-purple.md`  | 6fdad5d7075f |

Tokens in the draft ADR: Edo purple `#52387B`, Ink `#211D2E`, Vermilion `#B83A24`,
Gold `#C9922E`, Cream `#F3E6CB`. Type: custom LUCKY wordmark, Dela Gothic One (eyebrows,
ラッキー), Manrope 600 (body).

## Surfaces already shipped in the superseded language

- **Weekly recap card** (`packages/render`, live since v2.53.0): Neonderthaw wordmark with an SVG
  glow, Bungee numbers, neon palette. Conflicts with the exclusions above; the owner chose to
  redraw it in the new language before its first Sunday post (2026-10-11 18:00 UTC).
- **Dashboard UI accent:** still pink; the draft ADR leaves it out of scope pending the owner.
- **#2695** (seigaiha neon pattern): superseded by the draft ADR.

## Open

- Full-resolution cat download (owner action) before any print use.
- Avatar and banner upload in the Discord Developer Portal (owner action).
