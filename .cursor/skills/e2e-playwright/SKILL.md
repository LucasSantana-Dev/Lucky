---
name: e2e-playwright
description: Run and write E2E tests with Playwright for LukBot frontend. Use when adding or changing E2E flows, or verifying web UI.
---

# LukBot E2E (Playwright)

## When to use

- Adding or changing E2E tests for the webapp
- Verifying login, dashboard, config, or feature flows in the browser
- Debugging UI or interaction issues with live browser tools

## Layout

- E2E tests: typically under `packages/frontend/tests/` or root `tests/` if configured
- Playwright config: `playwright.config.ts` at repo or frontend package root

## Running E2E

- Start frontend: `npm run dev:frontend` (or use Docker)
- Run Playwright: `npx playwright test` (from package or root, per project setup)
- Headed/debug: `npx playwright test --headed` or `--debug`

## MCP for E2E

- **user-playwright**: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_fill_form`, etc.
- **user-puppeteer**: Alternative browser automation if preferred.
- **cursor-ide-browser**: Lock/unlock workflow: navigate → lock → interactions → unlock; use short waits and snapshots.
- **user-browser-tools**: Console/network logs, accessibility audit, screenshots.
- **user-chrome-devtools**: Inspect runtime, network, console when debugging.

## Conventions

- Prefer short incremental waits (1–3s) and snapshot checks instead of one long wait.
- For cursor-ide-browser: lock only after a tab exists; unlock when done with all browser operations.
- Test critical user flows (login, dashboard load, config change); avoid testing implementation details.
