# top.gg Submission Pack

Reference for the Lucky listing on https://top.gg.

**Status: approved and live.** The dashboard at
https://top.gg/discord/bots/962198089161134131/dashboard no longer reports a
review and shows `Appearance` and `Promote your Project`, which are gated on
approval. Production posts the server count and receives votes since
2026-09-26. The dashboard is the authority on listing state; the add-bot wizard
renders static draft text regardless of state.

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

## 2. Headline (140 char cap)

Live copy since 2026-10-01 (#2472). The pitch follows
`decisions/2026-09-27-music-first-positioning.md`: taste learning first, audio
sources never named, self-hosting not promoted.

```text
Lucky learns your server's taste and keeps the call playing, no DJ needed. Smart autoplay, Spotify links, and every feature free.
```

Character count: 129.

### Next headline: lead with the weekly recap

`decisions/2026-10-07-pitch-leads-with-weekly-recap.md` switches the lead to the
weekly recap. Paste this **only once `/recap` is live in production** (#2678);
the listing must not promise a feature the bot lacks.

```text
Every Sunday, Lucky shows your server what it listened to, and keeps the call playing in between. Smart autoplay, all free.
```

Character count: 123.

pt-BR variant (for a later test, same rule):

```text
Todo domingo, a Lucky mostra o que o seu servidor ouviu, e mantém a call tocando no resto da semana. Autoplay que aprende, tudo grátis.
```

Character count: 135.

## 3. Long description (Markdown supported)

```markdown
**Lucky learns your server's taste and keeps the call playing, no DJ needed.**

Queue a couple of songs and Lucky takes it from there. Autoplay picks what comes next from what your server actually plays, skips and likes, instead of looping a static playlist.

**What you get**

- 🎶 Smart autoplay that adapts to your server. Use 👍 / 👎 on a track to steer it
- 📻 One-click station to get music going the moment Lucky joins
- 🟢 Spotify search and links: paste a track, album or playlist
- 🎧 Last.fm scrobbling for everyone who links an account
- 💾 Save a session and restore the queue later
- 📝 Lyrics for the song that is playing
- 🖥️ Web dashboard with music controls and server settings

**Free, for real**
Every feature is free. No premium tier, no paywall on volume, filters or playlists.

**Light on permissions**
Lucky never asks for Administrator. The invite uses a short, curated permission list.

**Get started**

1. Invite Lucky: https://lucky.lucassantana.tech/invite
2. Join a voice channel and type `/play` with a song name or a Spotify link
3. Questions or ideas? Join the support server: https://discord.gg/f2rxBWvqeR

Made in Brazil. Open source under the ISC license: https://github.com/LucasSantana-Dev/Lucky
```

**Known gap in the live copy:** the 👍 / 👎 line describes buttons that did not
exist until #2687 (before it, thumbs was only `/recommendation feedback`). It is
accurate once #2687 is deployed; until then it overpromises.

### Next long description: lead with the weekly recap

Paste together with the next headline (§2), **only once `/recap` is live in
production**. Same rules: audio sources never named, self-hosting not promoted.

```markdown
**Your server's week in music, every Sunday.**

Lucky keeps the call playing with autoplay that learns from what your server plays, skips and likes. Every Sunday it posts a recap in the channel you pick: the songs and artists your server played most, how long you listened, and how much came from autoplay. It never says who played what.

**What you get**

- 📅 A weekly recap every Sunday: turn it on with `/recap channel`
- 🎶 Smart autoplay that adapts to your server. Rate the song playing with 👍 / 👎 to steer it
- 📻 One-click station to get music going the moment Lucky joins
- 🟢 Spotify search and links: paste a track, album or playlist
- 🎧 Last.fm scrobbling for everyone who links an account
- 💾 Save a session and restore the queue later
- 📝 Lyrics for the song that is playing
- 🖥️ Web dashboard with music controls and server settings

**Free, for real**
Every feature is free. No premium tier, no paywall on volume, filters or playlists.

**Light on permissions**
Lucky never asks for Administrator. The invite uses a short, curated permission list.

**Get started**

1. Invite Lucky: https://lucky.lucassantana.tech/invite
2. Join a voice channel and type `/play` with a song name or a Spotify link
3. Pick a channel for the weekly recap with `/recap channel`
4. Questions or ideas? Join the support server: https://discord.gg/f2rxBWvqeR

Made in Brazil. Open source under the ISC license: https://github.com/LucasSantana-Dev/Lucky
```

pt-BR variant (for a later test, same rule):

```markdown
**A semana musical do seu servidor, todo domingo.**

A Lucky mantém a call tocando com um autoplay que aprende com o que o seu servidor toca, pula e curte. Todo domingo ela posta um resumo no canal que você escolher: as músicas e os artistas mais tocados, quanto tempo vocês ouviram e quanto veio do autoplay. Ela nunca diz quem tocou o quê.

**O que você ganha**

- 📅 Um resumo semanal todo domingo: ative com `/recap channel`
- 🎶 Autoplay que se adapta ao seu servidor. Avalie a música que está tocando com 👍 / 👎 para guiar
- 📻 Estação com um clique para a música começar assim que a Lucky entra
- 🟢 Busca e links do Spotify: cole uma música, um álbum ou uma playlist
- 🎧 Scrobble no Last.fm para quem vincular a conta
- 💾 Salve uma sessão e restaure a fila depois
- 📝 Letra da música que está tocando
- 🖥️ Painel web com controles de música e configurações do servidor

**Grátis de verdade**
Tudo é grátis. Sem plano premium, sem paywall em volume, filtros ou playlists.

**Poucas permissões**
A Lucky nunca pede Administrador. O convite usa uma lista curta e escolhida de permissões.

**Como começar**

1. Convide a Lucky: https://lucky.lucassantana.tech/invite
2. Entre num canal de voz e digite `/play` com o nome de uma música ou um link do Spotify
3. Escolha um canal para o resumo semanal com `/recap channel`
4. Dúvidas ou ideias? Entre no servidor de suporte: https://discord.gg/f2rxBWvqeR

Feita no Brasil. Código aberto sob a licença ISC: https://github.com/LucasSantana-Dev/Lucky
```

## 4. Categories

Live: `autoplay`, `Music`, `Spotify`, `Web Dashboard`.

`YouTube` was removed on 2026-10-01: the ADR never names streaming sources
(YouTube, SoundCloud) in the listing. Spotify stays because it
is a search and link feature, not where the audio streams from. `Automation`, `Moderation` and `Utility` were removed on
2026-10-01: moderation is hidden from the hosted bot's onboarding.

## 5. Listing fields (as the form actually exists)

**There is no banner upload in the add-bot flow.** The previous version of this
section specified a 1000x500 banner sourced from `assets/lucky-social-preview.png`;
top.gg has since changed the listing format and the wizard contains no
`input[type=file]` at all. Imagery may return under the dashboard's `Appearance`
section, which is gated on approval, so this cannot be confirmed until then.

The fields the wizard does have, in order:

| Field               | Required              | Value used                                                                  |
| ------------------- | --------------------- | --------------------------------------------------------------------------- |
| Headline            | yes, 140 char cap     | see §2                                                                      |
| Long Description    | yes, 300 char minimum | Markdown, see §3                                                            |
| Prefix              | yes                   | `/`                                                                         |
| Categories          | yes, 1+               | see §4                                                                      |
| Languages           | yes, 1+               | English, Portuguese, Spanish                                                |
| Note for reviewer   | no                    | empty                                                                       |
| Invite URL          | no                    | `https://lucky.lucassantana.tech/invite?utm_source=topgg&utm_medium=direct` |
| Repository URL      | no                    | `LucasSantana-Dev/Lucky`                                                    |
| Support URL         | no                    | `f2rxBWvqeR`                                                                |
| Website URL         | no                    | `https://lucky.lucassantana.tech`                                           |
| Support Server Link | no                    | empty                                                                       |

**Repository URL and Support URL are prefixed fields.** The form renders
`https://github.com/` and `https://discord.gg/` as static labels and appends
what you type. Pasting a full URL produces
`https://github.com/https://github.com/LucasSantana-Dev/Lucky`, which is what
the listing shipped with until it was corrected. Type the suffix only.

`Support Server Link` is a dropdown of servers already listed on top.gg, not a
free invite field. The Lucky support server is not listed there, so it stays
empty and `Support URL` carries the invite instead.

**Brand asset:** `assets/lucky-logo.png`/`.webp` were deleted (#2094) - despite
the name they contained a NEXUS logo, not Lucky branding. The real mark is
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

Live in production: an unauthenticated POST answers `401` (checked
2026-10-01), so webhook authentication is configured and `verifyTopggAuth` is
enforcing. Either secret produces that `401`: `TOPGG_WEBHOOK_SECRET` (v1, signed
deliveries, takes precedence) or the legacy `TOPGG_AUTH_TOKEN` (v0).

```console
$ curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" \
    -d '{"type":"test"}' https://lucky-api.lucassantana.tech/webhooks/topgg-votes
401
```

A `503 {"error":"TOPGG_AUTH_TOKEN not configured"}` means neither secret is set
from the production env. An HTML `405` means the nginx `/webhooks/` routing
regressed (#2086, fixed in #2089), not the handler.

### Order of operations, if the token is ever rotated

The sequence matters. Pointing top.gg at the endpoint while the token is
missing makes top.gg receive a 503 and mark the endpoint as failing.

1. Get the token from `https://top.gg/bot/962198089161134131/webhooks`.
2. Set `TOPGG_WEBHOOK_SECRET` (the `whs_` secret, v1) or the legacy
   `TOPGG_AUTH_TOKEN` in production, and `TOPGG_TOKEN` for stats posting.
   Both are declared but commented out in `.env.example`.
3. Confirm the endpoint answers `401` rather than `503` for an unauthenticated POST.
4. Only then save `https://lucky-api.lucassantana.tech/webhooks/topgg-votes`
   in top.gg's webhook field.

Note the hostname: `lucky-api.lucassantana.tech`. `api.lucky.lucassantana.tech`
has no DNS record and an earlier version of this doc named it (#2088).

**Security**: the `authorization` header is the only guard, sent by top.gg as a
plain header, and compared with `timingSafeKeyCompare`. Never log the raw header
or the request body.

## 7. Submission checklist

Done:

- [x] Bot verified with Discord (`public_flags: 65536`, the `VERIFIED_BOT` bit)
- [x] Headline and long description filled
- [x] Categories selected and languages set
- [x] Prefix: `/` (slash commands only)
- [x] Support server invite added, permanent
- [x] Repository URL added, and the duplicated-prefix value corrected
- [x] Website URL added
- [x] Submitted for review

- [x] Approved (2026-10-01 check; see the status note at the top)
- [x] `TOPGG_TOKEN` set in production: `topggStatsScheduler` posts the server count
- [x] Vote webhook live: votes are received since 2026-09-26
- [x] `YouTube` category removed (§4)

Open:

- [x] Draft a pt-BR description variant (#2472): see §2 and §3
- [ ] When `/recap` is live in production, paste the next headline and long
      description (§2, §3) on the top.gg dashboard
- [ ] Re-run the thumbs positioning check 28 days after #2687 deploys
      (`decisions/2026-10-07-pitch-leads-with-weekly-recap.md`)
- [ ] Revisit imagery under the dashboard's `Appearance` section
- [ ] Announce the listing in the support Discord and a GitHub release note

Not applicable:

- ~~Banner rendered at 1000x500~~: no banner field exists in the flow; see §5.
