# ADR: Lucky OSS Positioning — Portfolio + Reference Implementation

**Date:** 2026-05-23  
**Status:** Accepted

---

## Context

Lucky has been public on GitHub since its early development. The question arose whether to invest in becoming an actively-maintained open-source project (community contributions, governance, issue curation) or to lean into its actual nature: a solo personal portfolio project that is also useful as a self-hosted Discord bot.

Factors:

- Zero external contributors to date
- Active personal feature roadmap (Guild Automation, autoplay engine, telemetry)
- 20+ ADRs documenting real engineering decisions — the primary hiring/portfolio differentiator
- `SECURITY.md` absent despite being referenced in `CONTRIBUTING.md`
- `.github/copilot-instructions.md` (3,357 lines, auto-generated, internal architecture) was publicly indexed on GitHub — OpSec leak
- README lacked solo-maintenance framing, leaving implicit expectations for responsiveness

## Decision

**Option C: Portfolio + Reference Implementation with ADR-First Positioning**

Lucky is positioned as a solo personal project that is open-source for learning and self-hosting — not an actively-maintained community project. Visitors should understand this immediately from the README.

Changes made under this ADR:

1. **Removed `.github/copilot-instructions.md` from tracking** — added to `.gitignore` to prevent re-indexing if the generator re-runs
2. **Created `SECURITY.md`** — responsible disclosure via private GitHub advisory; 48h acknowledgement SLA; latest-version-only support
3. **Added solo-maintenance paragraph to README** ("Maintenance model" under Why Lucky?) — sets accurate expectations upfront
4. **Added "Reliability" section to README** — surfaces CI badge, Trivy, Dependabot, Sentry as evidence for "production-grade" claims
5. **Added "Decision Log" section to README** — makes the 20+ ADRs discoverable; the primary differentiator for portfolio evaluators
6. **Added GitHub repository topics** — `discord-bot`, `self-hosted`, `typescript`, `nodejs`, `monorepo`, `music-bot`, `discord`

## Alternatives Considered

**Option A: Active Open-Source**  
Invest in contributor infrastructure (devcontainer, CODE_OF_CONDUCT, issue curation, project board, Discussions). Rejected: no existing contributor demand, adds governance overhead with zero near-term ROI, conflicts with active personal feature roadmap that would need constant triage.

**Option B: Status Quo**  
Keep README as-is, no explicit positioning. Rejected: creates ambiguous expectations; visitors can't determine whether to file issues expecting responses; doesn't surface ADR differentiator.

**Option D: Private Repository**  
Make Lucky private. Rejected: removes portfolio signal entirely; self-hosters lose access; no upside.

## Consequences

**Positive:**

- Accurate contributor expectations — no implicit SLA commitment
- OpSec: internal dependency graphs no longer indexed by GitHub
- ADRs are now the first thing a portfolio evaluator sees in the Documentation section
- SECURITY.md satisfies GitHub Community Standards

**Negative:**

- Explicit "solo" framing may reduce perceived community health signal for casual visitors

**Neutral:**

- `CONTRIBUTING.md` retains maintainer-internal detail (worktree paths, CI recipes); acceptable since it targets people who'd fork and adapt, not external contributors

## Deferred

- `CODE_OF_CONDUCT.md` — deferred; no community interactions requiring it
- GitHub Discussions — deferred; no use case
- `CONTRIBUTING.md` cleanup (remove internal ops detail) — acceptable risk, revisit if external fork activity increases
- devcontainer — deferred; local setup is straightforward for self-hosters

## Revisit When

- First external contributor opens a PR that merges — re-evaluate active OSS overhead
- Bot listed on top-tier directory (top.gg featured) — revisit community tooling investment
- Someone files an issue reporting CONTRIBUTING.md is confusing to external contributors
