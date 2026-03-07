# LukBot — Known Gotchas

Last updated: 2026-03-07 (Session 6)

## Express 5
- `req.query` is read-only (getter/setter) — cannot reassign in middleware
- Use `p()` helper for `req.params` (string | string[]) — but NOT for Zod-coerced number params
- `validateParams` replaces `req.params` with Zod output: `z.coerce.number()` turns "1" → 1 (number), so `p(1)` breaks
- Never use `p()` on optional query params — `p(undefined)` crashes

## Testing
- Jest 30 uses `--testPathPatterns` (plural), not `--testPathPattern`
- Flaky moderation test: "should return 500 on service error" fails intermittently in full suite
- 1 flaky E2E test: "OAuth redirect targets Discord auth endpoint" — race with window.location.href cleanup

## E2E Tests (Playwright)
- `networkidle` → `domcontentloaded` (Vite HMR WebSocket blocks networkidle)
- Nav links are `<a>` (React Router Link), not `<button>`
- Dashboard route is `/` not `/dashboard`
- Active sidebar class: `bg-lukbot-red/10` not `active`
- Logout: `button[aria-label="Logout"]` (no dropdown)
- Mobile: `aria-label="Open sidebar"` / `"Close sidebar"`
- Avatar: Radix uses Tailwind utilities, `[class*="avatar"]` doesn't match
- Zustand persist interferes with logout/error tests — clear localStorage or override mock
- Always use `route.fulfill()` with mock data, never `route.continue()` (hits real API → 401)

## Session Persistence
- `session-file-store` ESM/CJS: must use `require()` not `import` (Jest prototype undefined)
- `ServerCard` Manage button navigates to `/dashboard` (not a route) → catch-all redirects to `/`

## Bundle / Dependencies
- shadcn/ui CLI installs all Radix primitives even when few components used — audit periodically
- `tailwindcss-animate` IS used (in `index.css` @plugin) — don't remove
- Commitlint requires lowercase subject after conventional prefix

## Git / CI
- `CLAUDE.md` is gitignored — use `git add -f CLAUDE.md` to stage
- Pre-commit runs `npm audit --audit-level=critical` — use `HUSKY=0` for non-code commits

## Build
- `packages/shared` must build first before other packages
- Frontend uses path alias `@/` mapped to `src/`

## Music Routes
- SSE stream route (`/music/stream`) intentionally NOT wrapped in asyncHandler

## Auth Routes
- `auth.ts`, `authCallback.ts`, `lastfm.ts` use try/catch legitimately — redirect-based error handling
