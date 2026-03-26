# Lucky Design System

## Overview

Lucky uses a clean, neutral dark design system inspired by professional developer tools and Discord bots like Dyno and Carl-bot. The palette is dark greys/near-black with Discord blurple as the single accent color.

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

### Accent (single accent — Discord Blurple)
| Token | Hex | Usage |
|---|---|---|
| `--lucky-brand` | `#5865f2` | Primary accent, CTAs, active states |
| `--lucky-brand-strong` | `#4752c4` | Hover state for brand |

### Status
| Token | Hex |
|---|---|
| `--lucky-success` | `#23a55a` |
| `--lucky-error` | `#f23f42` |
| `--lucky-warning` | `#f0b232` |
| `--lucky-info` | `#00aafc` |

## Typography

**Font**: Inter (system fallback: Segoe UI, system-ui, sans-serif)
**Mono**: JetBrains Mono

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

1. **Single accent**: Discord blurple `#5865f2` is the only accent. No gold, no purple gradients.
2. **Flat panels**: No glassmorphism, no background radial gradients on pages.
3. **Professional motion**: Only fade transitions. No glow-pulse, float, or shimmer.
4. **Inter only**: No Sora or Manrope fonts.
5. **Consistent spacing**: panels use `p-4` or `p-5`.
