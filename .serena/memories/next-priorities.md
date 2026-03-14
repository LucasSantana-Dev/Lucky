# Next Priorities (2026-03-14)

## P0
1. Cut the next patch release from `main` (`v2.6.14` unless semver scope changes)
   so the March 13 stabilization/security wave is published.
2. Run production smoke on:
   - `/api/auth/discord`
   - `/api/health/auth-config`
   - `https://lucky.lucassantana.tech/install`
   - legal/discovery URLs
   - Discord discovery media URLs
3. Complete a real browser-based Discord login validation and confirm dashboard
   bootstrap, guild selection, settings, features, and Twitch notifications.
4. Triage open Dependabot PRs `#212` to `#217` immediately after the release.

## P1
1. Keep CI security enforcement aligned with repo policy:
   `audit:high` must stay blocking in CI and local release verification.
2. Use `npm run verify` as the canonical pre-PR gate; keep `npm run test:e2e`
   separate as the browser smoke/regression lane.
3. Run a moderate-only dependency cleanup cycle for the `file-type` / `yauzl`
   transitive chain.
4. Restore GitHub MCP authentication for this environment.

## P2
1. Triage unmerged local branches/worktrees into `keep`, `salvage`, or `delete`.
2. Normalize docs that still reflect pre-`main` stabilization assumptions.
3. Convert backlog items into GitHub issues/epics instead of keeping them only
   in local branch names and memory files.

## P3
1. Resume the locked bot reliability roadmap:
   `/music health`, music watchdog auto-recovery, provider health cooldown,
   queue snapshot restore.
2. Follow with autoplay intelligence v2:
   feedback, diversity constraints, reason tags, `/queue rescue`.
3. Revisit remaining guild automation / RBAC deltas only after branch triage.
4. Defer presence/activity improvement work until reliability and admin/runtime
   follow-up items are closed.
