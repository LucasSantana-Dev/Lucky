# Invite permission scope: graceful checks first, then a curated default + on-demand escalation

- Status: accepted-with-revisions (sequenced — #2 graceful checks ship BEFORE #1 the invite integer)
- Date: 2026-06-18
- Method: /research-and-decide (repo evidence → decision-critic Opus artifact-only → plan → ADR)

## Context

Lucky's `/invite` command (#1494) and landing "Add to Discord" CTA (#1495) request only
**minimal music perms** (View/Send/Embed/Connect/Speak, integer 3165184). But Lucky is a
**multi-feature** bot — verified from code, it performs actions needing:
`ModerateMembers` (timeout, 7), `ManageGuild` (settings/automod, 13), `ManageRoles` (3),
`ManageChannels` (2), `BanMembers` (2), `KickMembers` (1), `ManageMessages` (1), and
`ViewAuditLog` (`handlers/auditHandler.ts` reads audit logs for mod cases).

Two verified facts make the current state a latent bug:

- **Zero graceful bot-permission checks** (no `interaction.appPermissions` use anywhere).
- So a moderation/management/automod command run while the bot lacks the perm throws a
  **raw Discord "Missing Permissions" API error** to the user — which, with the
  minimal-music invite, is the default state for every non-music feature on a fresh add.

`Administrator` appears only as `setDefaultMemberPermissions(Administrator)` (command
gating — _who may invoke_), never as a permission the bot itself requests. The bot does
NOT need Administrator. `discord.js ^14.26` exposes `interaction.appPermissions` for guild
interactions (reliable; DMs return null, but these commands are guild-only).

## Decision

A curated invite default + on-demand escalation, **sequenced** so it's safe:

1. **Ship FIRST — graceful bot-permission handling** (the decision-critic's required flip;
   needed _regardless_ of invite scope, since it fixes today's raw-error failure mode):
    - **Interaction commands:** before performing a privileged action, check
      `interaction.appPermissions.has(<needed>)`; if absent, reply _"I'm missing the **X**
      permission — ask an admin to grant it, or re-invite me with the full set"_ instead of
      throwing.
    - **Event-driven paths** (automod triggers, scheduled mod actions — no interaction to
      reply to): log + skip gracefully; never crash the handler.
2. **THEN set the invite to a curated default** (`/invite` + CTA share ONE integer):
    - **Include:** music (View/Send/Embed/Connect/Speak) + `ManageMessages` (cleanup) +
      `ViewAuditLog` (read-only; needed by `auditHandler`).
    - **Exclude from the default ask** (escalate on demand via the graceful layer):
      `ModerateMembers`, `BanMembers`, `KickMembers`, `ManageRoles`, `ManageChannels`,
      `ManageGuild`. These are high-alarm or rare; a server admin grants them (edit role)
      or re-invites with the larger integer when they enable those features.
3. **Strategic stance (explicit):** optimize **add-conversion for the advertised core
   (music) + graceful escalation for power features**, NOT feature-completeness-on-add.
   Rationale: (a) conversion-by-permission is **not measurable** here — Discord exposes no
   install source (see the 2026-06-17 growth ADR), so a heavier ask can't be justified
   with data; (b) the product leads with music. Accept that management/automod
   prompt-to-grant on a fresh add.

Discord mechanics relied on (stable): bot perms are editable by an admin post-invite;
re-inviting with a larger integer prompts a delta-grant (no kick/re-add); the bot can read
its effective perms at runtime via `interaction.appPermissions`.

## Plan (pilot → rollout)

- **Pilot:** build the graceful-check util + apply to the **moderation** category (ban /
  kick / timeout). Success = a command run without the bot's perm replies with the
  "missing X" prompt (no raw API error); `appPermissions` reads correctly in the live bot.
- **Rollout:** extend to management + automod (incl. event-driven log-and-skip). Then flip
  the invite integer (bot `/invite` + frontend CTA) to the curated default.
- **Rollback:** the graceful layer is additive (pure guards) — revert is a code revert; the
  invite integer is a one-line change, trivially reversible.

## Alternatives considered

- **Minimal-music-only invite, no graceful layer (status quo)** — rejected: non-music
  features throw raw errors on a fresh add → "bot is broken" churn + support burden.
- **Full-union at invite (music + ban/kick/roles/channels/ManageGuild)** — rejected as the
  _default_: high-alarm asks (Ban, Manage Server) with unmeasurable conversion benefit; many
  servers never use those features. Kept as the _escalation_ target instead.
- **Request everything incl. Administrator** — rejected: bot provably doesn't need it
  (Admin is only command-gating); scary ask; over-privilege is a security smell, especially
  for a public-repo bot.
- **Expand invite first, add graceful checks later** — rejected (critic): ships the known
  raw-error failure mode in the gap. Hence the sequencing flip.

## Consequences

- **Positive:** fixes a real latent bug (raw errors → friendly prompts) independent of the
  invite change; keeps the default ask low-alarm; no over-privilege; one integer shared by
  command + CTA; reversible.
- **Negative:** management/automod features prompt-to-grant on fresh add (extra step for
  power users); the conversion bet is a heuristic, not measured; adds per-command guard code.
- **Neutral:** the exact membership of the "curated default" (e.g. whether `ManageMessages`
  belongs) is tunable without re-opening the core decision.

## Revisit when

- **Churn data shows feature-incompleteness drives more removals than permission-asks** →
  flip the stance toward feature-completeness (wider default ask). (Needs the growth ADR's
  measurement sprint first.)
- **`appPermissions` proves unreliable in any live command context** → the graceful layer
  needs a different perm-source; re-evaluate.
- **A new feature needs a perm not in the default** → decide include-vs-escalate per the
  same low-alarm test; don't silently expand the default.
- **Discord changes re-invite/permission UX** → re-check the escalation flow.
