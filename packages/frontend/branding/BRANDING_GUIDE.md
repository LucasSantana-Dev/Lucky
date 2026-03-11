# Lucky Branding Guide

## Brand Core

- Name: `Lucky`
- Character: playful, confident, fast
- Signature style: neon mascot on deep-plum backgrounds with gold accents
- Brand motif: waving lucky-cat mark

## Canonical Asset Pack

Source directory: `assets/branding`

- `lucky-logo-lockup-neon.{svg,png,webp}`: primary lockup for dark surfaces
- `lucky-logo-lockup-dark.{svg,png,webp}`: primary lockup for light surfaces
- `lucky-mark-neon.{svg,png,webp}`: mascot icon with glow treatment
- `lucky-mark-flat.{svg,png,webp}`: mascot icon without glow
- `lucky-mark-mono-light.{svg,png,webp}`: single-color white icon
- `lucky-mark-mono-dark.{svg,png,webp}`: single-color dark icon
- `lucky-wordmark-neon.{svg,png,webp}`: wordmark on dark surfaces
- `lucky-wordmark-dark.{svg,png,webp}`: wordmark on light surfaces
- `lucky-avatar-neon.{svg,png,webp}`: square avatar format
- `lucky-banner-neon.{svg,png,webp}`: wide hero/banner format
- `lucky-badge-neon.{svg,png,webp}`: circular badge format
- `lucky-brand-tokens.css`: reusable color + typography variables

### Format Usage

- Use `.svg` as the editable/source-of-truth format in product UI and design tooling.
- Use `.webp` for web delivery when broad browser support is available.
- Use `.png` for Discord uploads, embed attachments, and clients/tools that need raster alpha.

## Logo Rules

- Preferred: neon lockup on deep background
- On light backgrounds: use `lucky-logo-lockup-dark.svg`
- Keep proportions locked; do not redraw or stretch mark/wordmark
- Minimum clear space: `0.25x` of logo height on all sides
- Minimum size:
    - Lockup: `180px` width
    - Mark-only: `32px` width (UI), `512px` width (export source)

## Color Palette

### Core Colors

| Token           | Hex       | Role                         |
| --------------- | --------- | ---------------------------- |
| Lucky Night 950 | `#0B0018` | Deep background              |
| Lucky Night 900 | `#120127` | Primary dark surface         |
| Lucky Night 800 | `#21033B` | Elevated dark surface        |
| Lucky Night 700 | `#30085A` | Highlighted dark areas       |
| Neon Pink       | `#FF58E4` | Primary brand stroke         |
| Neon Pink Soft  | `#F5A5FF` | Glow + hover accents         |
| Neon Violet     | `#B251FF` | Secondary glow and gradients |
| Neon Gold       | `#FFC66E` | Accent details               |
| Neon Gold Soft  | `#FFE4A8` | Subtle highlights            |
| Ink Light       | `#FBF8FF` | Text on dark surfaces        |
| Ink Muted       | `#CFC0E7` | Secondary text               |
| Ink Dark        | `#14052A` | Text on light surfaces       |

### Contrast Guidance

- Use `Ink Light` text on `Night 900/950`
- Use `Ink Dark` text on white or light neutral backgrounds
- Keep long text in neutral ink tones; reserve neon colors for accents and calls to action

## Typography

### Families

- Display / headlines: `Sora`
- Body / UI: `Manrope`
- Mono / technical: `JetBrains Mono`

### Fallback Stacks

- Display: `'Sora', 'Manrope', 'Avenir Next', 'Segoe UI', sans-serif`
- Body: `'Manrope', 'Avenir Next', 'Segoe UI', sans-serif`
- Mono: `'JetBrains Mono', 'SFMono-Regular', 'Menlo', monospace`

### Type Scale

- Display XL: `64/72`, `700`
- Display L: `48/56`, `700`
- H1: `40/48`, `700`
- H2: `32/40`, `700`
- H3: `24/32`, `600`
- Body: `16/24`, `400-500`
- Small: `14/20`, `400-500`
- Caption: `12/16`, `500`

## Do / Do Not

- Do use neon versions on dark backgrounds
- Do use dark lockups on light backgrounds
- Do keep mascot and wordmark together in lockup contexts
- Do not place white/neon lockups directly on white backgrounds
- Do not recolor mascot details with non-brand hues
- Do not apply extra outlines, bevels, or photo effects

## Voice and Naming

- Product naming: `Lucky` and `Lucky Dashboard`
- Tone: concise, operational, direct
