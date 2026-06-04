# ADR 2026-05-21 — Replace plan-limited PR review tools

**Status:** Accepted
**Context-Pack:** Session 2026-05-21 (4 ship-attempts on PRs #905/#913/#914/#915/#916 hit the same plan caps)
**Supersedes:** none
**Related:** [`2026-05-16-dependabot-batch-handling-policy`][dep]

[dep]: ./2026-05-16-dependabot-batch-handling-policy.md

## Context

Lucky's `release/v2.12.0` PR pipeline runs ~18 checks. On 2026-05-21 a 4-PR ship attempt surfaced that three of those checks are plan-capped and were silently failing:

- **Snyk** (`code/snyk`) — `Code test limit reached` on every PR. Free tier is 200 tests/mo, exhausted.
- **Greptile** (`greptile-apps`) — every review body says `Your free trial has ended.` since at least early May.
- **CodeRabbit** (Pro) — works, but has per-request caps that have started to surface as `Review skipped` on quick-fire PRs.

Meanwhile two AI-review actions already work and have **no** per-PR cap (just token spend on an Anthropic key the project already pays for):

- **`Codium-ai/pr-agent`** in `.github/workflows/pr-agent.yml` — pinned action, Anthropic backend (`claude-sonnet-4-6`), `auto_review` + `auto_describe` + `auto_improve` all on. This is the "AI Code Review" check that consistently passes.
- **`LucasSantana-Dev/.github/.github/workflows/claude-review.yml@v1`** reusable workflow, called from `review-tools.yml`.

Plus a healthy free baseline that already covers most non-AI signals:

- **CodeQL** (GitHub-native SAST)
- **Semgrep OSS** (pattern-based SAST)
- **Trivy** (container + IaC + filesystem scan)
- **Socket Security** (supply-chain + new-dep alerts)
- **GitGuardian** (secrets)
- **SonarCloud** (code quality + coverage gate)

The mismatch: paying for and CI-gating on plan-limited tools (Snyk, Greptile, CodeRabbit) when the same coverage exists in tools that are free or already-paid-for at the LLM-token level.

## Decision

**Uninstall** plan-limited tools that have working free or already-paid equivalents:

1. **Snyk app** — uninstall the GitHub App. Drop `code/snyk` from required-check status. Replace its specific role (transitive dep-CVE pre-merge gate) with **OSV-Scanner**.
2. **Greptile app** — uninstall. PR-Agent + claude-review already provide AI review.
3. **CodeRabbit Pro** — downgrade subscription, uninstall the bot. PR-Agent + claude-review cover the AI-review surface. SonarCloud + Semgrep + CodeQL cover the linter-style nits.

**Adopt** one new check:

- **OSV-Scanner** — Google's official scanner against the OSV.dev database. GitHub-Action recipe at `google/osv-scanner-action`. Free, no plan limits, scans `package-lock.json` (+ workspace lockfiles) and emits SARIF. Runs in <30s. Added as a non-blocking job initially; promoted to required after 1 week of clean signal.

**Keep, no change:**

- PR-Agent (Anthropic-backed, the workhorse)
- claude-review reusable
- CodeQL, Semgrep OSS, Trivy, Socket Security, GitGuardian, SonarCloud

## Alternatives considered

- **`anthropics/claude-code-action`** — official Anthropic GitHub Action for AI code review. **Rejected:** PR-Agent already does the same job with the same Anthropic key; adding `claude-code-action` produces duplicate inline comments. If PR-Agent goes unmaintained, this becomes the replacement, not an addition.
- **PR-Agent (open source) + drop everything else AI** — would be the right call if claude-review (org reusable) didn't already exist and provide a different angle (whole-PR narrative vs PR-Agent's inline comments). Today both are cheap to run; keep both.
- **GitHub Copilot Code Review** — paid + Microsoft-only LLM. Costs more than the Anthropic spend on PR-Agent. No quality advantage observed.
- **Cursor BugBot** — free preview, future pricing opaque. Adoption locks into another tool with future plan-cap risk — exactly what this ADR is undoing.
- **Self-rolled `gh api` + `curl` to Anthropic** — possible, but PR-Agent already encapsulates the prompt engineering and the comment-posting workflow. Reinvention without benefit.
- **Keep Snyk on paid tier** — ~$25/user/month. Trivy + OSV-Scanner combined cover the same surface for $0. The only Snyk-only feature Lucky used is the inline remediation hint on PR comments; OSV-Scanner SARIF output rendered in the GitHub UI is good enough.
- **Trivy fs scan instead of OSV-Scanner** — Trivy already runs but its dep-mode signal is noisier (also reports IaC + container findings inline). OSV-Scanner is the focused, single-purpose tool for the specific role Snyk filled.

## Consequences

### Positive

- ~$360-600/year saved (CodeRabbit Pro) + ~$300/year saved (Snyk paid tier never adopted).
- Anthropic API token cost for PR-Agent: ~$1-2/year at 50 PRs × ~7k tokens/review (Sonnet 4.6 pricing). Negligible.
- One PR-Agent + one claude-review = two distinct AI-review angles per PR, both unlimited.
- OSV-Scanner is a single binary; faster than Snyk in CI (sub-30s vs 1-2 min).
- Removes three "flaky non-blocking failures" from the per-PR CI noise floor — every PR this session had Snyk + Greptile reds that had to be mentally filtered.

### Negative

- Snyk's "remediation hint" UX is lost. OSV-Scanner output is bare-bones (CVE id + path + fixed-version). Mitigated by Renovate/Dependabot already proposing the upgrade.
- CodeRabbit's quick mechanical style nits go away. Mitigated by SonarCloud + Semgrep + PR-Agent's `auto_improve` already covering style.
- All AI review now depends on **one** Anthropic API key. If Anthropic outages or terms change, both PR-Agent and claude-review go dark together.
- OSV-Scanner may surface transitive CVEs that Snyk's free tier didn't flag (different DB granularity). Initial PRs post-adoption may see new alerts.

### Neutral

- Number of CI checks drops from ~18 to ~16. Cosmetic.
- `required_status_checks` branch protection rules in `release/**` need updating (remove `code/snyk`).

## Implementation plan

Pilot scope: one PR drains the change.

1. **Add OSV-Scanner workflow** at `.github/workflows/osv-scanner.yml` using `google/osv-scanner-action` pinned to a release SHA. Trigger on `pull_request` and `push` to `release/**`. Continue-on-error initially.
2. **Open a test PR** (a no-op CHANGELOG entry on a side branch) to confirm OSV-Scanner SARIF posts to the Security tab and inline comments render.
3. **After 1 week of clean OSV-Scanner signal**: flip to `continue-on-error: false`. Add to required-status-checks list on `release/**` branch protection.
4. **Uninstall** Snyk, Greptile, CodeRabbit GitHub Apps from the LucasSantana-Dev org.
5. **Remove** `code/snyk` from required-status-checks (branch protection on `main` + `release/**`).
6. **CHANGELOG** `[Unreleased] / ### Internal` entry: "ci: replace Snyk/Greptile/CodeRabbit (plan-limited) with OSV-Scanner; rely on existing PR-Agent + claude-review for AI review."

Rollback: re-install the apps, restore branch-protection check names. ~10 min.

## Revisit triggers

- **Anthropic key spend > $50/year for PR-Agent + claude-review combined.** Re-evaluate model tier or batch reviews.
- **OSV-Scanner false-positive rate > 3 alerts/week sustained for >2 weeks.** Suppress-list isn't keeping up; switch the gate to Trivy fs mode or accept Snyk's paid tier.
- **PR-Agent (Codium-ai) is abandoned or breaking-changes the action.** Migrate to `anthropics/claude-code-action` as drop-in replacement.
- **A team forms and code review needs human-style narrative review.** Consider CodeRabbit Team tier or buy Greptile.
- **GitHub Advanced Security becomes free for private repos** (would absorb most of CodeQL+Trivy+OSV signal natively).

## Update 2026-06-04 — retire CodeRabbit, adopt cubic (free on public repo)

The 2026-05-21 decision said to uninstall CodeRabbit but steps 4-5 were never executed — `.coderabbit.yaml` and the CodeRabbit App stayed live (it is not a required check, so it ran as advisory noise). This update closes that out and revisits the AI-review surface now that **Lucky is a public repository**.

**Context that changed the call:** cubic.dev's full codebase-aware reviewer is **free on public repositories** (its $40/$99 tiers are private-repo only). Its design goals — whole-codebase navigation + low false-positive rate — directly target the bug class that slipped recent sessions (cross-file intent gaps: validated `management.ts` but not `guilds.ts`; FK CUID-vs-snowflake mismatch; stale-test drift) and reduce the merge-thread noise that stalls the auto-merge pipeline.

**Decision:**

- **Retire CodeRabbit** — remove `.coderabbit.yaml` (this PR); uninstall the GitHub App (dashboard action).
- **Adopt cubic** (free on public repo) via its GitHub App as the codebase-aware AI reviewer.
- **Keep PR-Agent + claude-review** (both free) as the diff-scoped / narrative angles. Do not run more than is useful — after a 2-week cubic trial, evaluate dropping `claude-review` to avoid three overlapping AI reviewers.

**Why not qodo:** on a public repo, "free qodo" is PR-Agent (its Apache-2 OSS engine), which is already running. cubic is the option that adds a _new_ capability for $0.

**Revisit triggers (added):**

- cubic false-positive rate > 3/week sustained for 2 weeks → tune its plain-English rules or drop it.
- cubic introduces a paid gate for public repos → fall back to PR-Agent + claude-review only.
- Lucky goes private → cubic costs $40/dev/mo; re-evaluate vs PR-Agent-only.

## Related artefacts

- `.github/workflows/pr-agent.yml` (kept as primary AI reviewer)
- `.github/workflows/review-tools.yml` (claude-review reusable)
- This session's CI signal: PRs #905 / #913 / #914 / #915 / #916 — all show `code/snyk` and (some) `greptile-apps` as the only red checks on otherwise-green PRs.
