# Reaction Roles: Dashboard Create/Delete

- Status: accepted
- Date: 2026-06-22
- Method: /feature-from-zero (codebase research)

## Context

The web dashboard's Reaction Roles page is read-only. It lists existing messages and
tells users to run `/reactionrole create` in Discord. Creating a reaction role message
requires:

1. Sending a Discord embed + button-component message to a channel
2. Storing the message ID and role→button mappings in Prisma

The `ReactionRolesService.createReactionRoleMessage()` in `packages/shared` takes
Discord.js `Guild` and `TextChannel` objects and calls `channel.send()`. The backend
process has no Discord.js client — bot and backend run as separate processes with no
IPC (no Redis pub-sub, no internal HTTP server in bot, no shared memory).

The existing `packages/backend/src/routes/internalNotify.ts` already sends Discord
messages from the backend via the Discord REST API (`POST /channels/:channelId/messages`,
`Authorization: Bot ${DISCORD_TOKEN}`). The same pattern can send embeds with action rows.

## Decision

**Send the Discord message directly from the backend via the Discord REST API** using
`DISCORD_TOKEN`, then store the result in Prisma. No new IPC mechanism is introduced.

Add a new service method `createReactionRoleMessageFromDashboard()` to the shared
`ReactionRolesService` that:

- Accepts plain data types (`guildId`, `channelId`, `title`, `description`, `roles[]`)
- Sends `POST /channels/:channelId/messages` with embed + action rows as Discord API JSON
- Stores the returned `message.id` + role mappings in Prisma (identical schema to bot path)

The button `custom_id` format stays `reactionrole:${roleId}` — the bot's
`handleButtonInteraction` reads this format from the DB, so button clicks work identically
regardless of how the message was created.

**Delete** from dashboard is already safe: `deleteReactionRoleMessage` only removes the
Prisma record (does not delete the Discord message) — consistent with bot behavior.

**Role picker** requires a new `GET /api/guilds/:guildId/roles` endpoint backed by
`guildService.getGuildRoleOptions()`, which already uses the bot token to fetch roles
via Discord REST API.

## Scope

### New: `packages/shared/src/services/ReactionRolesService/index.ts`

- Add `DashboardCreateOptions` interface (no Discord.js types)
- Add `createReactionRoleMessageFromDashboard(options, botToken)` — REST API call + Prisma write

### New: `packages/backend/src/routes/roles.ts`

- `POST /api/guilds/:guildId/reaction-roles` — create (manage access)
- `DELETE /api/guilds/:guildId/reaction-roles/:messageId` — delete (manage access)

### New: `packages/backend/src/routes/guilds.ts`

- `GET /api/guilds/:guildId/roles` — role list for picker (view access)

### New: `packages/backend/src/schemas/management.ts`

- `createReactionRoleBody` Zod schema

### New: `packages/frontend/src/services/reactionRolesApi.ts`

- `create()` and `delete()` methods

### New: `packages/frontend/src/services/api.ts`

- `api.guilds.getRoles(id)` method

### Modified: `packages/frontend/src/pages/ReactionRoles.tsx`

- Replace "use the bot command" hint with a create dialog
- Add per-message delete button

## Consequences

- No new environment variables, no new infrastructure, no schema changes
- Dashboard users need `ManageRoles` Discord permission (enforced via guild module access)
- Discord message is sent at request time (not async) — if Discord is down, the request fails with 502
- If the user deletes a reaction role from the dashboard, the Discord message remains visible
  in the channel (buttons become inert) — consistent with bot `/reactionrole delete` behavior
- Shared service now has two code paths for creation (bot path with Discord.js objects,
  dashboard path with REST API) — both write identical DB records

## Deferred

- Delete the Discord message when deleting from dashboard (requires storing channelId separately
  and a `DELETE /channels/:channelId/messages/:messageId` REST call) — file as follow-up issue
- Edit an existing reaction role message (future)
