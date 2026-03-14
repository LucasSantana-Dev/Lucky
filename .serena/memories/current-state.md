# Lucky Current State (2026-03-14)

## Version / Branch
- Latest published release: `v2.6.13` (`2026-03-12T17:48:31Z`)
- Current `origin/main`: `e1d99ce chore(security): remediate high transitive advisories (#211)`
- Root workspace policy: detached at `origin/main` for orchestration
- Dedicated main worktree: `/Users/lucassantana/Desenvolvimento/Lucky/.worktrees/fix-pr171-closure-v2612`

## Mainline Delivery Since `v2.6.13`
- ✅ PR #205 merged: GitGuardian incident `28574658` remediation
- ✅ PR #206 merged: env-only OAuth expected client-id and compose secret hardening
- ✅ PR #207 merged: frontend auth bootstrap probe stabilization
- ✅ PR #208 merged: deploy OAuth smoke secret contract hardening
- ✅ PR #209 merged: high npm audit remediation
- ✅ PR #210 closed as duplicate
- ✅ PR #211 merged: follow-up high advisory remediation (`undici` / `flatted`)

## Mainline Health
- ✅ `CI/CD Pipeline` passed for `e1d99ce`
- ✅ `SonarCloud Analysis` passed for `e1d99ce`
- ✅ `Build & Push Docker Images` passed for `e1d99ce`
- ✅ `Deploy to Homelab` passed for `e1d99ce`
- ✅ `npm audit` on `main`: `high=0`, `critical=0`, `moderate=10`

## Current Contracts
- Deploy OAuth smoke is derived from `GET /api/health/auth-config`
- Deploy requires `WEBAPP_EXPECTED_CLIENT_ID` secret
- Compose runtime requires explicit `POSTGRES_PASSWORD`
- Root verification contract is now `npm run verify`
- Playwright remains a separate smoke/regression lane via `npm run test:e2e`

## Operational Gaps
- Real browser-based Discord login validation is still required to confirm the
  full callback/session/dashboard path after the March 13 auth/deploy changes
- GitHub MCP authentication is broken in this environment; `gh` CLI is the
  current fallback for PR/release/issue operations
- Moderate dependency findings remain for the `file-type` / `yauzl` transitive
  chain and need a separate cleanup cycle
