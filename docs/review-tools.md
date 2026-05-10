# Code Review Tooling — Lucky

Per the merge rule in `~/.claude/standards/workflow.md`, a PR is merge-eligible
when CI is green AND code review tools have approved. This page documents what
each tool does, what it doesn't, and how to interpret silence.

## Active stack

| Tool | Type | What it covers | Cost | Rate limit |
|------|------|----------------|------|-----------|
| **CodeRabbit** | AI | Logic review, semver, contextual feedback | Trial / paid | Hits trial cap |
| **SonarCloud** | SAST + metrics | Quality gate, security hotspots, code smells | Free for public repos | Generous |
| **Greptile** | AI | Cross-file logic, race conditions | Trial — **expired** | 50 reviews/lifetime |
| **GitGuardian** | Secret scan | Leaked credentials | Free for OSS | Generous |
| **Socket** | Supply-chain | Dependency typosquatting, malware | Free | Per-PR |
| **TruffleHog** | Secret scan | Git history secrets | Free | Generous |
| **Danger** | Deterministic | PR convention rules (lockfile, console.log, …) | Free, OSS | None |
| **Claude review** | AI | Self-owned reviewer for substantive concerns | Anthropic API (~$0.10/PR) | Pay-as-you-go |

## Why we replaced Greptile + tightened CodeRabbit (2026-05-10)

Greptile's free tier capped at 50 reviews/lifetime; we hit it. Their reviews
were valuable when they fired (caught the `fetch()`-doesn't-throw bug on PR
\#808 that CodeRabbit missed) but unreliable above the cap.

CodeRabbit's default `assertive` profile generated `🟡 Minor / 💤 Low value /
Nitpick` comments that flipped PRs to `CHANGES_REQUESTED`, blocking the merge
gate on opinion. Switched to `chill` profile so only substantive issues block.

Replaced both gaps with:

1. **`.coderabbit.yaml`** with `profile: chill` — fewer nits, same bug-finding.
2. **Claude review action** (`.github/workflows/claude-review.yml`) — self-owned
   Sonnet-powered reviewer focused on correctness/security/semver/prod-risk.
3. **Danger.js** (`dangerfile.ts`, `.github/workflows/danger.yml`) — deterministic
   rules that never silently bail (lockfile drift, console.log residue,
   missing CHANGELOG, .env leaks, branch naming, big PR warning).

## Reading the merge rule against this stack

A PR is merge-eligible when ALL hold:

- ✅ Required CI green
- ✅ SonarCloud Quality Gate `passed`
- ✅ CodeRabbit has no `🔴 Critical` / `🟠 Major` unresolved threads
  (Minor/Nitpick/Optional/Low-value are now summarized, not threaded)
- ✅ Claude review approved or no substantive concerns posted
- ✅ Danger has no `fail()` outputs (warnings are fine)
- ✅ GitGuardian / Socket / TruffleHog clean

When CodeRabbit is rate-limited (rare with `chill` profile) or Greptile is
absent, **Claude review still runs** — that's the point. No more silent
gate-bailout.

## Tools considered and skipped

| Tool | Why skipped |
|------|-------------|
| Qodana | Strong inspections but JetBrains-specific; ESLint + tsc + ruff already cover the same ground |
| SonarQube self-hosted | SonarCloud already gives us the quality gate without ops burden |
| Codacy | Paid; overlaps with SonarCloud + Semgrep |
| DeepCode (now Snyk Code) | Paid; replaced by Semgrep + GitGuardian + Socket + Danger combo |
| Reviewdog | Useful for surfacing linter output as PR comments, but ESLint annotations in CI already do this; deferred until needed |
| Trivy | Container scanning; not yet relevant — Lucky deploys via Docker but Socket + GitHub Dependabot already handle node deps |
| **Qodo Merge** (formerly PR-Agent) | Strong open-source AI reviewer with `/review` `/describe` slash commands and multi-agent architecture. Deferred — Claude review covers the same ground without an extra service to maintain. **Revisit if** we want PR slash-command interactivity, or want to swap LLMs per task (cheap model for `/describe`, expensive for `/review`), or need offline review via local Ollama. |
| **LucidShark** | CLI-first local SAST + linting, Apache 2.0. Strong privacy story but overlaps with Semgrep + GitGuardian; deferred. |
| **Tabby** | Self-hosted Copilot alternative with repo-context indexing; primarily a code-completion tool, not a PR reviewer. Out of scope here. |
| **SonarQube Community Edition (self-hosted)** | SonarCloud already gives us the quality gate without ops burden. The 2026 "AI CodeFix" feature in CE is interesting but not enough to justify hosting. |
| **CodeFactor / Aikido** | Free-for-OSS SaaS; overlap with SonarCloud + Socket. No clear marginal value. |

See `~/.claude/projects/-Users-lucassantana/memory/free-tools-analysis.md` for
the broader Forge-Space-era audit (2026-03-07).

## Maintenance

- Re-evaluate Greptile if they introduce per-org pricing
- Tune `.coderabbit.yaml` if `chill` proves too quiet — `path_filters` or
  `auto_review.base_branches` are the levers
- Update Claude review prompt in `.github/workflows/claude-review.yml` when
  the `workflow.md` merge rule evolves
- `dangerfile.ts` is the place to encode any new convention that humans keep
  forgetting — cheaper than re-asking AI bots to remember it
