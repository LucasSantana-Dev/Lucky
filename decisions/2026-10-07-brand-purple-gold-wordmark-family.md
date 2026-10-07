# Brand identity: purple and gold neon, one cat, three wordmarks by use

- **Date:** 2026-10-07
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Scope:** Marketing and identity assets (`assets/`, `packages/frontend/public/og-image.png`,
  `packages/frontend/branding/`). The dashboard UI tokens are out of scope.
- **Amends:** the "removed gold family" line of `packages/frontend/branding/BRANDING_GUIDE.md`
  for brand assets, and the "not another generation attempt" line of the FINAL DECISION in
  `decisions/2026-07-12-brand-asset-regen-tooling.md`: on 2026-10-07 the owner approved one more
  image-model pass fed the original cat, anchored on owner-supplied references. Its "keep the
  original mascot" still holds until that pass is approved.

## Context

The owner asked to improve the visual identity: "the lucky cat in purple and gold neon is
the right direction and matches what we have, but it lacks consistency and identity". The
audit found four wordmarks in use (`lucky.`, a purple-to-gold gradient `Lucky`, a glowing
white `Lucky`, a spaced `LUCKY` in Inter), two cat variants (pink outline in the avatar and
favicon, purple outline in `lucky-banner.png`), banners in the old palette, and orphan purple
hexagon SVGs (`assets/lucky-logo.svg`, `public/favicon.svg`).

Three agent-drawn SVG evolutions of the cat were rejected ("basic, lost the original
aesthetic"), the fourth time a redraw of the cat has failed (three paths failed in July).

## Decision

- **The cat is the original neon cat from `assets/lucky-banner.png` (purple outline, gold
  details)**, cut out with a max-channel brightness mask (alpha only, colours untouched), never
  redrawn. A refined cat may come later from an image model fed the original as a reference
  (or a human illustrator), not from agent SVG.
- **Brand palette (sampled from the cat):** Violet 300 `#E3A6FA`, 400 `#CF7CF6`, 500
  `#B84DF0`, 700 `#6E1A9E`; Gold 400 `#F6C85F`, 600 `#C9922E`, 800 `#8A5F12` (text on light);
  Night `#190428`; Neon white
  `#FFF5FF`.
- **Wordmark family by use**, all Google Fonts under the OFL:
  Assinatura = Neonderthaw (hero, social, 64 px and up);
  Letreiro = Monoton (banners, thumbnails, 26 px and up);
  Conservadora = Bungee (UI, docs, small sizes, light backgrounds).
- Banners and the og-image are rendered from `packages/frontend/branding/source/banners.py`,
  so swapping the cat is one file plus one command.

## Consequences

- The UI still uses the pink accent (`decisions/2026-10-01-blurple-focus-only.md`). Moving the
  dashboard to purple and gold is a separate owner decision.
- The neon cat stays unreadable at 16 to 24 px (favicon, small avatar). That waits for the
  refined cat and a dedicated small-size cut.
- Avatar and profile banner are changed by the owner in the Discord Developer Portal.

## Revisit when

The refined cat is approved (rerun `cat_cutout.py` and `banners.py` on it), or the UI
palette question is decided.
