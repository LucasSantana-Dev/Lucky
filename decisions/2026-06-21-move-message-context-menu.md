# Move Message via Context Menu (relocate, not archive)

- Date: 2026-06-21
- Status: accepted
- Deciders: Lucas Santana

## Context

Moderators sometimes encounter a message that is useful to the server but is in
the wrong channel (off-topic in #general, a support question in #chat, etc.).
Today the only options are delete (loses content) or manual copy-paste (lossy,
no attribution). We want a one-action "move this message to a better-fitting
channel": the original is deleted and a faithful copy is reposted elsewhere.

The bot already has a full moderation suite (`packages/bot/src/functions/moderation/commands/`),
a `Command` model with a `botPermissions` guard enforced in `commandsHandler.ts`,
shared embed builders (`COLOR.LUCKY_PURPLE`), and `interactionReply()`. It does
**not** have any message context-menu command, any component (select-menu)
routing beyond music buttons/reaction-roles, a webhook repost client, or an
attachment re-upload helper. discord.js is 14.26.4.

## Decision

Build **"Move message"** as a **message context-menu command** (right-click →
Apps), scoped to members with `Manage Messages`.

Resolved design forks (operator decisions, 2026-06-21):

1. **Destination — mod-chosen, required.** This is a _relocate_ feature, not a
   mod-log archive. The moderator must pick the destination channel every time;
   there is no `modLogChannelId` default. `ModerationSettings` is not involved.
2. **Trigger — message context menu.** Natural UX for "move _this_ message".
   The bot has no context-menu infrastructure, so this decision also introduces
   a small, reusable context-menu command subsystem (parallel to the slash
   `Command` registry).
3. **Fidelity — branded embed.** The copy is reposted as a Lucky embed: original
   author name + avatar in the embed header, message content as the body, footer
   carrying the source channel, original timestamp, and who moved it. No webhook
   impersonation (avoids the extra Manage-Webhooks permission and the confusion
   of a user appearing to have "posted" in a channel they never did).
4. **Attachments — re-upload faithfully.** Each attachment is fetched and
   re-uploaded to the destination so images/files survive (Discord CDN URLs now
   expire, so linking would rot). Attachments that exceed the destination
   guild's upload limit fall back to a link and are noted in the embed.

### Interaction flow

A message context-menu command takes **no arguments**, but the destination is
required. So the flow is two-step and stateless:

1. Right-click message → Apps → **Move message**. Re-check member `Manage Messages`.
   Reply **ephemerally** with a `ChannelSelectMenu` whose `customId` encodes the
   source: `movemsg:<sourceChannelId>:<messageId>` (well under the 100-char limit).
2. Moderator picks a destination channel → component interaction
   (`isChannelSelectMenu`, `customId` prefix `movemsg:`) → decode source, fetch
   the original message, verify the bot's per-channel perms (source: Manage
   Messages; destination: Send Messages + Embed Links + Attach Files), build the
   branded embed, re-upload attachments, send to destination, delete the
   original, and edit the ephemeral reply to confirm with a jump link to the new
   message.

State lives entirely in the `customId` — no server-side session.

## Alternatives considered

- **Slash command `/move <message-link>`** — zero new infrastructure, but clunky
  (mod must copy a message ID/link first). Rejected as the primary trigger;
  context menu is the natural interaction. Can be added later if demand appears.
- **Fixed mod-log destination (reuse `modLogChannelId`)** — pure audit/archive.
  Rejected: the stated need is relocation to a _better-fitting_ channel, which a
  fixed destination cannot serve.
- **Webhook impersonation** — most "move"-like, but needs Manage Webhooks and a
  new webhook client, and an impersonated repost reads as if the user posted
  there themselves. Rejected for the relocate use case where attribution clarity
  matters.

## Consequences

- Introduces a reusable context-menu command subsystem (new model, loader,
  client collection, deploy-payload merge, interaction routing). First consumer
  is Move message; future context menus reuse it.
- Adds the first component-interaction route outside music/reaction-roles
  (`isChannelSelectMenu`).
- Adds an attachment re-upload helper (fetch → `AttachmentBuilder`) with a
  size-limit fallback.
- The original message is **permanently deleted** after a successful repost;
  this is destructive and gated on `Manage Messages` + bot permission checks.
- Out of scope / known limitations (documented, not handled in v1): stickers,
  polls, forwarded-message references, message components/buttons on the
  original, and reply-reference threading are not carried over. Voice messages
  and very large attachments fall back to links.
