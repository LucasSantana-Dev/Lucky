# Contributing to Lucky

Thanks for considering a contribution. Lucky is a solo-maintained project, so external contributions are reviewed best-effort. Before opening a PR, please skim this document.

## Setup

```bash
git clone https://github.com/LucasSantana-Dev/Lucky.git
cd Lucky
cp .env.example .env        # fill in DISCORD_TOKEN, CLIENT_ID, DATABASE_URL
npm install                 # root install covers all workspaces
npm run build
npm run db:migrate          # against your local Postgres
```

Prereqs: Node.js 22, FFmpeg, PostgreSQL 16+, Redis, and a Discord bot token with the required intents.

## Development workflow

```bash
npm run dev:bot             # bot with hot reload
npm run dev:backend         # backend API with hot reload
npm run dev:frontend        # Vite dev server

npm run verify              # full pre-PR gate — lint + build + test
npm run test:all            # all unit/integration suites (~2,500 tests)
npm run test:e2e            # Playwright smoke tests
npm run type:check          # cross-workspace typecheck
```

If `npm run verify` passes, your PR should pass CI.

## Branching

- Base all work on `main`. Never push directly to `main`; it is branch-protected.
- Name branches by intent: `feat/<area>-<summary>`, `fix/<area>-<summary>`, `chore/<summary>`, `docs/<summary>`, `refactor/<summary>`, `test/<summary>`, `ci/<summary>`.
- One concern per branch. Keep PR diffs small and reviewable.

## Commits

Follow Conventional Commits: `<type>(<scope>): <summary>`. Examples from recent history:

```
feat(frontend): SectionHeader eyebrowIcon + statusBand
fix(bot): bound player track state with LRU + 30min TTL
refactor(bot): type the discord-player-youtubei dynamic import
chore(security): bump hono + refresh follow-redirects lockfile
docs(env): add DIRECT_URL documentation to .env.example
```

Squash-merges are the default; commit messages on the branch can be WIP-grade.

## Pull requests

Before opening a PR:

- Rebase on latest `main` (or use `gh pr update-branch <n>` once open).
- Run `npm run verify` locally. If a test is genuinely flaky, call it out explicitly in the PR body.
- Include a short `## Summary`, `## Why`, and `## Test plan` in the PR description. Reference related issues, ADRs (`docs/decisions/`), and specs (`docs/specs/`) where applicable.

Required status checks on `main`:

- **Quality Gates** — build + lint + test + `verify:shared-exports`.
- **SonarCloud Code Analysis** — new-code coverage threshold ≥80%.
- **Security** — GitGuardian secret scan, npm audit, Dependabot gate.

Branch protection enforces admins (no `--admin` overrides). Auto-merge is armed after the above are green; no human review is required for single-maintainer operation.

## Style

- TypeScript `strict` across all workspaces. Prefer narrow generics over `any`. If a cast is unavoidable, explain it in a one-line comment.
- ESLint enforced via `eslint.config.js`; run `npm run lint:fix`.
- Prettier for formatting: `npm run format`.
- Avoid introducing new dependencies for trivial utilities — check `@lucky/shared/utils` first.
- New public APIs/types live in `@lucky/shared`; don't duplicate them in `bot` / `backend` / `frontend`.

## Testing

- Unit + integration tests via Jest in `bot`, `backend`, `shared`; Vitest in `frontend`.
- E2E via Playwright in `packages/frontend/tests/e2e`.
- New features need tests. Bug fixes should include a regression test that fails before the fix.
- SonarCloud will fail PRs whose new-code coverage is below the threshold.

## Security

See `SECURITY.md` for how to report vulnerabilities. **Do not file security issues as public GitHub issues.**

## Questions

For non-security questions, open a GitHub issue with enough context to reproduce. For chat-style support, use the Discord server linked from the README.
