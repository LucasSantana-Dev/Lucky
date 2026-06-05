# ADR 2026-06-05 — Defer publishing the `similarity` util as a standalone npm package

**Status:** Accepted (decision: defer / keep internal)
**Surfaced by:** `/extract-package` scan → `/research-and-decide`

## Context

`packages/shared/src/utils/similarity.ts` is a zero-dependency, ~100-LOC, well-tested
string-similarity toolkit (`levenshteinDistance`, `levenshteinSimilarity` ratio,
`jaccardSimilarity`, `tokenOverlapRatio`). The `/extract-package` scan flagged it as the
repo's strongest "publishable" candidate: 0 internal-import coupling, 0 deps, and a real
npm gap — the popular incumbent `string-similarity` is deprecated (last publish ~37 months
ago) yet still pulls ~2M weekly downloads; alternatives are single-metric (`leven`,
`fast-levenshtein`) or heavy (`natural`). The question: publish it as standalone OSS, or
keep it internal to `@lucky/shared`?

## Decision

**Defer. Keep it internal to `@lucky/shared`.** Do not publish to npm now.

Rationale (the operator is solo):

- **Internal value is already captured** — it's a shared util used by 4 call sites; publishing adds zero value to Lucky's operation, only obligations.
- **Zero demonstrated external demand.** No second project asks for it. Publishing without external pull is tax-on-future-maintenance (semver discipline, security response, issue triage) against ~zero guaranteed upside.
- **The "2M downloads on the deprecated incumbent" is a vanity metric.** That inertia does not transfer to an unknown successor without marketing/SEO a solo operator won't do.
- **The public API isn't ready.** `tokenOverlapRatio` is a near-duplicate of `jaccardSimilarity` (the spec even asserts they're equal), and `levenshteinDistance` uses a full O(n·m) matrix (not the two-row O(min(n,m)) variant). Shipping these bakes smells into a forever-public surface.
- **Reversibility.** Deferring is free to reverse; a public name-claim-then-abandon damages the package and the operator's reputation. Asymmetric downside.

## Alternatives considered

- **Publish under a personal scope** (`@<user>/string-similarity`, best-effort/no-SLA) — rejected now: still a recurring support/semver obligation with no proven consumer. Becomes the path _if_ the revisit trigger fires.
- **Publish unscoped as the `string-similarity` successor** — rejected: claims "community standard" stewardship a solo operator can't credibly sustain; abandonment risk is reputationally worse than never claiming it.
- **Promote to a monorepo workspace package (unpublished)** — rejected as marginal: it already lives in a shared workspace package; no structural gain.
- **Contribute the multi-metric API upstream to a maintained lib** — not pursued; no obvious healthy host, and it's more coordination than value right now.

## Consequences

- **Positive:** no new maintenance surface; Lucky keeps full freedom to evolve the similarity API; the code stays where it's already deployed and tested.
- **Negative / watch:** the npm gap stays unfilled (acceptable — not the operator's problem to solve); if external interest ever appears it's reactive, not proactive.
- **Independent follow-up (not gated on this decision):** the internal API has a redundant `tokenOverlapRatio` (≡ `jaccardSimilarity`) and an unoptimized Levenshtein. Worth a small internal cleanup regardless of publishing — tracked separately, optional.

## Revisit when

- **A concrete second consumer materializes** — another project (yours or someone else's) explicitly needs this as a standalone dependency. Then publish under a personal scope (Option 2), but FIRST make it publish-ready: consolidate `tokenOverlapRatio` into `jaccardSimilarity`, optimize Levenshtein to two-row space, add a README + CHANGELOG, and commit to a bounded (e.g. 6-month) maintenance window before reassessing.
- Or if the operator deliberately wants a portfolio/OSS artifact and accepts the maintenance cost as a personal goal (different objective function than "ship Lucky").
