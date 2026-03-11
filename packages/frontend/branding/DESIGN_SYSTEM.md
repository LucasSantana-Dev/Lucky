# Lucky Design System

## Theme Direction

- Visual language: neon-cat identity with dark, high-contrast surfaces
- Personality: playful, premium, energetic
- Product default: dark mode first

## Typography System

- Display: `Sora`
- Body: `Manrope`
- Mono: `JetBrains Mono`

### Type Tokens

- `--lucky-font-display`: `'Sora', 'Manrope', 'Avenir Next', 'Segoe UI', sans-serif`
- `--lucky-font-body`: `'Manrope', 'Avenir Next', 'Segoe UI', sans-serif`
- `--lucky-font-mono`: `'JetBrains Mono', 'SFMono-Regular', 'Menlo', monospace`

## Color Tokens

### Foundation

- `--lucky-bg-950`: `#0B0018`
- `--lucky-bg-900`: `#120127`
- `--lucky-bg-800`: `#21033B`
- `--lucky-bg-700`: `#30085A`

### Brand

- `--lucky-neon-pink`: `#FF58E4`
- `--lucky-neon-pink-soft`: `#F5A5FF`
- `--lucky-neon-violet`: `#B251FF`
- `--lucky-neon-gold`: `#FFC66E`
- `--lucky-neon-gold-soft`: `#FFE4A8`

### Ink

- `--lucky-ink-light`: `#FBF8FF`
- `--lucky-ink-muted`: `#CFC0E7`
- `--lucky-ink-dark`: `#14052A`

## Semantic Mapping

- Primary action: `--lucky-neon-pink`
- Primary hover: `--lucky-neon-pink-soft`
- Accent and highlights: `--lucky-neon-gold`
- Interactive glow: `--lucky-neon-violet`
- Page background: `--lucky-bg-950`
- Card/panel background: `--lucky-bg-900`
- Elevated card background: `--lucky-bg-800`
- Text on dark: `--lucky-ink-light`
- Secondary text on dark: `--lucky-ink-muted`
- Text on light: `--lucky-ink-dark`

## Type Scale

- Display XL: `64/72`, weight `700`
- Display L: `48/56`, weight `700`
- H1: `40/48`, weight `700`
- H2: `32/40`, weight `700`
- H3: `24/32`, weight `600`
- Body: `16/24`, weight `400-500`
- Small: `14/20`, weight `400-500`
- Caption: `12/16`, weight `500`
- Code: `13/20`, weight `500`

## Component Guidance

- Buttons:
    - Primary: neon pink background with dark text on light mode, light text on dark mode
    - Secondary: transparent background + neon pink border
    - Accent: neon gold used sparingly for high-value actions
- Surfaces:
    - Use `bg-950` for app shell
    - Use `bg-900` for default cards
    - Use `bg-800` for selected/active cards
- Iconography:
    - Mascot icon is the core brand mark
    - Use flat or monochrome variants where glow is visually noisy

## Accessibility

- Target WCAG AA for all text and controls
- Avoid neon text for long paragraphs
- Keep major text content in ink tokens
- Reserve glow for decorative and emphasis states

## Asset and Token Sources

- Brand assets: `assets/branding`
- Token file: `assets/branding/lucky-brand-tokens.css`
