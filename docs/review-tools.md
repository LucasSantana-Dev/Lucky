# Code Review Tooling — Lucky

Per the shared merge rule (workflow.md in the org-level standards, mirrored
into each contributor's environment), a PR is merge-eligible when CI is green
AND code review tools have approved. This page documents what each tool does,
what it doesn't, and how to interpret silence.

## Active stack (currently enforced)

| Tool                    | Type           | What it covers                                                           | Cost                       | Rate limit    |
| ----------------------- | -------------- | ------------------------------------------------------------------------ | -------------------------- | ------------- |
| **cubic**               | AI             | Codebase-aware logic review, cross-file intent gaps, low false-positives | Free on public repos       | Generous      |
| **Claude review**       | AI             | Self-owned reviewer for substantive concerns                             | Anthropic API (~$0.10/PR)  | Pay-as-you-go |
| **PR-Agent** (Qodo OSS) | AI             | Inline diff comments, auto-describe/improve                              | Anthropic API (negligible) | None          |
| **SonarCloud**          | SAST + metrics | Quality gate, security hotspots, code smells                             | Free for public repos      | Generous      |
| **GitGuardian**         | Secret scan    | Leaked credentials                                                       | Free for OSS               | Generous      |
| **Socket**              | Supply-chain   | Dependency typosquatting, malware                                        | Free                       | Per-PR        |
| **TruffleHog**          | Secret scan    | Git history secrets                                                      | Free                       | Generous      |
| **Danger**              | Deterministic  | PR convention rules (lockfile, console.log, …)                           | Free, OSS                  | None          |

## Retired / not gating

| Tool           | Status                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CodeRabbit** | Retired 2026-06-04 (paid). Replaced by cubic (free on public repos) + the existing PR-Agent/Claude-review AI angles. See ADR `2026-05-21-replace-plan-limited-review-tools.md` (Update 2026-06-04). |
| **Greptile**   | Trial cap reached (50 reviews/lifetime). Posts may still appear but **do not gate merges**. Use cubic / Claude review for the same coverage.                                                        |

## Why we replaced Greptile + tightened CodeRabbit (2026-05-10)

Greptile's free tier capped at 50 reviews/lifetime; we hit it. Their reviews
were valuable when they fired (caught the `fetch()`-doesn't-throw bug on PR
\#808 that CodeRabbit missed) but unreliable above the cap.

CodeRabbit's default `assertive` profile generated `🟡 Minor / 💤 Low value /
Nitpick` comments that flipped PRs to `CHANGES_REQUESTED`, blocking the merge
gate on opinion. Switched to `chill` profile so only substantive issues block.

Replaced both gaps with:

1. **`.coderabbit.yaml`** with `profile: chill` — fewer nits, same bug-finding.
2. **Claude review action** — self-owned Sonnet-powered reviewer focused on
   correctness/security/semver/prod-risk. The runtime lives as a reusable
   workflow in `LucasSantana-Dev/.github`; this repo's
   `.github/workflows/review-tools.yml` calls it pinned at `@v1`.
3. **Danger.js** — deterministic rules in `dangerfile.ts` (lockfile drift,
   console.log residue, missing CHANGELOG, .env leaks, branch naming,
   big PR warning). The runtime is also a reusable workflow in
   `LucasSantana-Dev/.github`; rules are repo-specific by design.

**Why one caller workflow + reusable workflows in `LucasSantana-Dev/.github`?**
See ADR `ai-dev-toolkit:docs/decisions/2026-05-10-multi-repo-review-tools-rollout.md`.
TL;DR: action SHA bumps and prompt tuning propagate centrally; repo-specific
dangerfile rules stay local.

## Reading the merge rule against this stack

A PR is merge-eligible when ALL hold:

- ✅ Required CI green
- ✅ SonarCloud Quality Gate `passed`
- ✅ cubic has no unresolved high-severity findings
- ✅ Claude review / PR-Agent approved or no substantive concerns posted
- ✅ Danger has no `fail()` outputs (warnings are fine)
- ✅ GitGuardian / Socket / TruffleHog clean

cubic is low-false-positive by design and does not gate on style nits.
Three independent AI angles run per PR (cubic + Claude review + PR-Agent), so
no single reviewer being quiet causes a silent gate-bailout.

## Tools considered and skipped

| Tool                                          | Why skipped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Qodana                                        | Strong inspections but JetBrains-specific; ESLint + tsc + ruff already cover the same ground                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| SonarQube self-hosted                         | SonarCloud already gives us the quality gate without ops burden                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Codacy                                        | Paid; overlaps with SonarCloud + Semgrep                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| DeepCode (now Snyk Code)                      | Paid; replaced by Semgrep + GitGuardian + Socket + Danger combo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Reviewdog**                                 | Mature framework (~9k stars) for posting linter/static-analyzer output as PR comments. Pairs naturally with ESLint, Semgrep, ruff, golangci-lint, custom analyzers. ESLint annotations already surface in CI logs but Reviewdog gets them inline on the diff — better signal at the moment of review. Currently deferred (not in this PR) because Lucky's ESLint is wired through GitHub's native annotations and adding Reviewdog now would duplicate output. Revisit if we add Semgrep custom rules or want unified inline-comment formatting across multiple linters. |
| **Sourcebot**                                 | Newer (2026) self-hosted tool with whole-codebase indexing + semantic search + AI review. Strong "context awareness" pitch but young — wait for it to mature past v1.0 before adopting.                                                                                                                                                                                                                                                                                                                                                                                  |
| **Continue**                                  | VS Code / JetBrains plugin for inline AI review during editing. Editor-side, not PR-side — out of scope here, but worth installing locally if you want pre-commit AI feedback.                                                                                                                                                                                                                                                                                                                                                                                           |
| Trivy                                         | Container scanning; not yet relevant — Lucky deploys via Docker but Socket + GitHub Dependabot already handle node deps                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **LucidShark**                                | CLI-first local SAST + linting, Apache 2.0. Strong privacy story but overlaps with Semgrep + GitGuardian; deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Tabby**                                     | Self-hosted Copilot alternative with repo-context indexing; primarily a code-completion tool, not a PR reviewer. Out of scope here.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **SonarQube Community Edition (self-hosted)** | SonarCloud already gives us the quality gate without ops burden. The 2026 "AI CodeFix" feature in CE is interesting but not enough to justify hosting.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **CodeFactor / Aikido**                       | Free-for-OSS SaaS; overlap with SonarCloud + Socket. No clear marginal value.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

The broader Forge-Space-era audit (2026-03-07) compared 20+ free OSS reviewers
and recorded the rejection rationale per tool; that audit lives in private
maintainer notes and is summarized in the table above.

## cubic — configuration (dashboard, not in-repo)

cubic has **no repo config file** (unlike the retired `.coderabbit.yaml`).
Custom rules live in the cubic dashboard → **Rules library** (plain-English
descriptions, optional glob path filters, **max 5 enabled per repo**). cubic
can also **import Cursor rules** via "Sync Cursor Rules" if `.cursor/rules/`
files are added later.

**Triggering a review:** comment `@cubic-dev-ai review` on the PR. cubic also
auto-reviews new PRs once installed.

**Recommended custom rules** (translated from the retired `.coderabbit.yaml`
intent — paste these into the dashboard):

1. **Skip generated/lock artifacts** — path filter excluding
   `**/package-lock.json`, `**/dist/**`, `**/build/**`, `**/generated/**`,
   `**/__generated__/**`, `**/*.snap`, `**/CHANGELOG.md`. cubic shouldn't
   review machine-generated or policy files.
2. **Don't block on style/opinion** — "Only raise findings for substantive
   correctness, security, or production-risk issues. Do not request changes
   for naming, formatting, or stylistic preferences — SonarCloud + ESLint +
   Prettier already gate those." (cubic's low-FP default mostly does this; the
   rule reinforces it.)
3. **Flag silent failures** — "Flag empty catch blocks, swallowed promise
   rejections, and `.catch(() => {})` that hide errors instead of logging
   them." (Recurring Lucky bug class — see issues #1159/#1160.)
4. **Flag non-atomic read-modify-write on Prisma** — "Flag DB read → compute →
   write sequences on the same row that aren't wrapped in `$transaction` or
   using an atomic `increment`/`upsert` — they're lost-update races." (See
   #1153/#1163.)
5. **Flag cross-file intent gaps** — "When a change adds validation, a guard,
   or a convention to one handler/route, check sibling handlers/routes for the
   same gap." (See #1158 — validated one route file, missed another.)

## Maintenance

- **Danger.js version** (2026-07-01): upgraded central workflow to danger@^13 + node 20
  to fix Node 24 incompatibility (node-fetch v2 → undici WHATWG fetch). See
  `LucasSantana-Dev/.github/.github/workflows/danger.yml` for the pinned version.
  TODO: revert node pin to 22+ after danger@14+ ships and is stable (≥2 weeks wild).
- Re-evaluate Greptile if they introduce per-org pricing
- Tune cubic's custom rules in the dashboard if it proves too quiet/noisy;
  watch the revisit triggers in ADR `2026-05-21-replace-plan-limited-review-tools.md`
- Update the centralized Claude review prompt in `LucasSantana-Dev/.github`
  (`.github/workflows/claude-review.yml`, referenced by
  `.github/workflows/review-tools.yml@v1`) when the `workflow.md` merge rule
  evolves — that's the single source of truth for the review prompt
- `dangerfile.ts` is the place to encode any new convention that humans keep
  forgetting — cheaper than re-asking AI bots to remember it

## Reality check on AI reviewers

Even the best AI reviewers (Claude, cubic, Qodo/PR-Agent, Greptile) hallucinate and miss subtle logic bugs. Treat them as **extra reviewers**, not human replacements. The merge rule's "code review tools approved" clause is necessary but not sufficient — a substantive concern from any source (human, bot, or your own gut) still outranks a green checkmark.
