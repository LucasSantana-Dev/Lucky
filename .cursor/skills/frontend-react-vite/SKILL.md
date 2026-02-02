---
name: frontend-react-vite
description: Work with LukBot frontend (React, Vite, Tailwind). Use when editing packages/frontend, UI components, pages, or frontend tests.
---

# LukBot Frontend (React, Vite, Tailwind)

## When to use

- Editing `packages/frontend` — components, pages, hooks, stores, services
- Adding or changing UI, routing, or API calls from the webapp
- Frontend styling (Tailwind), tests, or E2E flows

## Structure

- **Entry**: `packages/frontend/src/main.tsx` → `App.tsx`
- **Pages**: `packages/frontend/src/pages/` (Login, Dashboard, Config, Features, ServersPage)
- **Components**: `packages/frontend/src/components/` — Layout, Dashboard, Config, ui (shadcn-style)
- **State**: `packages/frontend/src/stores/` (auth, features, guild); API in `packages/frontend/src/services/api.ts`
- **Types**: `packages/frontend/src/types/`

## Conventions

- React + TypeScript; no dependency on `@lukbot/shared`. API via backend base URL (env).
- Functional components and hooks; keep components small and focused.
- Styling: Tailwind; follow existing patterns in `index.css` and components.
- Tests: `packages/frontend/tests/`; E2E with Playwright when changing user flows.

## Commands

- Dev: `npm run dev:frontend`
- Build: `npm run build:frontend`
- Lint/typecheck: root `npm run lint`, `npm run type:check`

## MCP

- **user-Context7**: React, Vite, Tailwind, TypeScript docs
- **user-browser-tools** / **cursor-ide-browser**: E2E and browser checks
- **user-v0** / **user-@magicuidesign/mcp**: UI ideas only; adapt to repo patterns
