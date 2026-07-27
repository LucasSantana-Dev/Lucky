# Permission tier for channel-wide / role-wide reminders

- **Date:** 2026-07-12
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Scope:** `#1767` — expanding `/remind` beyond personal to channel-wide and role-wide
- **Method:** `/research-and-decide` — repo-evidence research → decision-critic
  (verdict NEEDS_REVISION) → reconcile → this ADR

## Context

`/remind` is gaining channel-wide (post to a channel) and role-wide (ping a whole
role) forms. Personal `/remind` has **no** permission gate today. The broadcast
forms have a larger blast radius — a role reminder can ping hundreds — so they need
a gate. The debate flagged the exact tier as an open product decision to confirm
against this repo's actual moderator-role conventions.

## Decision

- **Personal reminders:** unchanged — no gate.
- **Channel-wide reminders:** `setDefaultMemberPermissions(ManageGuild)`.
- **Role-wide reminders:** `setDefaultMemberPermissions(ManageGuild)`.

Uniform **ManageGuild** for both broadcast forms, enforced via
`setDefaultMemberPermissions` only (no additional runtime check — see below).

### Amendment (2026-07-12, implementation) — subcommand exception

The mechanism above (`setDefaultMemberPermissions` only) assumed the analogs'
**standalone-command** shape (`vaga`, `automessage`). But `#1767` ships the broadcast
forms as **subcommands** of the existing `/remind` (`channel`, `role`) alongside the
ungated personal `set`/`list`/`delete`. Discord's `setDefaultMemberPermissions` is
**command-level only** — it cannot gate individual subcommands — so applying it to
`/remind` would also gate personal reminders, violating "personal reminders keep their
zero-gate behavior".

Resolution: gate the `channel`/`role` subcommands with a runtime
`interaction.memberPermissions.has(ManageGuild)` check (`remind.ts`). This is **not** the
hardening layer alternative #4 rejected below (a non-overridable check added _on top of_
`setDefaultMemberPermissions`); it is the **sole feasible realization** of the ManageGuild
intent for a mixed-permission subcommand command. The "admin-overridable UI delegation"
consequence is structurally unavailable for subcommands regardless of mechanism, so nothing
the ADR promised is lost. **Documented convention exception:** a single command mixing
ungated and ManageGuild-gated subcommands uses a runtime `permissions.has()` check on the
gated subcommands; the `setDefaultMemberPermissions`-only rule remains the default for
standalone broadcast commands.

### Implementation requirements (non-negotiable)

- Role-wide reminders **must** send with per-message
  `allowedMentions: { roles: [roleId] }` — the established scoping in `vaga.ts:265`
  and `customCommandHandler.ts`. This restricts the ping to exactly the target role
  and can never expand to `@everyone`. There is no global allow-all `allowedMentions`
  on the client, so per-message scoping is the sole and sufficient control.

## Repo convention (the evidence this rests on)

- Broadcast / scheduled-channel-post commands are uniformly `ManageGuild`:
  `automessage` (scheduled channel posts — the closest analog to a channel-wide
  reminder), `embed`, `giveaway`, `settings`, `level`, `customcommand`.
- The one existing command that mass-pings a role — `vaga` — is `ManageGuild`
  (the direct analog to a role-wide reminder), and scopes the ping per-message with
  `allowedMentions: { roles }`.
- Both `vaga` and `automessage` rely **solely** on `setDefaultMemberPermissions`
  with no runtime `permissions.has(...)` check — a deliberate, consistent convention.
- `ManageRoles` is used only for role _administration_ (`roles sync/status`), never
  for "may ping a role". Administrator is reserved for server-wide config
  (`guildconfig`, `serversetup`, `automod`).

## Alternatives considered

1. **Channel = ManageMessages, Role = ManageGuild** (the debate's initial sketch):
   tier by blast radius so a channel moderator can set channel reminders. Rejected —
   the repo has no ManageMessages-gated broadcast command; the closest analog
   (`automessage`) is ManageGuild, so this introduces an inconsistent, lower bar for
   scheduled channel posts. (Revisit trigger below re-opens this if demand appears.)
2. **Role = ManageRoles:** rejected — ManageRoles is role administration, not "may
   ping a role"; the repo's actual role-ping command (`vaga`) uses ManageGuild.
3. **Administrator for role-wide:** rejected — over-gated; Administrator is reserved
   for server-wide config, not a single broadcast action.
4. **Add a runtime `permissions.has(ManageGuild)` check** (raised by the critic,
   because `setDefaultMemberPermissions` is admin-overridable in Discord's UI):
   rejected. An admin deliberately granting a role access to `/remind` via that UI
   is **authorized delegation, not privilege escalation** — and this is exactly how
   the repo's other broadcast commands behave (`vaga`/`automessage` add no runtime
   check). Role-ping abuse is **annoyance-tier** (a bad ping), not a
   confidentiality/integrity/data-loss boundary, so a hard non-overridable gate
   would over-engineer the risk _and_ break consistency with the analogs while
   removing admins' legitimate delegation.
5. **No gate (like personal):** rejected — mass-ping blast radius needs a gate.

## Consequences

- **Positive:** consistent with the two direct existing analogs; one simple tier;
  no new permission surface; admins retain per-command delegation via Discord's UI;
  role ping is hard-scoped by `allowedMentions`.
- **Negative:** a channel-only reminder is gated slightly heavier than its blast
  radius strictly requires — a ManageMessages-only moderator can't set one. Accepted
  for consistency with `automessage`.
- **Neutral:** personal reminders keep their zero-gate behavior; enforcement is
  Discord-side-default + admin-overridable (intended flexibility, not a hole, for an
  annoyance-tier action).

## Revisit when

- Per-module RBAC (`GuildRoleAccessService` / `RBAC_MODULES`) is extended to
  reminders — the gate then moves to that system and this becomes the fallback default; **or**
- Any other channel-scoped broadcast command ships with a **ManageMessages** tier —
  that signals a deliberate pattern shift toward proportional gating, and channel-wide
  reminders should follow it (re-opening alternative 1); **or**
- Guild admins report the ManageGuild bar is too high for channel-only reminders.
