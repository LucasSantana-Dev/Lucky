# Security Policy

## Supported Versions

Only the **latest `main` branch** and the most recent tagged release of Lucky are supported for security fixes. Older tags do not receive backported fixes; use the current release.

| Version                   | Supported          |
|---------------------------|--------------------|
| Latest `main`             | :white_check_mark: |
| Latest tagged release     | :white_check_mark: |
| Previous tagged releases  | :x:                |

## Reporting a Vulnerability

**Do not open a public GitHub issue** for suspected security vulnerabilities.

Instead, email the maintainer directly:

- **Email:** `lucas.diassantana@gmail.com`
- **Subject line:** `[security] Lucky — <short summary>`

Please include:

1. A description of the vulnerability and potential impact.
2. Reproduction steps or a proof-of-concept (minimal is fine).
3. The affected package path (`packages/bot`, `packages/backend`, `packages/frontend`, `packages/shared`) and commit SHA, if known.
4. Your preferred disclosure timeline.

### What to expect

- **Acknowledgement:** Within 72 hours.
- **Initial triage:** Within 7 days (severity assessment + reproduction confirmation).
- **Fix timeline:** Depends on severity. Critical issues target ≤14 days; high ≤30 days; medium/low on a best-effort basis.
- **Disclosure:** Coordinated. You will be credited in the release notes unless you prefer anonymity.

## Scope

In scope:
- The Discord bot runtime (`packages/bot`).
- The backend API (`packages/backend`).
- The web dashboard (`packages/frontend`).
- Shared libraries (`packages/shared`).
- Build, deploy, and CI configuration in this repository.

Out of scope:
- Third-party services Lucky integrates with (Discord API, Spotify API, Last.fm, top.gg, Redis, PostgreSQL) — report to the vendor directly.
- Self-hosted deployments with operator-introduced misconfiguration.
- Social engineering or physical attacks.

## Dependencies

We use GitHub Dependabot and CodeRabbit to monitor dependency vulnerabilities. Severity-graded fixes are tracked in PRs labeled `security` or `dependencies`. Unfixed-upstream advisories are tracked in the backlog (`.claude/plans/backlog-*.md`).
