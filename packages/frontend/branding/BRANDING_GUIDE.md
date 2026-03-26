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

**Single accent**: Discord Blurple `#5865f2` and its strong variant `#4752c4`.

No gold accent. No purple gradient backgrounds. The old purple family (`#8b5cf6`, etc.) and gold family (`#d4a017`, etc.) are no longer part of the brand palette.

| Purpose | Color |
|---|---|
| Primary accent / CTAs | `#5865f2` (blurple) |
| Accent hover | `#4752c4` (blurple-strong) |
| Success | `#23a55a` |
| Error | `#f23f42` |
| Warning | `#f0b232` |
| Page background | `#0f1117` |
| Sidebar | `#161b22` |
| Panel | `#1c2129` |

## Typography

- **Display/UI font**: Inter
    - Use for all headings, UI labels, body copy, controls.
- **Mono font**: JetBrains Mono
    - Use for command snippets, IDs, technical metadata only.
- No Sora, no Manrope.

## Typography Rules

- Keep body text at `14–15px` for dashboard readability.
- Use sentence case for labels; avoid all-caps except for `type-meta` eyebrows.
- No extreme letter-spacing or display-style tracking in UI text.
- Headings use Inter with moderate negative tracking (`-0.01em` to `-0.02em`).

## Voice and Copy

- Keep messaging direct and operational — clear action labels, minimal marketing language in admin screens.
- No "Neo-editorial command center" or AI-aesthetic taglines.
- No Sparkles icons used decoratively.

## Visual Style

- Flat panels: no glassmorphism, no radial gradients on page backgrounds, no shimmer/glow effects.
- Borders use `--lucky-border-soft` by default, upgrade to `--lucky-border-strong` on hover.
- Motion: only fade transitions (`fade-up`, `fade-in`). No floating, glowing, or pulsing effects.
- Icons in colored contexts use blurple, success green, warning amber, or error red as appropriate.
