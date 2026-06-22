# Validation Gate for Destructive / Irreversible Discord Interactions

- Date: 2026-06-21
- Status: accepted
- Deciders: Lucas Santana
- Extends: `decisions/2026-05-14-discord-integration-testing-strategy.md`
- Trigger: `decisions/2026-06-21-move-message-context-menu.md` (first irreversible interaction)

## Context

Lucky's bot suite is 100% unit tests with discord.js mocked at the boundary; no
test exercises a real gateway. The new "Move message" command reposts a message
then **deletes the original** — irreversible. Unit tests + the full suite (2612)

- CI (type:check, eslint, jest, madge, docker smoke) are green, but the
  right-click→pick→repost→delete path has never run against real Discord.

ADR 2026-05-14 already **deferred** in-CI gateway integration tests (flaky voice
UDP/rate-limits, bot-token-in-CI supply-chain risk; discord.js maintainers don't
do it either). That decision stands and is not reversed here. It covered the
**voice/music** class, whose worst case (playback fails) is fully recoverable.

This decision covers a different class: **irreversible data mutations**. The core
asymmetry — **rollback restores code, not data**. A wrongly deleted/moved message
is gone; post-deploy rollback cannot undo it. So "ship then verify" is unsafe for
this class in a way it is not for voice/music.

Verified facts:

- Prod deploy is release-gated (`release:published`); releases are cut manually.
  Active-rollback + post-deploy smoke checks (auth/OAuth) + a queueresolver-canary
  workflow already exist.
- `docs/runbooks/hotfix.md` exists but is a command runbook, **not** a followed
  smoke-checklist — there is no current enforced verification habit to lean on.
- The PR template (`.github/PULL_REQUEST_TEMPLATE.md`) has a generic checklist but
  **no destructive-interaction / smoke item**.
- The real destructive-Discord surface is small and concentrated: `members.ban`,
  `members.kick`, `channel.bulkDelete`, `member.timeout` (mute/unmute), and
  message `.delete()` — in `functions/moderation/` plus the new move handler.
  (discord-player `queue.delete()` is unrelated.) The existing mod commands
  shipped **before** any such gate — this control is new.

This decision was challenged by `decision-critic` (verdict: NEEDS_REVISION). Its
load-bearing objection — an honor-system release checklist "predicts its own
failure" (skipped under time pressure) and has no teeth — is incorporated: the
gate below is **enforced at merge by tooling**, not by operator memory.

## Decision

A **tiered, blast-radius-keyed** validation gate. Do **not** add automated gateway
tests (consistent with 2026-05-14).

**Tier A — destructive / irreversible interactions** (message delete or move,
ban, kick, `bulkDelete`/purge, timeout, channel/role removal):

1. **Unit tests** must cover every guard branch (permission checks, target-gone,
   dest==source, partial-failure). These verify _our_ control flow only — against
   mocks they cannot confirm real Discord behavior, so they are necessary but not
   sufficient.
2. **A live on-guild smoke test** of the happy path **and** the guard paths,
   performed by the operator before merge. For Tier A the live run is the
   _first real contact_ with Discord-side behavior, not mere confirmation.
3. **Enforced at merge** (the critic's "teeth"): the PR template gains a
   Destructive-Interaction block with a `[ ] Live smoke performed (evidence
attached)` attestation, and a lightweight CI check (`destructive-interaction-gate`)
   scans the **diff** for a tight allowlist of irreversible Discord API calls. If
   any are added and the attestation is unticked (and no `non-destructive-confirmed`
   label + justification is present), the check fails. This is a diff/metadata
   audit, **not** a gateway test — fully consistent with 2026-05-14.
4. **Pre-release audit** (defense in depth): the release checklist confirms every
   Tier-A PR in the release carries an attestation.

**Tier B — non-destructive interactions** (read-only, ephemeral replies,
reversible writes): merge + ship on unit + CI green. Post-deploy observation only;
existing canary + fast-rollback suffice because the effects are recoverable.

## Alternatives considered

- **Unit + CI green only (status quo):** rejected for Tier A — a destructive bug
  reaches prod with zero live verification and is irreversible.
- **Honor-system release checklist (no automation):** rejected per critic — relies
  on the operator remembering and not skipping under pressure; the artifact itself
  predicted it would be skipped. No teeth.
- **Mandatory pre-merge manual smoke with no enforcement:** rejected — same
  enforceability gap; nothing blocks a forgotten smoke.
- **Automated gateway integration test in CI:** rejected — contradicts 2026-05-14
  (flaky + secret risk); destructive paths are the hardest to trigger reliably.
- **Post-deploy canary + fast rollback only:** rejected for Tier A — rollback
  restores code, not deleted data. Retained for Tier B.

## Consequences

Positive:

- The gate is enforced by a required CI check at merge — the point of highest
  operator attention — instead of relying on memory at release time.
- Detection is a cheap diff audit; no new secrets, bots, or test guilds in CI.
- The destructive surface is small and concentrated, so false positives are
  manageable with tight patterns.

Negative / risks:

- The CI allowlist needs maintenance; a novel destructive API not in the list
  slips through (mitigated: review + the pre-release audit as backstop).
- A live smoke on the operator's guild may not mirror prod permission state (a
  perm-cache race between smoke and prod is uncovered). Accepted residual risk;
  revisit triggers cover repeat incidents.
- The operator must have a guild to smoke-test in. Feasible today (operator runs
  the bot); no formal staging guild — see revisit.

Neutral:

- Existing moderation commands predate this gate; they are grandfathered, not
  retroactively re-smoked, unless modified.

## Adoption plan / pilot

1. Pilot = the **Move message** PR (the first Tier-A change): perform the live
   smoke (happy + guard paths), attach evidence, tick the attestation.
2. Add the Destructive-Interaction block to `.github/PULL_REQUEST_TEMPLATE.md`.
3. Add the `destructive-interaction-gate` CI check (diff-grep allowlist +
   attestation requirement) and mark it required on protected branches.
4. Add the pre-release audit line to the release checklist / `hotfix.md`.

## Revisit when

- A Tier-A interaction causes an irreversible data incident despite the gate →
  require a second reviewer's independent smoke, or move to a **soft-delete /
  confirm-before-destroy** design (e.g. move = repost then prompt to confirm
  deletion) so the dangerous step is reversible.
- The CI gate produces frequent false positives (developers routinely add the
  `non-destructive-confirmed` override) → tighten the allowlist or scope it to
  `functions/moderation/`.
- A novel destructive API slips past the allowlist into prod → expand patterns;
  treat as a gap, not a one-off.
- A maintained discord.js v14 interaction-test harness reaches stable release →
  reconsider automating the Tier-A happy-path (re-checks 2026-05-14 too).
- A formal staging guild is provisioned → consider an automated post-deploy
  smoke (the 2026-05-14 deferred option) as additional defense in depth.
