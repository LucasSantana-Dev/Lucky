# Lucky Branding Guide

## Brand Name

- Primary product name: `Lucky`.
- Replace user-facing `Lucky` naming with `Lucky`.

## Logo Source

- Canonical source file:
    - `/Users/lucassantana/Desenvolvimento/Lucky/assets/lucky-mascot/outline-v4-neon.jpeg`
- Frontend runtime asset:
    - `packages/frontend/public/lucky-logo.png`
- Favicon:
    - `packages/frontend/public/favicon.png`

## Logo Usage

- Minimum display size:
    - App header/sidebar: `36x36`.
    - Login hero: `64x64`.
- Clear space:
    - Keep at least `0.25x` logo width padding from surrounding elements.
- Allowed backgrounds:
    - Deep purple surfaces.
    - Neutral dark backgrounds.
- Avoid:
    - Stretching or non-proportional scaling.
    - Recoloring mascot artwork.
    - Low-contrast overlays.

## Color System

- Brand purple family:
    - `#190d2f`, `#231245`, `#331a63`, `#4a2387`, `#6d34bf`, `#8b5cf6`
- Gold accent family:
    - `#d4a017`, `#e4b83f`, `#f3cc64`

## Typography

- Display font: `Sora`
    - Use for page titles, section headers, campaign/hero text.
- Body font: `Manrope`
    - Use for UI labels, forms, body copy, table content.
- Mono font: `JetBrains Mono`
    - Use for command snippets, IDs, technical metadata.

## Typography Rules

- Never use default browser/system stacks as primary typography.
- Keep body text at `16px` minimum for dashboard readability.
- Avoid all-caps for long labels; use sentence/title case.
- Keep heading tracking slightly condensed (`-0.01em` to `-0.02em`) for brand voice.
- Use mono only for technical context, not for generic UI copy.

## Voice and Copy

- Product references should read:
    - `Lucky`
    - `Lucky Dashboard`
- Keep messaging direct and operational:
    - Clear action labels.
    - Minimal marketing language in admin screens.

## Migration Rule

- New UI and copy must use Lucky naming and tokens.
- Existing legacy token names may remain temporarily if mapped to Lucky values.
