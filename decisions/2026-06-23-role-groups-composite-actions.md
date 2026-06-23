# Role Groups: Composite "Add Styled Role" Action

- Status: accepted
- Date: 2026-06-23
- Method: /brainstorming → /feature-from-zero (codebase research) → /deep-research → /grill-with-docs (6 doc-grounded skeptics)
- Design: `.claude/plans/2026-06-23-role-groups-design.md` (local)

## Context

Adding a role to an existing reaction-role (RR) message, styled to match the roles already in
it, is **4 manual steps across 2 modules** today: create the role (Roles page) → edit its
color/hoist/mentionable → edit the RR message (ReactionRoles page) → add the button. There is
**no group concept and no style inheritance** — every `ReactionRoleMessage` is independent
(`groupConceptExists: false`), and reaction-roles never create roles (they reference an
existing Discord role by id).

Research surfaced that a composite orchestration layer already exists (`GuildAutomation`,
Capture/Diff/Apply with dry-run), and that no competitor (Carl-bot, Dyno, MEE6) exposes a true
composite create-role+attach API — they hide the split behind wizards. A doc-grounded grill
confirmed the Discord limits the design relies on and caught the real risks (orphaned buttons,
unimplemented idempotency, color storage type).

## Decision

Build **Role Groups** as a first-class entity plus **one composite endpoint** — not a generic
macro engine and not an NL/AI layer (YAGNI; both researchers and the grill converged here).

**v1 scope:** a `RoleGroup` is **1:1 with one RR message**, carries an **editable style
template seeded from that message's existing roles**, and exposes a composite
`POST /role-groups/:id/roles` that creates the styled role → attaches it → adds the button,
with a **dry-run preview**. No exclusivity, no multi-message groups, no bot slash-command, no
select menus, no bot interaction-handler changes.

**Partial-failure posture — DB-first + compensation, defer full idempotency:**

- A **new** append-only `ReactionRolesService.addRoleToMessage()` persists the mapping in a
  Prisma transaction **before** the Discord `PATCH` (re-render). The existing
  `updateReactionRoleMessage` is Discord-first, so a DB failure leaves **orphaned buttons**
  (buttons with no DB mapping). DB-first inverts the failure mode to "stale visuals, correct
  data," which re-syncs on the next render. (Related: issue #1555.)
- **Compensation:** if the mapping transaction fails after the role was created, delete the
  created role (safe, 404-tolerant inverse). If the Discord `PATCH` fails after the DB write,
  return `partial_success` + audit (data is correct; visuals re-sync).
- **Idempotency:** a lightweight double-submit guard only (frontend disable-on-submit +
  backend check-existing-role-by-name). The full `IdempotencyKey` table + composite
  stage-state-machine is **deferred to v2** — it matters most for bulk/high-concurrency, which
  are out of v1 scope.

## Scope

### Schema (`prisma/schema.prisma` + migration)

- New `RoleGroup` model: `id` (cuid), `guildId` (FK `onDelete: Cascade`), `name`, style
  template `color` (**hex String**, e.g. `0x5865F2` — matches `UserPreferences.embedColor`,
  NOT `Int`), `hoist`/`mentionable` (Boolean), `buttonStyle` (**String**, not a Prisma enum —
  matches `ReactionRoleMapping.style`), `defaultEmoji` (String?), timestamps,
  `@@index([guildId])`, `@@map("role_groups")`.
- `ReactionRoleMessage` gains `groupId String?` (FK `onDelete: SetNull`) + `@@unique([groupId])`
  (DB-level 1:1 in v1; relaxed in v2). Existing rows `groupId=null` — **no backfill**.

### New: `packages/shared/src/services/RoleGroupService`

- Composite executor: style seeding, preflights, DB-first apply, compensation, audit.
- `seedStyleFromMessage(messageId)`: modal of sibling **roles'** color/hoist/mentionable +
  **mode of `ReactionRoleMapping.style`** (style is per-button, not per-role; tie → `Primary`).

### New: `packages/shared/src/services/ReactionRolesService` method

- `addRoleToMessage(messageId, mapping)` — append-only, **DB-first** (insert one mapping in a
  txn, then `PATCH` Discord; no `deleteMany`).

### New: backend routes `/api/guilds/:guildId/role-groups` (`settings:manage`)

- `POST /role-groups` (mode `fromMessageId` seeds style), `PATCH /role-groups/:id`, `GET`,
  `POST /role-groups/:id/roles {name,label?,emoji?,colorOverride?,dryRun}`,
  `DELETE /role-groups/:id/roles/:roleId` (detach; keep the Discord role).
- Preflights: <25 buttons, <250 guild roles, label ≤80, `permissions='0'` on the created role,
  basic 429/Retry-After retry on the composite's Discord calls.

### New: `packages/frontend` — `roleGroupsApi.ts` + `ReactionRoles.tsx` "Group settings" /

"Add role" form with dry-run preview, double-submit guard, and `partial_success` state.

## Consequences

- No new infrastructure or env vars; one additive migration (nullable FK, no backfill).
- New roles are created at Discord **position 0** (bottom), so creation cannot escalate
  privilege — the "requester outranks target" check is **dropped for v1** (grill refuted it as
  a Discord constraint); the `settings:manage` gate remains.
- `color` stored as hex String must be converted to Int when calling `createGuildRole`.
- v1 sidesteps the #1555 orphaned-button risk via DB-first append; it does **not** fully fix
  #1555 (the legacy `updateReactionRoleMessage` path keeps its Discord-first ordering).

## Deferred (v2+)

Exclusivity / pick-one (needs bot handler + rate-limit-safe role swaps) · multi-message groups
(relax `@@unique([groupId])`) · bot slash-command · select-menu UI (discord.js 14.19+
`RoleSelectMenu`) · NL/AI intent layer · full `IdempotencyKey` table + stage state-machine ·
bulk role-add (the 10-edits/10s per-channel message-edit limit only bites bulk) · full #1555
hardening of the legacy update path.
