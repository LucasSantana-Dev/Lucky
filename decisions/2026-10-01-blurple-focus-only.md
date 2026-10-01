# Discord blurple is the focus color only; pink is the single brand accent

- **Date:** 2026-10-01
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Scope:** Frontend accent palette (`packages/frontend/src/index.css`, `packages/frontend/branding/`)
- **Supersedes:** the "dual accent" palette in `decisions/2026-04-21-redesign-port-target.md`
  (blurple for primary CTAs and active states, pink as secondary)
- **Closes:** #2558

## Context

The 2026-04-21 port made Discord blurple `#5865f2` the primary accent and neon pink the
secondary one. Since then the code moved to pink: Button primary is `brand-strong` (#2548),
active nav uses a `border-lucky-brand` pink border, StatTile tones are pink, and the blurple
`:root` aliases were removed as dead (#2548, #2556). Blurple survived only in focus rings,
in `::selection`, and in tokens nobody consumed (`--color-lucky-blurple-*`,
`--color-brand-discord`). The branding docs still described blurple as the CTA color.

## Decision

Pink is the single brand accent. Blurple is used only for keyboard focus indicators
(`--color-lucky-shadow-focus`, `lucky-focus-ring`, the focus states in `index.css` and the
`focus-visible` shadows in `Sidebar.tsx`). It keeps focus visually distinct from the pink
active and selected states. Twelve older focus rings still use pink
(`focus-visible:ring-lucky-brand`); moving them to blurple is #2560.

- Delete the unused `--color-lucky-blurple-*` scale and `--color-brand-discord`.
- `::selection` moves from blurple to pink.
- `DESIGN_SYSTEM.md`, `BRANDING_GUIDE.md` and `DESIGN.md` describe pink as the accent and
  blurple as focus-only.

## Revisit when

A new surface wants blurple for anything other than focus, or focus rings need a token
instead of the raw `rgb(88 101 242 / …)` literals.
