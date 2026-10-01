# Lucky Design System

## Overview

Lucky uses a clean, neutral dark design system inspired by professional developer tools and Discord bots like Dyno and Carl-bot. The palette is dark greys/near-black with a single **neon pink** accent. Discord blurple is kept only for keyboard focus rings. See `decisions/2026-10-01-blurple-focus-only.md` (which supersedes the dual accent of `decisions/2026-04-21-redesign-port-target.md`).

## Color Palette

### Surfaces (darkest to lightest)

| Token                       | Hex       | Usage                         |
| --------------------------- | --------- | ----------------------------- |
| `--lucky-surface-canvas`    | `#0f1117` | Page background               |
| `--lucky-surface-sidebar`   | `#161b22` | Sidebar background            |
| `--lucky-surface-panel`     | `#1c2129` | Content panels                |
| `--lucky-surface-elevated`  | `#222831` | Elevated panels               |
| `--lucky-surface-highlight` | `#2a3140` | Active states, selected items |

### Borders

| Token                   | Hex       | Usage                |
| ----------------------- | --------- | -------------------- |
| `--lucky-border-soft`   | `#2d333b` | Default borders      |
| `--lucky-border-strong` | `#444c56` | Hover/active borders |

### Text

| Token                 | Hex       | Usage            |
| --------------------- | --------- | ---------------- |
| `--lucky-text-strong` | `#e6edf3` | Primary text     |
| `--lucky-text-body`   | `#adbac7` | Body text        |
| `--lucky-text-muted`  | `#919ca7` | Secondary labels |
| `--lucky-text-subtle` | `#8f99a6` | Disabled / meta  |

#### Text contrast (WCAG AA, 4.5:1 for body text)

Measured with WCAG relative luminance. Hue is unchanged from the previous values (`#768390`, `#545d68`).

| Token                 | Hex       | canvas | sidebar | panel | elevated | highlight |
| --------------------- | --------- | ------ | ------- | ----- | -------- | --------- |
| `--lucky-text-body`   | `#adbac7` | 9.55   | 8.75    | 8.18  | 7.50     | 6.59      |
| `--lucky-text-muted`  | `#919ca7` | 6.75   | 6.19    | 5.79  | 5.31     | 4.66      |
| `--lucky-text-subtle` | `#8f99a6` | 6.54   | 5.99    | 5.60  | 5.14     | 4.51      |

Every text token clears 4.5:1 on every surface, including `surface-highlight` (hover/active rows). Raising `text-subtle` that far puts it close to `text-muted`, so the two read as one tier; use weight or size, not color, when a third tier is needed.

### Accent (neon pink; blurple for focus only)

| Token                        | Hex       | Usage                                                    |
| ---------------------------- | --------- | -------------------------------------------------------- |
| `--color-brand-accent`       | `#ec4899` | Brand accent: fills, tints, borders, gradient highlights |
| `--color-lucky-neon-pink`    | `#ec4899` | Alias for the brand accent (used in token-bridge layer)  |
| `--color-lucky-brand-strong` | `#db2777` | Pink fill behind white text (4.60:1 on white)            |
| `--color-lucky-brand-deep`   | `#be185d` | Pink fill hover behind white text (6.04:1 on white)      |
| `--color-lucky-brand-text`   | `#f472b6` | Pink text and icons on any surface (4.92:1 or better)    |

`#ec4899` is 3.53:1 against white, so it is never a fill behind white text. It is not used for text either: it clears 4.5:1 only on canvas, sidebar and panel (5.35, 4.90, 4.58), not on elevated (4.20) or highlight (3.69). Pink foreground (text and icons) uses `brand-text` (`#f472b6`), which clears AA on every surface (7.12, 6.53, 6.10, 5.60, 4.92). `#ec4899` stays for fills, tints and borders; the legacy `text-lucky-red/blue/purple` aliases also resolve to it, so use `text-lucky-brand-text` instead. Use `brand-strong` for filled pink buttons and badges.

Short-form `--color-*` aliases are added alongside the long-form `--lucky-*` tokens during the redesign migration; both names resolve to the same value, see `index.css`. `brand`, `brand-strong`, `accent` and `accent-soft` exist only as `--color-lucky-*` (pink/orange); their unused blurple `:root` `--lucky-*` forms were removed (#2548, #2556), along with the dead `--lucky-red/blue/purple` aliases and `.lucky-gradient-text`. The table above documents the `--color-*` (Tailwind) values. Cleanup PR removing the duplicates is queued for after all page ports land.

### Status

| Token             | Hex       |
| ----------------- | --------- |
| `--lucky-success` | `#23a55a` |
| `--lucky-error`   | `#f23f42` |
| `--lucky-warning` | `#f0b232` |
| `--lucky-info`    | `#00aafc` |

## Typography

- **Display** (`h1`–`h4`, `type-display`, `type-title`): `Sora` (`--font-lucky-display`) — fallback Segoe UI, system-ui, sans-serif.
- **Body** (body copy, UI labels, controls): `Manrope` (`--font-lucky-body`) — same fallbacks.
- **Mono** (command snippets, IDs, case numbers, technical metadata): `JetBrains Mono` (`--font-lucky-mono`) — fallback SFMono-Regular, Menlo, Monaco, Consolas.

The three fonts are self-hosted via `@fontsource/*` packages imported at the top of `packages/frontend/src/main.tsx` (not from `index.css`: Tailwind's PostCSS `@import` flattening breaks fontsource's relative font URLs). No third-party font CDN is used, so visitor IPs are not sent to Google. Inter was dropped.

### Type Scale

| Class          | Size                          | Weight | Usage                        |
| -------------- | ----------------------------- | ------ | ---------------------------- |
| `type-display` | clamp(2rem, 3.5vw, 3rem)      | 700    | Hero headings                |
| `type-h1`      | clamp(1.6rem, 2.5vw, 2.25rem) | 700    | Page headings                |
| `type-h2`      | clamp(1.25rem, 2vw, 1.75rem)  | 600    | Section headings             |
| `type-title`   | 1rem                          | 600    | Card titles                  |
| `type-body-lg` | 1rem                          | 400    | Lead text                    |
| `type-body`    | 0.9375rem                     | 400    | Standard body                |
| `type-body-sm` | 0.875rem                      | 400    | Secondary body               |
| `type-meta`    | 0.6875rem                     | 600    | Labels, eyebrows (uppercase) |

## Surface Utilities

| Class              | Description                                                                      |
| ------------------ | -------------------------------------------------------------------------------- |
| `surface-panel`    | Standard content panel — sidebar background, subtle border, hover border darkens |
| `surface-card`     | Content card — panel background                                                  |
| `surface-elevated` | Elevated surface for modals/dropdowns                                            |
| `surface-glass`    | Same as panel (glassmorphism removed)                                            |

## Interaction & Motion

- Focus ring: blurple, from the `--color-lucky-focus: #5865f2` token. Tailwind rings use `focus-visible:ring-2 focus-visible:ring-lucky-focus` (2px, full opacity); `lucky-focus-visible` / `lucky-focus-ring` use `--lucky-shadow-focus` (3px at 40% alpha). The full-opacity ring clears 3:1 on canvas, sidebar, panel and elevated surfaces; against `bg-active` (`#2a3140`) it is 2.83:1, so keep the ring's outer edge on a darker surface. The 40% shadow is only ~1.6:1 on every surface (#2563). Two `focus-within` rings are still pink (`ServerCard`, `ui/Card`; #2561).
- Hover borders: upgrade from `border-soft` to `border-strong`
- Active nav items: pink `border-lucky-brand/40` + `bg-lucky-bg-active` background
- Allowed animations: `fade-up`, `fade-in`, `accordion-down/up`, `animate-spin` (loaders)
- Removed: glow-pulse, float, shimmer, pulse-glow animations

## Component Rules

- **Button primary**: `brand-strong` (pink `#db2777`) background, white text, hover → `brand-deep`
- **Button secondary**: panel background, border, hover → active highlight
- **Cards**: flat border, no gradient overlays, no box-shadow glow
- **Nav items**: pink border on active, blurple ring only on focus, `type-meta` section labels in subtle color
- **StatTile**: toned icon container (pink/success/warning), no glow drop-shadow

## Principles

1. **Single accent**: neon pink for CTAs (`brand-strong` fills), active states, accents and gradient highlights. Discord blurple `#5865f2` appears only in focus rings. No gold, no legacy-purple gradients.
2. **Flat panels**: No glassmorphism, no background radial gradients on pages.
3. **Professional motion**: Only fade transitions. No glow-pulse, float, or shimmer.
4. **Sora display + Manrope body + JetBrains Mono**: see Typography. All three are self-hosted.
5. **Consistent spacing**: panels use `p-4` or `p-5`.
