# Deploy status reporting: configure a homelab commit-status token (Option A)

- Status: accepted
- Date: 2026-06-14
- Issue: #1294

## Context

The Deploy-to-Homelab workflow (`.github/workflows/deploy.yml`) waits ~90s for the
homelab to post a `homelab-deploy` status, then logs
`::warning:: No homelab-deploy status after ~90s — GITHUB_DEPLOY_STATUS_TOKEN likely
not configured` and falls through to HTTP version-validation. The homelab never sets
`GITHUB_DEPLOY_STATUS_TOKEN`, so the status is never posted and every deploy "succeeds"
without it.

Verified wiring on `main`:

- `scripts/deploy.sh:341-350` `post_deploy_status()` POSTs to
  `https://api.github.com/repos/${GITHUB_REPO}/statuses/${DEPLOYED_SHA}` with
  `context:"homelab-deploy"` — a **commit status** — and no-ops when the token is
  empty (line 342). It is called on `pending` (line 532), `success`/`failure` via the
  exit trap (line 501), and **`failure` on auto-rollback** (line 438).
- The deploy runs **detached** (`scripts/deploy-wrapper.sh` → `nohup deploy.sh`), so
  the status callback is the only signal back to GitHub about deploy.sh's _final_
  state.
- The workflow job holds only `permissions: contents: read` (deploy.yml:19-20, 32-34)
  and, when a `homelab-deploy` status reports failure, hard-fails the run
  (deploy.yml:715, 732).

**The forcing input** (operator, 2026-06-14): _"How do you currently find out a deploy
failed, including a silent auto-rollback after the new SHA briefly validated?"_ →
**"I don't."** There is currently **no** deploy-failure awareness loop at all.

This makes the decisive failure mode concrete: deploy.sh restarts services with the
new SHA → version-validation observes the expected SHA and **passes** → post-restart
health checks fail → deploy.sh **auto-rolls back** to the previous SHA (line 438). The
Actions job has already moved past validation; the run goes green; the operator never
learns. Only a status posted _by the homelab after its detached work completes_
captures this.

## Decision

**Option A — configure `GITHUB_DEPLOY_STATUS_TOKEN` on the homelab**, scoped to
**Commit statuses: write** (fine-grained PAT on `LucasSantana-Dev/Lucky`) — classic
equivalent `repo:status`. No code change; the wiring is already correct.

This is chosen specifically because, with no other failure-awareness path, Option A is
the only option that turns a silent post-validation rollback into a **failed CI run**
(deploy.yml:715/732 `exit 1`), which triggers GitHub's **default email-on-failed-run**
to the repo owner — a zero-infrastructure notification path.

### Scope correction (important)

The issue #1294 triage comments recommend a token with **Deployments: write** /
classic `repo_deployment`. **That is wrong and would 403** — the API call is
`/repos/{repo}/statuses/{sha}` (a _commit status_), which needs **Commit statuses:
write** / `repo:status`, a different permission. Using the documented scope would make
this fix fail on the first deploy.

## Alternatives considered

- **A4 — post the status from the Actions side** using the built-in `GITHUB_TOKEN`
  (add `statuses: write` to the job). Rejected: the workflow can only assert what _it_
  validated (SHA match); it cannot observe the detached deploy.sh auto-rollback, so it
  would post a **false success** in exactly the failure mode the operator currently has
  no coverage for. It perpetuates the blind spot while _looking_ resolved. Zero
  credentials is its only real advantage, and it is moot when the operator has no
  alternate alert loop.
- **B — delete the callback wait + `post_deploy_status` entirely**, rely on
  version-validation only. Rejected: throws away working code, permanently forfeits the
  rollback signal and any GitHub deployment-history view, and leaves the operator blind.
- **C — demote the warning to `info`, keep the callback armed.** Rejected as the
  _resolution_ (it changes nothing observable), but acceptable as a temporary stopgap if
  the token is not set promptly. Not recorded as the decision.

## Consequences

- **Positive:** silent rollbacks become failed runs → default GitHub email reaches the
  operator; `homelab-deploy` statuses appear in the GitHub UI/API; no code change.
- **Negative:** a long-lived credential lives on the homelab. Blast radius is bounded —
  fine-grained, single repo, single permission (Commit statuses: write), revocable —
  and carries a ~2×/year rotation burden.
- **Neutral:** real deploy _verification_ is unchanged (version-validation was already
  authoritative); this only adds the _final-state_ signal and its notification.

## Revisit when

- The operator adopts a push-based deploy alert (Discord webhook / Sentry release
  health / a dedicated notifier). Once a non-CI failure path exists, **A4** (no
  credential) becomes competitive and the long-lived PAT may be retired.
- The deploy stops running detached (synchronous deploy.sh in the job) — then the
  Actions job can observe the final state directly and the homelab callback is
  redundant.
- Homelab secret management changes (e.g. a secrets manager) — re-evaluate storage.
