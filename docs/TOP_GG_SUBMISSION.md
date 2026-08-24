# top.gg Submission Pack

Reference for the Lucky listing on https://top.gg.

**Status: submitted, awaiting approval.** The dashboard at
https://top.gg/discord/bots/962198089161134131/dashboard is the authority on
listing state and reports "Your project is currently in review". Nothing in the
add-bot wizard does: it renders the static line "Your bot is a draft now and
whenever you are ready, you can submit it for review" regardless of state, and
its submit button sits `disabled` with the label "Queued for Review" once the
listing has been queued. Read the dashboard, not the wizard.

Approval unlocks the public page, ad campaigns (`Promote your Project` is gated
on it) and the `Appearance` section of the dashboard.

## 1. Bot identification

| Field          | Value                                       |
| -------------- | ------------------------------------------- |
| Client ID      | `962198089161134131`                        |
| Invite URL     | `https://lucky.lucassantana.tech/invite`    |
| Website        | `https://lucky.lucassantana.tech`           |
| GitHub         | `https://github.com/LucasSantana-Dev/Lucky` |
| Support server | `https://discord.gg/f2rxBWvqeR`             |

**Note on the support server**: the invite is permanent by construction ("Expire After: Never", "Max Uses: No limit"). The first invite generated for this server carried `expires_at 2026-09-23` and was discarded: a support link that quietly expires is half of what made #2087 a bug. The single definition lives in `packages/shared/src/constants/support.ts`; do not paste the raw URL into new call sites.

The server's channel, role and permission layout is provisioned by
`scripts/setup-support-server.mjs`, and the GitHub release feed in `#🚀-releases`
by `scripts/wire-releases-feed.mjs`. Both are idempotent and both need Discord
permissions granted for the run and revoked after; usage is in their headers.

**Note on the invite URL** — do not hardcode a `permissions=` integer here. `https://lucky.lucassantana.tech/invite` redirects to Discord via the backend, which builds the URL from `BOT_INVITE_PERMISSIONS` in `packages/shared/src/constants/invite.ts`, and logs the `utm_*` parameters on the way through so directory clicks are attributable.

The curated set is `3173504` — View Audit Log, View Channels, Send Messages, Manage Messages, Embed Links, Connect, Speak — per `decisions/2026-06-18-invite-permission-scope.md`. **Never Administrator.** High-alarm permissions (Ban/Kick/ManageRoles/ManageChannels/ManageGuild/ModerateMembers) are escalated on demand rather than requested up front.

_Historical note:_ this file previously specified `36970496` and described it as ten permissions summing to 37022784, which is neither that integer nor a set the bot could work with. The real `36970496` is Manage Messages, Use External Emojis, Connect, Speak, Use Voice Activity — with **no** View Channels and **no** Send Messages, so a bot invited with it could not read or post in a channel. It also claimed the README used `permissions=8` (Administrator); that was removed in #1889.

## 2. Short description (120 char cap)

> **The live listing does not use the copy in §2 and §3.** What was actually
> submitted is longer and leads on the self-hosting angle. Read and edit it at
> the dashboard's `Edit Your Page`; treat the text below as the original draft,
> kept for reference.

```text
Self-hosted Discord music bot with autoplay, dashboard, and moderation. TypeScript, open source, no paywall.
```

Character count: 108.

## 3. Long description (Markdown supported)

```markdown
# Lucky 🎵

**Self-hosted Discord music bot + React dashboard.** Production-grade TypeScript monorepo — music, moderation, engagement — fully open source under ISC.

## Highlights

- 🎵 **Music**: YouTube + Spotify + SoundCloud · autoplay with diversity-aware recommendations · `/queue smartshuffle` · `/session save|restore`
- 🛡️ **Moderation**: warn · mute · kick · ban · case tracking · `/digest` weekly reports · automod presets
- 📊 **Dashboard**: Discord OAuth · RBAC · guild management · feature toggles at [lucky.lucassantana.tech](https://lucky.lucassantana.tech)
- 🎯 **Engagement**: leveling · starboard · Last.fm scrobbling · Twitch notifications
- ⚡ **Reliability**: music watchdog auto-recovery · provider health cooldown · queue snapshot restore · cold-Redis survival

## Why pick Lucky

- Real autoplay — uses Spotify Discover + genre graphs, not a static playlist loop
- Self-hostable in Docker — no vendor lock-in, no hidden costs
- Active development — [releases every few days](https://github.com/LucasSantana-Dev/Lucky/releases)
- Every PR runs lint, build, the full test suite and SonarCloud gates; a deploy that fails its health checks rolls back to the last good build

## Get started

- [Invite Lucky](https://lucky.lucassantana.tech/invite) to your server
- [Star on GitHub](https://github.com/LucasSantana-Dev/Lucky) if you find it useful
- Report issues on [GitHub Issues](https://github.com/LucasSantana-Dev/Lucky/issues)

Made with ❤️ in Brazil · Open source under [ISC](https://github.com/LucasSantana-Dev/Lucky/blob/main/LICENSE)
```

## 4. Tags

Primary (pick 3): `music`, `moderation`, `dashboard`
Secondary (add up to 5): `typescript`, `open-source`, `self-hosted`, `autoplay`, `spotify`

## 5. Listing fields (as the form actually exists)

**There is no banner upload in the add-bot flow.** The previous version of this
section specified a 1000x500 banner sourced from `assets/lucky-social-preview.png`;
top.gg has since changed the listing format and the wizard contains no
`input[type=file]` at all. Imagery may return under the dashboard's `Appearance`
section, which is gated on approval, so this cannot be confirmed until then.

The fields the wizard does have, in order:

| Field               | Required              | Value used                                                                        |
| ------------------- | --------------------- | --------------------------------------------------------------------------------- |
| Headline            | yes, 140 char cap     | leads on self-hosting; see the note in §2                                         |
| Long Description    | yes, 300 char minimum | Markdown, see §2 note                                                             |
| Prefix              | yes                   | `/`                                                                               |
| Categories          | yes, 1+               | Automation, autoplay, Moderation, Music, Spotify, Utility, Web Dashboard, YouTube |
| Languages           | yes, 1+               | English                                                                           |
| Note for reviewer   | no                    | empty                                                                             |
| Invite URL          | no                    | `https://lucky.lucassantana.tech/invite?utm_source=topgg&utm_medium=direct`       |
| Repository URL      | no                    | `LucasSantana-Dev/Lucky`                                                          |
| Support URL         | no                    | `f2rxBWvqeR`                                                                      |
| Website URL         | no                    | `https://lucky.lucassantana.tech`                                                 |
| Support Server Link | no                    | empty                                                                             |

**Repository URL and Support URL are prefixed fields.** The form renders
`https://github.com/` and `https://discord.gg/` as static labels and appends
what you type. Pasting a full URL produces
`https://github.com/https://github.com/LucasSantana-Dev/Lucky`, which is what
the listing shipped with until it was corrected. Type the suffix only.

`Support Server Link` is a dropdown of servers already listed on top.gg, not a
free invite field. The Lucky support server is not listed there, so it stays
empty and `Support URL` carries the invite instead.

**Brand asset warning:** do not reach for `assets/lucky-logo.png`. Despite the
name it contains a NEXUS logo, not Lucky branding (#2094). The real mark is
`assets/outline-v4-neon.jpeg` (1024x1024) or `packages/frontend/public/lucky-logo.png`.

## 6. Vote webhook

**The endpoint is built and live.** The stub that used to live in this section
described code that has since shipped, backed by Postgres rather than the Redis
keys it sketched. The real implementation:

| Piece                        | Where                                                        |
| ---------------------------- | ------------------------------------------------------------ |
| `POST /webhooks/topgg-votes` | `packages/backend/src/routes/webhooks.ts`                    |
| Route registration           | `packages/backend/src/routes/index.ts`                       |
| Vote + streak storage        | `topggVote` model in `prisma/schema.prisma`                  |
| Tier definitions             | `packages/shared/src/constants/topgg.ts`                     |
| `/voterewards` command       | `packages/bot/src/functions/general/commands/voterewards.ts` |
| Server-count posting         | `packages/bot/src/utils/general/topggStatsScheduler.ts`      |
| Dashboard badge              | `packages/frontend/src/components/Layout/VoteBadge.tsx`      |

Verified reaching the backend in production on v2.39.8:

```console
$ curl -s -i -X POST -H "Content-Type: application/json" \
    -d '{"type":"test"}' https://lucky-api.lucassantana.tech/webhooks/topgg-votes
HTTP/2 503
content-type: application/json; charset=utf-8
{"error":"TOPGG_AUTH_TOKEN not configured"}
```

The 503 comes from `verifyTopggAuth` and is the expected state until the token
is set. Before #2089 this same request returned a `405 Not Allowed` HTML page
from nginx, because `/webhooks/` had no `location` block and fell through to the
SPA (#2086). If it ever returns HTML again, that routing regressed, not the
handler.

### Order of operations, once approved

The sequence matters. Configuring the webhook URL before the token exists makes
top.gg receive a 503 and mark the endpoint as failing.

1. Get the token from `https://top.gg/bot/962198089161134131/webhooks`.
2. Set `TOPGG_AUTH_TOKEN` in production (and `TOPGG_TOKEN` for stats posting).
   Both are declared but commented out in `.env.example`.
3. Confirm the endpoint now answers `401` rather than `503` for an unauthenticated POST.
4. Only then paste `https://lucky-api.lucassantana.tech/webhooks/topgg-votes`
   into top.gg's webhook field.

Note the hostname: `lucky-api.lucassantana.tech`. `api.lucky.lucassantana.tech`
has no DNS record and an earlier version of this doc named it (#2088).

**Security**: the `authorization` header is the only guard, sent by top.gg as a
plain header, and compared with `timingSafeKeyCompare`. Never log the raw header
or the request body.

## 7. Submission checklist

Done:

- [x] Bot verified with Discord (`public_flags: 65536`, the `VERIFIED_BOT` bit)
- [x] Headline and long description filled
- [x] Categories selected (8) and language set
- [x] Prefix: `/` (slash commands only)
- [x] Support server invite added, permanent
- [x] Repository URL added, and the duplicated-prefix value corrected
- [x] Website URL added
- [x] Submitted for review

Blocked on approval:

- [ ] Get the webhook token and set `TOPGG_AUTH_TOKEN` in production
- [ ] Set `TOPGG_TOKEN` in production so `topggStatsScheduler` can post the server count
- [ ] Set the webhook URL in top.gg (only after `TOPGG_AUTH_TOKEN` is set)
- [ ] Revisit imagery under the dashboard's `Appearance` section
- [ ] Announce the listing in the support Discord and a GitHub release note

Not applicable:

- ~~Banner rendered at 1000x500~~: no banner field exists in the flow; see §5.
