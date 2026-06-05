# ADR 2026-05-21 — DiscordWriteAdapter port for Module Executors

**Status:** Accepted (design only; implementation pending)
**Context-Pack:** `CONTEXT.md` → "DiscordWriteAdapter"
**Supersedes:** none
**Strengthens:** [`2026-05-20-guild-automation-executor-composition.md`][exec-comp], [`2026-05-20-guild-automation-executor-partial-failure.md`][partial-fail]

[exec-comp]: ./2026-05-20-guild-automation-executor-composition.md
[partial-fail]: ./2026-05-20-guild-automation-executor-partial-failure.md

## Context

Guild Automation has two orchestrators — the bot (in-process) and the backend (REST). Both construct Module Executors and need to mutate live Discord state (create/edit/delete roles, channels; assign member roles; PATCH onboarding settings).

Today:

- The backend has a private `discordRequest()` helper inside `GuildAutomationExecutionService.ts:354-389` — single fetch + bot-token entry point, but not a port, not exported, not testable in isolation.
- The bot calls `guild.roles.create()` / `guild.channels.create()` / etc. directly at `packages/bot/src/utils/guildAutomation/applyPlan.ts:138,163` and in `serversetup.ts`. No central Seam.

The composition ADR (`2026-05-20-guild-automation-executor-composition`) settled that Module Executors are constructed at orchestrator roots, not as shared singletons. With Onboarding (PR #4), Channels (PR #5), Roles (PR #6) executors landing next, each new executor will reach for whichever Discord client is in scope unless a port exists first. Three executors built without a shared port = three subtly different Discord-write shapes to migrate later.

## Decision

Define a **DiscordWriteAdapter** port at `packages/shared/src/services/guildAutomation/ports/discordWrite.ts`. Two Adapters implement it:

- `DiscordJsWriteAdapter` — bot orchestrator, wraps the in-process `discord.js` Client.
- `DiscordRestWriteAdapter` — backend orchestrator, wraps `fetch` + bot token (extracted from the existing private `discordRequest()` helper).

Module Executor factories take the Adapter as a parameter. Orchestrator composition roots build the right Adapter and pass it in.

### Port shape (v1)

8 methods, monolithic single Interface:

- `createRole(guildId, roleSpec)` → `Role`
- `editRole(guildId, roleId, patch)` → `Role`
- `deleteRole(guildId, roleId)` → `void`
- `createChannel(guildId, channelSpec)` → `Channel`
- `editChannel(guildId, channelId, patch)` → `Channel`
- `deleteChannel(guildId, channelId)` → `void`
- `assignMemberRole(guildId, userId, roleId)` → `void`
- `removeMemberRole(guildId, userId, roleId)` → `void`
- `updateOnboarding(guildId, onboardingPatch)` → `OnboardingSettings`

Methods return **normalised internal types** from `packages/shared/src/services/guildAutomation/types.ts`. Adapters project from `APIRole` / `Role` / their native response shapes; executors never see Discord-native types through this Seam.

### Errors

All methods throw `DiscordWriteError`:

```ts
class DiscordWriteError extends Error {
    code:
        | 'NOT_FOUND'
        | 'FORBIDDEN'
        | 'RATE_LIMITED'
        | 'INVALID'
        | 'TRANSPORT'
        | 'UNKNOWN'
    retryable: boolean
    retryAfterMs?: number // present iff code === 'RATE_LIMITED'
    cause?: unknown // original Discord error preserved
}
```

Adapters translate native errors (`DiscordAPIError`, `GuildAutomationExecutionError`, HTTP 5xx) to this shape.

### Idempotency

The Adapter is a **pass-through**. It does NOT lookup-or-create. Callers (the orchestrator) handle retries through the Drift residual diff (per [`2026-05-20-guild-automation-drift-persistence`][drift]).

[drift]: ./2026-05-20-guild-automation-drift-persistence.md

### Rate limits

The Adapter does NOT absorb 429s. It throws `DiscordWriteError { code: 'RATE_LIMITED', retryable: true, retryAfterMs }`. Caller decides (in line with the partial-failure ADR's best-effort posture). discord.js's transparent rate-limit queue is treated as an implementation detail of `DiscordJsWriteAdapter` and surfaces only the final outcome.

### Tests

- **Contract suite** at `packages/shared/src/services/guildAutomation/ports/__tests__/discordWrite.contract.spec.ts` — parametric describe that runs the same ~12 assertions against both Adapters with mocked Discord backends. Encodes the port's invariants.
- **Canary impl tests** per Adapter — one each — for impl-specific quirks: discord.js's auto-queue behaviour; REST's 429 response shape.

## Consequences

### Positive

- Each Module Executor gets the same Adapter parameter signature → uniform factory shape across all 7 executors.
- Executor unit tests become pure: inject a stub Adapter, assert ops + normalised return values. No Discord API mocking.
- Switching the bot off `discord.js` (e.g. to a thinner client) or the backend off raw `fetch` (e.g. to `@discordjs/rest`) is a single-Adapter change.
- Backend's existing `discordRequest()` becomes the Implementation of `DiscordRestWriteAdapter` with minimal behavioural change — extraction, not rewrite.

### Negative

- Two ports of code to keep aligned (`DiscordJsWriteAdapter`, `DiscordRestWriteAdapter`) when v2 methods are added. Mitigated by the contract suite.
- Normalised return types add a mapping layer. Acceptable: Lucky already has the internal types in `packages/shared/src/services/guildAutomation/types.ts`.
- Pass-through idempotency means the orchestrator does more retry bookkeeping. Acceptable: the drift-persistence ADR already commits to that posture.

### Trade-offs explicitly rejected

- **Federated per-domain ports** (`RoleAdapter`, `ChannelAdapter`, …): adds wiring without removing coupling — every executor would import 2-3 narrow ports instead of one wide one. Federation was already chosen at the Module Executor layer; doubling it at the Adapter layer is over-design.
- **Adapter-managed idempotency**: hides Discord semantics behind heuristic name-lookup. Subtle bugs ("this role isn't the one I made") outweigh the convenience.
- **Rate-limit absorption in the port**: would require backend bucket tracking. Real engineering work that the partial-failure model already finesses.
- **Raw-Discord-objects through the seam**: each executor would branch on which shape came back. Violates the Seam.

## Implementation plan

A separate PR — not landed with this ADR. Sequence:

1. **PR A — port + DiscordWriteError + contract test scaffold + `DiscordRestWriteAdapter` (extracted from `discordRequest()`).** Wire the existing backend `GuildAutomationExecutionService.applyAutoMessages` (already in-flight on PR #906) through the new Adapter. Backend behaviour unchanged.
2. **PR B — `DiscordJsWriteAdapter`** in `packages/bot/src/services/guildAutomation/discordJsWriteAdapter.ts`. Wire the bot's existing `applyPlan.ts` Discord-direct calls through it. Bot behaviour unchanged.
3. **PR C-E (one per executor)** — Onboarding, Channels, Roles executors built on top of the established port. Issue tickets #4-#6 in the Guild Automation roadmap.

## Revisit triggers

- v1 port stays at 8 methods for >3 months → broaden to v2 by accreting methods, not by re-shaping.
- A second non-Discord write target appears (e.g. Slack export) → reconsider the "Discord" naming; the underlying pattern is "platform write adapter."
- Contract suite catches a divergence between Adapters more than twice → consider tightening the port further (stricter normalised return types).
- The pass-through idempotency consistently causes orchestrator retry storms → revisit and consider Adapter-managed idempotency for specific ops (likely `createRole` first).

## Related artefacts

- `CONTEXT.md` — Domain Context section "Guild Automation" + the DiscordWriteAdapter entry under Cross-cutting.
- Memory: `~/.claude/projects/-Volumes-External-HD-Desenvolvimento-Lucky/memory/project_executor_composition_2026-05-20.md`, `project_executor_port_pattern_2026-05-20.md`.
- PR #906 — first executor (AutoMessages) currently lives without the port. The PR-A migration above pulls it through.
