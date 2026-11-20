# Data retention and deletion requests

What the hosted Lucky instance keeps, for how long, and how someone asks for
their data to be deleted. The public privacy policy
(`packages/frontend/src/pages/PrivacyPolicy.tsx`) links here.

## Automatic retention windows

`DataRetentionScheduler` (`packages/bot/src/utils/general/dataRetentionScheduler.ts`)
runs once at startup and then once a day. It calls
`DatabaseService.cleanupOldData` (`packages/shared/src/services/database/DatabaseService.ts`):

| Table                                 | Deleted after          |
| ------------------------------------- | ---------------------- |
| `track_history`                       | 30 days (`playedAt`)   |
| `server_logs`                         | 30 days (`createdAt`)  |
| `rate_limits`                         | when the window resets |
| `user_feedback`                       | 180 days               |
| `command_events`, `activation_events` | 180 days               |

Other guild data (settings, moderation cases, XP, birthdays, starboard
entries, ...) is kept while the bot is in the server.

## Departed-guild purge (#2377)

When the bot leaves a server, `guilds.leftAt` is set. If the operator enables
the purge, the same daily sweep then deletes every guild-scoped table listed in
`GUILD_PURGE_TARGETS` for servers whose `leftAt` is older than the grace
period. Re-inviting the bot clears `leftAt`, so a server that comes back within
the grace period keeps its data.

| Variable                      | Default | Meaning                                                  |
| ----------------------------- | ------- | -------------------------------------------------------- |
| `GUILD_DATA_PURGE_ENABLED`    | `false` | Only the exact value `true` enables it                   |
| `GUILD_DATA_PURGE_GRACE_DAYS` | `30`    | Whole days after leaving; invalid values fall back to 30 |

Kept on purpose (`GUILD_PURGE_KEPT_TABLES`): `guilds` and
`guild_membership_events` (join/leave analytics), `guild_join_sources`,
`activation_events`, `command_events`, `user_feedback` (analytics with their
own windows), `guild_subscriptions` (billing record) and `support_reports`.

The sweep logs only row counts per table, never row content. Running it again
over the same servers deletes nothing.

## Requesting deletion

- **Server owners**: remove Lucky from the server. With the purge enabled, the
  server's data is deleted once the grace period has passed. To ask for it
  sooner, contact the maintainers (below).
- **Individual members** (XP, birthdays, AFK status, music preferences, logged
  messages, ...): contact the maintainers with your Discord user id and the
  server it concerns.
- **Contact**: the support server
  (`SUPPORT_SERVER_INVITE_URL` in `packages/shared/src/constants/support.ts`)
  or a GitHub issue at <https://github.com/LucasSantana-Dev/Lucky/issues>.
  Do not post personal data in a public issue; ask for a private channel
  instead.

Operators handling a request confirm that the requester owns the server (its
`ownerId`) or the Discord account, then delete the matching rows. Linked
accounts (Last.fm, Spotify) can also be removed by the user from the dashboard.
