# Lucky Design System

## Overview

Lucky uses a clean, neutral dark design system inspired by professional developer tools and Discord bots like Dyno and Carl-bot. The palette is dark greys/near-black with a **dual accent**: Discord blurple as the primary CTA color and neon pink as the secondary accent. See `docs/decisions/2026-04-21-redesign-port-target.md` for the rationale.

## Color Palette

### Surfaces (darkest to lightest)
| Token | Hex | Usage |
|---|---|---|
| `--lucky-surface-canvas` | `#0f1117` | Page background |
| `--lucky-surface-sidebar` | `#161b22` | Sidebar background |
| `--lucky-surface-panel` | `#1c2129` | Content panels |
| `--lucky-surface-elevated` | `#222831` | Elevated panels |
| `--lucky-surface-highlight` | `#2a3140` | Active states, selected items |

### Borders
| Token | Hex | Usage |
|---|---|---|
| `--lucky-border-soft` | `#2d333b` | Default borders |
| `--lucky-border-strong` | `#444c56` | Hover/active borders |

### Text
| Token | Hex | Usage |
|---|---|---|
| `--lucky-text-strong` | `#e6edf3` | Primary text |
| `--lucky-text-body` | `#adbac7` | Body text |
| `--lucky-text-muted` | `#768390` | Secondary labels |
| `--lucky-text-subtle` | `#545d68` | Disabled / meta |

### Accent (dual accent — Discord Blurple + Neon Pink)
| Token | Hex | Usage |
|---|---|---|
| `--color-brand-discord` | `#5865f2` | Primary CTA, active nav, focus rings |
| `--lucky-brand-strong` | `#4752c4` | Primary hover |
| `--color-brand-accent` | `#ec4899` | Secondary accent, live pings, gradient highlights |
| `--color-lucky-neon-pink` | `#ec4899` | Alias for the secondary accent (used in token-bridge layer) |

Short-form `--color-*` aliases are added alongside the long-form `--lucky-*` tokens during the redesign migration; both names resolve to the same value, see `index.css`. Cleanup PR removing the duplicates is queued for after all page ports land.

### Status
| Token | Hex |
|---|---|
| `--lucky-success` | `#23a55a` |
| `--lucky-error` | `#f23f42` |
| `--lucky-warning` | `#f0b232` |
| `--lucky-info` | `#00aafc` |

## Typography

- **Display** (`h1`–`h4`, `type-display`, `type-title`): `Sora` (`--font-lucky-display`) — fallback Segoe UI, system-ui, sans-serif.
- **Body** (body copy, UI labels, controls): `Manrope` (`--font-lucky-body`) — same fallbacks.
- **Mono** (command snippets, IDs, case numbers, technical metadata): `JetBrains Mono` (`--font-lucky-mono`) — fallback SFMono-Regular, Menlo, Monaco, Consolas.

All four fonts are loaded at the top of `packages/frontend/src/index.css`; Inter remains in the import list as a transitional fallback while pages port from the legacy single-font system.

### Type Scale
| Class | Size | Weight | Usage |
|---|---|---|---|
| `type-display` | clamp(2rem, 3.5vw, 3rem) | 700 | Hero headings |
| `type-h1` | clamp(1.6rem, 2.5vw, 2.25rem) | 700 | Page headings |
| `type-h2` | clamp(1.25rem, 2vw, 1.75rem) | 600 | Section headings |
| `type-title` | 1rem | 600 | Card titles |
| `type-body-lg` | 1rem | 400 | Lead text |
| `type-body` | 0.9375rem | 400 | Standard body |
| `type-body-sm` | 0.875rem | 400 | Secondary body |
| `type-meta` | 0.6875rem | 600 | Labels, eyebrows (uppercase) |

## Surface Utilities

| Class | Description |
|---|---|
| `surface-panel` | Standard content panel — sidebar background, subtle border, hover border darkens |
| `surface-card` | Content card — panel background |
| `surface-elevated` | Elevated surface for modals/dropdowns |
| `surface-glass` | Same as panel (glassmorphism removed) |

## Interaction & Motion

- Focus ring: 3px blurple ring (`--lucky-shadow-focus: 0 0 0 3px rgb(88 101 242 / 0.4)`)
- Hover borders: upgrade from `border-soft` to `border-strong`
- Active nav items: blurple left-accent bar (2px) + `surface-highlight` background
- Allowed animations: `fade-up`, `fade-in`, `accordion-down/up`, `animate-spin` (loaders)
- Removed: glow-pulse, float, shimmer, pulse-glow animations

## Component Rules

- **Button primary/accent**: blurple background, white text, hover → `brand-strong`
- **Button secondary**: panel background, border, hover → active highlight
- **Cards**: flat border, no gradient overlays, no box-shadow glow
- **Nav items**: left accent bar on active (blurple), `type-meta` section labels in subtle color
- **StatTile**: toned icon container (blurple/success/warning), no glow drop-shadow

## Principles

1. **Dual accent**: Discord blurple `#5865f2` for primary CTAs + active states; neon pink `#ec4899` for secondary accents and gradient highlights. No gold, no legacy-purple gradients.
2. **Flat panels**: No glassmorphism, no background radial gradients on pages.
3. **Professional motion**: Only fade transitions. No glow-pulse, float, or shimmer.
4. **Sora display + Manrope body + JetBrains Mono**: see Typography. Inter stays in the import list as a transitional fallback while pages port.
5. **Consistent spacing**: panels use `p-4` or `p-5`.
