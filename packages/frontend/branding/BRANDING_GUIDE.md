# Lucky Branding Guide

## Brand Name

- Primary product name: `Lucky`
- Dashboard: `Lucky Dashboard`

## Logo Source

- Frontend runtime asset: `packages/frontend/public/lucky-logo.png`
- Favicon: `packages/frontend/public/favicon.png`

## Logo Usage

- Minimum display size:
    - Sidebar: `32x32`
    - Login hero: `48x48`
- Clear space: Keep at least `0.25x` logo width padding from surrounding elements.
- Allowed backgrounds: Dark neutral surfaces.
- Avoid: Stretching, recoloring, glow backdrops, or gradient overlays behind the logo.

## Color System

**Dual accent** (resolved 2026-04-21, see `docs/decisions/2026-04-21-redesign-port-target.md`):
- **Primary** (CTAs, active nav, focus rings): Discord Blurple `#5865f2`, hover `#4752c4`.
- **Secondary** (live pings, highlights, gradient accents): Neon Pink `#ec4899`.

Removed gold family (`#d4a017`, etc.) and old purple (`#8b5cf6`, etc.) — not part of the brand palette.

| Purpose | Color |
|---|---|
| Primary accent / CTAs | `#5865f2` (blurple) |
| Primary hover | `#4752c4` (blurple-strong) |
| Secondary accent | `#ec4899` (neon pink) |
| Landing gradient end | `#fb923c` (neon orange — landing only) |
| Success | `#23a55a` |
| Error | `#f23f42` |
| Warning | `#f0b232` |
| Page background (canvas) | `#0f1117` |
| Sidebar | `#161b22` |
| Panel | `#1c2129` |
| Elevated | `#222831` |
| Highlight (active) | `#2a3140` |

## Typography

- **Display font**: `Sora` — used for all headings (`h1`–`h4`, `type-display`, `type-title`).
- **Body font**: `Manrope` — used for body copy, UI labels, controls.
- **Mono font**: `JetBrains Mono` — used for command snippets, IDs, case numbers, technical metadata.

## Typography Rules

- Keep body text at `14–15px` for dashboard readability.
- Use sentence case for labels; avoid all-caps except for `type-meta` eyebrows (0.07em tracking).
- No extreme letter-spacing or display-style tracking in UI text.
- Headings use Sora with moderate negative tracking (`-0.01em` to `-0.02em`).
- Mono eyebrows (`text-[10px] font-mono uppercase tracking-widest`) are the redesign's operational-console pattern — use for section/status labels.

## Voice and Copy

- Keep messaging direct and operational — clear action labels, minimal marketing language in admin screens.
- No "Neo-editorial command center" or AI-aesthetic taglines.
- No Sparkles icons used decoratively.

## Visual Style

- Flat panels: no glassmorphism, no radial gradients on page backgrounds, no shimmer/glow effects.
- Borders use `--lucky-border-soft` by default, upgrade to `--lucky-border-strong` on hover.
- Motion: only fade transitions (`fade-up`, `fade-in`). No floating, glowing, or pulsing effects.
- Icons in colored contexts use blurple, success green, warning amber, or error red as appropriate.
