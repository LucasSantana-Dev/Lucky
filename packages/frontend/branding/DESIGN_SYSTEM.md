# Lucky Design System

## Theme Direction

- Brand personality: premium, playful, high-contrast.
- Core palette: purple (brand) + gold (accent).
- Primary mode: dark interface.

## Typography System

- Display typeface: `Sora` (headlines, hero, major labels).
- Body typeface: `Manrope` (UI text, controls, paragraphs).
- Monospace typeface: `JetBrains Mono` (code, IDs, technical values).
- Fallbacks:
    - Display/body: `Avenir Next`, `Segoe UI`, `sans-serif`
    - Mono: `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, `monospace`

## Type Tokens

- `--font-lucky-display`: `Sora` stack.
- `--font-lucky-body`: `Manrope` stack.
- `--font-lucky-mono`: `JetBrains Mono` stack.
- `--font-sans`: mapped to `--font-lucky-body`.
- `--font-mono`: mapped to `--font-lucky-mono`.

## Type Scale

- `Display`: `48/56`, weight `700` or `800`, tracking `-0.02em`
- `H1`: `36/44`, weight `700`, tracking `-0.015em`
- `H2`: `30/38`, weight `700`, tracking `-0.015em`
- `H3`: `24/32`, weight `600`, tracking `-0.01em`
- `H4`: `20/28`, weight `600`, tracking `-0.01em`
- `Body L`: `18/28`, weight `500`
- `Body`: `16/24`, weight `400` or `500`
- `Body S`: `14/20`, weight `400` or `500`
- `Caption`: `12/16`, weight `500`, tracking `0.01em`
- `Code`: `13/20`, weight `500`

## Core Tokens

- `--lucky-brand`: `#8b5cf6`
- `--lucky-brand-strong`: `#6d34bf`
- `--lucky-accent`: `#d4a017`
- `--lucky-accent-soft`: `#e4b83f`
- `--lucky-surface-1`: `#190d2f`
- `--lucky-surface-2`: `#231245`
- `--lucky-surface-3`: `#331a63`
- `--lucky-border`: `#3c2c5f`
- `--lucky-text-primary`: `#ffffff`
- `--lucky-text-secondary`: `#d0c7e6`
- `--lucky-text-muted`: `#a898c9`
- `--lucky-success`: `#22c55e`
- `--lucky-error`: `#ef4444`

## Semantic Roles

- `primary`: brand purple for primary controls.
- `secondary`: gold for emphasis and highlights.
- `accent`: gold for focus rings and active indicators.
- `background`: deep purple surfaces.
- `muted`: secondary surface for cards and panels.

## Component Rules

- Buttons:
    - Primary: purple background, white text.
    - Accent: gold background, dark text.
    - Destructive: red only for destructive actions.
- Typography:
    - Headings and `.font-display` use display typeface.
    - Body text and controls use body typeface.
    - Code, IDs, and command snippets use mono typeface.
- Cards and panels:
    - Use `surface-2` by default.
    - Use `surface-3` for active/hover.
    - Always include `lucky-border`.
- Navigation:
    - Active item uses gold indicator and purple highlight.
    - Inactive items use `text-secondary`, hover to white.

## Accessibility

- Target WCAG AA contrast for text and interactive states.
- Keep gold text on dark purple or near-black only.
- Keep white text on purple surfaces; avoid gold-on-purple for body text.

## Implementation Mapping

- Frontend CSS variables are defined in `packages/frontend/src/index.css`.
- Legacy `lucky-*` utility classes are mapped to Lucky colors for migration safety.
- New UI work should use semantic tokens and avoid hardcoded hex colors.
