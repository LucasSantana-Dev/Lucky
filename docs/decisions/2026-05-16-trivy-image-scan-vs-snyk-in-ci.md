# 2026-05-16 — Image scanning in CI: extend Trivy, keep Snyk for dashboard only

## Status

Accepted (decision). Triggered by Snyk audit on 2026-05-15 surfacing 3 critical + 11 high CVEs in `lucky-nginx` and `lucky-frontend` images that the existing CI security stack had missed.

## Context

The reusable `LucasSantana-Dev/.github/.github/workflows/quality.yml` runs Trivy with:

```yaml
scan-type: fs
severity: CRITICAL,HIGH
ignore-unfixed: true
exit-code: '0'
```

Three structural gaps in this configuration:

1. **`scan-type: fs`** — filesystem scan only. Does not analyze built container images. Misses base-image OS package vulnerabilities (Alpine, Debian-slim, etc.).
2. **`exit-code: "0"`** — Trivy never fails CI. Findings go to the GitHub Security tab as advisory-only and stay there forever.
3. **`severity: CRITICAL,HIGH`** with no image-scan — the threshold is fine; the surface is wrong.

Concrete impact: Snyk's GitHub App (already installed, scanning daily) surfaced 3 critical + 11 high Alpine 3.21 OS package CVEs in the nginx-based images. None of these were visible in Lucky's CI; they only appeared on the Snyk dashboard. PR #881 fixed them via `apk upgrade --no-cache`.

The question:

> Should we add Snyk to CI, fix the existing Trivy config, or both?

## Research

### Options considered (Phase 1)

| Option                                                         | Wiring                                                                                 | Coverage                                               | Cost                                                                  | Blast radius                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------- |
| **A. Fix Trivy in the org reusable**                           | Add `scan-type: image` to `quality.yml`                                                | OS + lang deps                                         | Free                                                                  | Affects 8+ caller repos at once; not all build images |
| **B. Add Snyk-in-CI**                                          | `SNYK_TOKEN` secret + `snyk/actions` per caller                                        | OS + lang deps + nicer fix-PR UX                       | Free 200 tests/mo per org → ~480 estimated monthly use across 8 repos | High; per-caller wiring                               |
| **C. Extend Trivy per-repo + keep Snyk's GitHub App** (chosen) | New `trivy-image` step in Lucky's `docker-publish.yml`; no org changes; no Snyk wiring | OS + lang deps in CI + Snyk dashboard async monitoring | Free                                                                  | Lucky only; opt-in template for other repos later     |

### Critique (Phase 2)

The `critic` agent flagged three concerns, all accepted:

1. **Image-scan placement** — should NOT be mandated in the org reusable because caller repos are heterogeneous (some don't build images). **Accepted:** Lucky-specific in `docker-publish.yml`; opt-in template for others.
2. **Severity threshold + blocking rollout** — flipping `exit-code: 1` immediately will block PRs that previously merged green on transitive vuln noise. **Accepted:** audit-only first (exit-code 0, MEDIUM+), 2-week observation, then promote to blocking on HIGH+CRITICAL only.
3. **Snyk free-tier risk** — Snyk has changed free-tier limits before. If the GitHub App's free monitoring sunsets, Lucky loses dashboard visibility. **Accepted:** quarterly check as a revisit trigger; Trivy image-scan becomes the blocking fallback if Snyk app monitoring disappears.

### Why not Option B (Snyk-in-CI)

Estimated monthly quota use: 8 repos × ~4 PRs/week × (npm test + container test) ≈ 480 test runs/month. Free tier caps at 200/month org-wide. Would either exhaust quota or require paid plan. Snyk's GitHub App scans daily for free and already covers monitoring — there's no marginal value to adding it to CI right now.

## Decision

1. **Add `trivy-action` image-scan to Lucky's `docker-publish.yml`** — runs against newly-built images before push, so the scan cost is tied to actual publish events (not every PR).

2. **Sequenced rollout:**
    - **Phase A (this ADR):** Audit-only — `severity: MEDIUM,HIGH,CRITICAL`, `exit-code: "0"`, `ignore-unfixed: true`. Findings go to GitHub Security tab + workflow logs. No CI blocking.
    - **Phase B (≥ 2 weeks after Phase A):** Promote to blocking — `severity: HIGH,CRITICAL`, `exit-code: "1"`, only after the baseline is clean (no open HIGH/CRITICAL findings on `release/v2.12.0`).
    - **Phase C (after Lucky's rollout proves stable):** Extract the trivy-image step into `LucasSantana-Dev/.github/templates/trivy-image.yml` as an opt-in snippet for other repos that build images.

3. **Do NOT add Snyk to CI.** The Snyk GitHub App already provides daily dashboard monitoring for free. Adding `snyk` CLI to CI duplicates Trivy's coverage and burns a free-tier quota that won't last 8 repos.

4. **Do NOT touch the org reusable `quality.yml`.** Its current `scan-type: fs` job remains as-is for filesystem-level findings (config files, IaC, etc.). Image scanning is per-repo because caller repos are heterogeneous.

## Consequences

### Positive

- Image-layer CVEs (the Alpine OS package class, the kind that hit PR #881) get caught at build time, before publish.
- Snyk dashboard view preserved at zero CI cost.
- Org reusable workflow stays small and applicable to all caller repos.
- 2-week audit period prevents the 8-repo CI-noise risk.

### Negative

- Slower iteration on findings: trivy-image runs only on `docker-publish` events, not every PR. Snyk dashboard remains the daily monitor.
- Two scanners (Trivy + Snyk) with overlapping coverage. Triage logic: Snyk dashboard for prioritization, Trivy CI for blocking on the next publish.
- Per-repo template (Phase C) means future caller repos need explicit opt-in.

### Neutral

- The reusable `quality.yml`'s existing `scan-type: fs` Trivy job is left as-is. Findings from it continue to land in the GitHub Security tab as advisory.

## Revisit when

- **Snyk free tier changes** — if the GitHub App's free monitoring caps drop below 2 scans/repo/month, or if the app sunsets entirely. Re-evaluate whether Trivy image-scan needs to become the only source of truth (and whether paid Snyk is worth it for fix-PR UX).
- **Headcount hits 3+ sustained contributors AND PR cadence jumps to 20+/week** — Snyk-in-CI's free tier still won't fit, but the case for paid Snyk strengthens because fix-PR UX scales better than Trivy's "here's the finding, you fix it" model.
- **A CRITICAL ships to production despite the trivy-image gate** — investigate whether the gate config was bypassed, whether the scanner missed the CVE, or whether the rollout phase was still in audit mode.
- **Quarterly (2026-08-16, 2026-11-16, 2027-02-16):** check Snyk's free-tier ToS changes.

## Alternatives rejected (summary)

- **Fix Trivy in org reusable** — wrong shape; image scanning is per-repo, not org-wide.
- **Snyk-in-CI** — burns the 200/month free quota across 8 repos; duplicates Trivy's coverage without a clear value-add given the Snyk GitHub App already provides dashboard monitoring for free.
- **Drop Snyk entirely** — loses the dashboard view, the fix-PR UX, and the daily async monitoring. No upside.

## Implementation pointer

Next concrete step is a follow-up PR adding a `trivy-image` job to `.github/workflows/docker-publish.yml`. Reference config (audit-only):

```yaml
- uses: aquasecurity/trivy-action@v0.36.0
  with:
      image-ref: ${{ steps.meta.outputs.tags }}
      format: sarif
      output: trivy-image.sarif
      severity: MEDIUM,HIGH,CRITICAL
      ignore-unfixed: true
      exit-code: '0' # Phase A — audit only
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
      sarif_file: trivy-image.sarif
      category: trivy-image
```

Promote `exit-code` to `'1'` and drop MEDIUM from the severity list when entering Phase B.

## Related

- PR #881 (Lucky) — fixed the 3C + 11H Alpine CVEs that triggered this ADR.
- ADR [[2026-05-15-no-ai-generated-docs-in-tracked-state]] — same-week repo-hygiene decision; similar shape (mechanical enforcement + ADR + revisit triggers).
- Org reusable workflow `LucasSantana-Dev/.github/.github/workflows/quality.yml` — left unchanged by this ADR; its existing `scan-type: fs` Trivy job is intentionally preserved.
