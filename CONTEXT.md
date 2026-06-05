# Lucky

Self-hosted Discord music + moderation bot with a React dashboard. TypeScript monorepo (`packages/bot`, `packages/backend`, `packages/frontend`, `packages/shared`). This glossary defines the canonical vocabulary used across code, issues, PRs, and ADRs.

## Language

### Tenancy

**Guild**:
A Discord server. The primary tenancy unit — settings, sessions, feature toggles, moderation cases, and music state all scope to one Guild.
_Avoid_: Server, workspace.

**Member**:
A User as they exist _inside a specific Guild_. Carries Guild-scoped state (XP, role grants, birthday).
_Avoid_: User-in-server, guild-member.

**User**:
A Discord account, identified by a stable Discord user ID. Spans Guilds.
_Avoid_: Player, account, customer.

### Music (runtime)

**Track**:
A single playable music item with metadata — title, author, duration, url, thumbnail, source. Provider-agnostic at the type level; the `source` field names the upstream.
_Avoid_: Song, video, media, item.

**Source**:
The upstream provider that supplies a Track's audio stream: `youtube`, `spotify`, `soundcloud`, `attachment`, `virtual`. Stored as a string on TrackMetadata.
_Avoid_: Engine, provider, backend. **Note:** the same field name `source` is also (incorrectly) used inside `RecommendationBasis` to identify Candidate Sources — see "Flagged ambiguities" below.

**Search Engine**:
The discord-player `QueryType` used to _search_ for a Track — `QueryType.YOUTUBE_SEARCH`, `QueryType.SPOTIFY_SEARCH`, `QueryType.AUTO`, etc. Distinct from Source: the Spotify Search Engine can yield a Track whose Source is YouTube (Spotify metadata is matched against a YouTube stream). Referenced via the `searchEngine` / `preferredEngine` field.
_Avoid_: Engine alone (ambiguous), extractor (reserve for the lower-level discord-player extractor plugins like `ytdlpExtractor`).

**Queue**:
The ordered list of Tracks for one Guild's active playback. The first item is the currently-playing Track; the rest play in order. One Queue per Guild at a time.
_Avoid_: Playlist (reserved for user-saved collections, if/when introduced), list.

**Player**:
The per-Guild runtime playback state — voice connection, current Track, Queue, volume, repeat mode, paused/playing flag. Lives in memory; persisted snapshots are called **Sessions**. Canonical access path from a `guildId` is `resolveGuildQueue(client, guildId)` in `packages/bot/src/utils/music/queueResolver.ts`; calling `client.player.nodes.get(guildId)` directly is blocked by a guardrail test. See `docs/decisions/2026-05-19-queue-resolver-defensive-fallback-chain.md`.
_Avoid_: Voice client, audio player. Don't reach into `discord-player` APIs directly — use the resolver.

**Session** / **GuildSession**:
A persisted snapshot of a Player's state (current track, queue position, volume, repeat mode, full queue JSON) for one Guild. Used to save/restore playback across bot restarts or `/session` commands.
_Avoid_: Saved queue, playlist.

### Music (autoplay + recommendations)

**Autoplay**:
The Player behavior that keeps playback continuous when the user-queued Tracks run out. Off by default; toggled per Guild. Implemented by the pipeline in `packages/bot/src/utils/music/autoplay/`.
_Avoid_: Continuous play, radio mode, auto-queue.

**Autoplay Candidate** (or **Candidate**):
A Track proposed for Autoplay selection. Flows through the pipeline: collected from one or more Sources, scored, diversity-filtered, then dequeued for play.
_Avoid_: Suggestion, next-up.

**Candidate Source**:
Where Autoplay Candidates come from — the _recommender_ dimension, distinct from the audio Source. Lucky has these: **Recommendation Engine** (vector-similarity over TrackHistory), **Last.fm Seeder** (`lastfm-similar`, `lastfm-genre-fallback`, `lastfm`), **Spotify Recommender** (`spotify-rec`), and fallbacks (`artist-fallback`, `genre`, preference-based `virtual` tracks). Carried on `RecommendationBasis.source` — see "Flagged ambiguities".
_Avoid_: Provider, supplier, "source" without the "Candidate" qualifier.

**Recommendation Engine**:
The vector-similarity scorer in `packages/bot/src/services/musicRecommendation/`. Computes track similarity over a Guild's TrackHistory plus user feedback. Produces scored Recommendations; **one** of the Candidate Sources Autoplay consumes — not the autoplay system itself.
_Avoid_: Recommender (when ambiguous), suggestion service.

**Recommendation** (Prisma model):
A persisted candidate with algorithm tag and feedback signal. Stores the Engine's output and user thumbs-up/down for re-ranking.
_Avoid_: Suggestion record.

**TrackHistory** (Prisma model):
Per-Guild record of every Track that played, with timestamps and source. The substrate the Recommendation Engine learns from.
_Avoid_: Play log, listen log.

### Guild configuration

**Guild Automation**:
The declarative Guild-configuration-as-data subsystem. A Guild's intended state (channels, roles, settings) is captured as a JSON **Manifest**; **Runs** apply the Manifest to live Discord state; **Drift** records divergence between Manifest and observed state per module. NOT an umbrella for Autoplay / AutoMod / AutoMessage / AutoRole — those are _features_, this is _config reconciliation_.
_Avoid_: Guild-as-code, GitOps-for-Guilds, sync, provisioning. Don't say "automation" as a generic term meaning "any Auto-\* feature".

**Manifest**:
The JSON spec declaring a Guild's intended configuration. Versioned; one per Guild. Owned by `GuildAutomationManifest`. Includes module ownership (which subsystems a Manifest claims) and last-captured-state for diff baselines.
_Avoid_: Config, spec, template (overloaded with EmbedTemplate), schema.

**Drift**:
The diff between a Manifest's declared state and the currently observed Guild state, scoped to one module. Severity-rated. Owned by `GuildAutomationDrift`.
_Avoid_: Diff (use Drift in Guild-Automation context), divergence.

**Run** (Guild Automation Run):
A single apply attempt of a Manifest: list of operations, protected-operation list, summary, diagnostics, status. Owned by `GuildAutomationRun`. Always qualify "Run" when ambiguous with general use. Runs are **partial-success-tolerant**: if one Module Executor fails mid-Run, succeeded executors' changes stay live and the next Run's Diff reconciles. No reverse-op rollback.
_Avoid_: Apply, execution, job.

**Module Executor**:
The seam responsible for one Manifest module's reconciliation. Exposes three methods over its module section: `capture(ctx)` (read live state), `diff(live, manifest)` (compute changes), `apply(diff, ctx)` (perform writes + prune stale). Lives in `shared/src/services/guildAutomation/`. One Module Executor per Manifest module type: **Roles Executor**, **Channels Executor**, **Onboarding Executor**, **Moderation Executor** (covers both `automod` and `moderationSettings` sub-sections), **AutoMessages Executor**, **ReactionRoles Executor**, **CommandAccess Executor**.
_Avoid_: Module service, module handler, applier. The word "Executor" is reserved for this seam — don't reuse it for `GuildAutomationRun` itself.

**Discord Write Adapter**:
The lower seam that hides bot-vs-backend differences in how Discord writes are performed. Module Executors depend on a `DiscordWriteAdapter` interface; bot provides a `DiscordJsAdapter` (uses the in-process `discord.js` Client), backend provides a `DiscordRestAdapter` (uses `fetch` + bot token). Means executors are pure logic and unit-testable by mocking the adapter — no real Discord client in tests.
_Avoid_: Discord client, Discord port. "Adapter" matches the existing language in the codebase.

**Capture / Diff / Apply**:
The three canonical phases of a Module Executor. **Capture** reads live Discord/DB state into a typed `LiveState`. **Diff** compares LiveState against the Manifest section to produce a `Diff` (operations to perform + stale resources to prune). **Apply** executes the Diff and returns a Module Result. Drift detection is a side-product of Capture+Diff (no separate code path).
_Avoid_: Plan/apply, read/diff/write — use these exact verbs in code and docs.

### Moderation

**Moderation Action**:
A manual moderator action taken against a Member: `warn`, `mute`, `unmute`, `kick`, `ban`, `unban`, `lockdown` (channel), `slowmode` (channel), `purge` (messages). Each Action that targets a Member produces a Moderation Case.
_Avoid_: Punishment, sanction, discipline.

**Moderation Case**:
The persisted record of one Moderation Action — case number, type, reason, duration (for timed actions), expiry, active flag, and full appeal trail. Owned by `ModerationCase`. Cases are per-Guild and per-target-User; case numbers are dense within a Guild.
_Avoid_: Incident, ticket, infraction.

**AutoMod**:
The _automatic_ enforcement subsystem, distinct from Moderation. Driven by per-Guild `AutoModSettings` and runs on every incoming message — no moderator in the loop. Does not (currently) create Moderation Cases.
_Avoid_: Auto-moderation (use as one word), filters, automod-bot.

**AutoMod Rule**:
One configured check category inside AutoMod: `spam`, `caps`, `links`, `invites`, `words`. Each Rule has its own enabled flag, threshold(s), and exemption lists on `AutoModSettings`.
_Avoid_: Filter, policy.

### Engagement

**XP** (Experience Points):
A Member's progress score within a Guild. Earned per message with a per-Member cooldown. Configured per-Guild on `LevelConfig`. Stored on `MemberXP` keyed by `(guildId, userId)`.
_Avoid_: Points, score, karma.

**Level**:
A discrete tier derived from a Member's XP. Tiers are Guild-scoped; thresholds come from `LevelConfig`. The Member-Level pair is materialised on `MemberXP.level`.
_Avoid_: Rank, tier (in writing about leveling specifically).

**Level Reward**:
A rule that grants a specific role to a Member when they reach a given Level in a Guild. One `LevelReward` per `(guildId, level)`. Triggers a Role Grant when satisfied.
_Avoid_: Role unlock, perk.

**Starboard**:
A designated Channel where messages that receive a configured emoji react-count get cross-posted. Per-Guild config (channel, emoji, threshold, self-star allowed) on `StarboardConfig`.
_Avoid_: Pinboard, hall of fame.

**Starboard Entry**:
The persisted record of one cross-posted message — original `messageId`, `authorId`, current `starCount`, and the mirrored `starboardMsgId` (the message in the Starboard channel).
_Avoid_: Star, pin.

### Role granting

**Role Grant**:
The umbrella concept for "the bot gave a Member a role". Multiple mechanisms produce Role Grants: AutoRole (on join), Level Reward (on level-up), Reaction Role (on emoji react to a designated message), and integration triggers (Twitch, etc.). `GuildRoleGrant` is the audit substrate: which `module` granted which `roleId` with which `mode`.
_Avoid_: Role assignment (overloaded with Discord's own role-assignment UI), role award.

**AutoRole**:
A rule that grants a role to a new Member when they join the Guild, optionally after a delay. Owned by `AutoRole`. Produces a Role Grant on apply.
_Avoid_: Welcome role (often used informally; reserve for an AutoRole tagged as welcome-purpose only).

**Reaction Role**:
A role granted (or removed) when a Member reacts with a specific emoji to a designated message. Owned by `ReactionRoleMapping` (one mapping per emoji) bound to a `ReactionRoleMessage` (the source message).
_Avoid_: Self-assign role, react-for-role (informal).

**Role Exclusion**:
A _rule_, not a grant: when role X is granted to a Member, role Y must be removed from them. Owned by `RoleExclusion`. Applied during the Role Grant flow.
_Avoid_: Mutual exclusion (use the term, but bind it to roles), conflict.

### Integrations

**Integration**:
The umbrella concept for any binding between Lucky and an external service. Two sub-patterns: Account Link (User-scoped credentials) and Event Subscription (Guild-scoped external watcher). Does _not_ include operational dependencies like Sentry, Cloudflare Tunnel, or the Discord API itself — those are infrastructure.
_Avoid_: Connection, plugin, extension.

**Account Link**:
A per-User credential binding to an external service. Keyed by `discordId` (the Discord user ID), not by Guild. Stores whatever the external service needs to act on the User's behalf (Last.fm `sessionKey`, Spotify OAuth tokens). Powers personalised features like scrobbling and the Spotify Recommender Candidate Source. Naming convention: `*Link` Prisma models.
_Avoid_: User integration, account binding (use "Account Link"), OAuth grant (an Account Link may _contain_ OAuth tokens, but not every Link is OAuth — Last.fm uses session keys).

**Last.fm Link**:
One Account Link instance: a User's Last.fm session key plus their Last.fm username. Owned by `LastFmLink`. Used by the scrobbling pipeline and as a signal source for the Last.fm Seeder Candidate Source.
_Avoid_: Last.fm account, scrobbler binding.

**Spotify Link**:
One Account Link instance: a User's Spotify OAuth tokens (access / refresh / expiry) plus their Spotify ID. Owned by `SpotifyLink`. Used by Spotify-data commands (e.g. `/artist`, `/album`) and as the auth context for the Spotify Recommender Candidate Source.
_Avoid_: Spotify account, Spotify OAuth.

**Event Subscription**:
A per-Guild subscription that watches an external resource and posts into a Discord channel when an event fires. One-way (external → Discord). Naming convention: `*Notification` Prisma models.
_Avoid_: Webhook (reserve for inbound HTTP), feed, subscription alone (ambiguous with `GuildSubscription`).

**Twitch Notification**:
One Event Subscription instance: a Guild watches a Twitch streamer (`twitchUserId` + `twitchLogin`) and posts a message to `discordChannelId` when the stream goes live. Owned by `TwitchNotification`.
_Avoid_: Twitch alert, stream notification (informal; use "Twitch Notification" when discussing the model or feature specifically).

### Support

**Support Report**:
A user-submitted bug report captured via the public dashboard `/support` web form: free-text context, an optional screenshot image, and a Correlation Id. Persisted as a Prisma model (image stored as a size-capped `Bytes` column). On submit, the bot pings a staff channel; a maintainer triages it in an admin-only dashboard view and may promote it to a GitHub issue.
_Avoid_: Ticket, feedback, complaint, case (reserve "case" for Moderation Case).

**Correlation Id**:
A short, self-generated id minted when a user-facing error is produced. It is written to logs, set as a Sentry tag, shown in the error surface (bot embed / web error state), and prefilled into the `/support` form — so a Support Report maps back to the exact logged error. Independent of Sentry (present even when Sentry is disabled).
_Avoid_: Trace id, request id, event id (the Sentry event id is a distinct, optional value the Correlation Id is tagged alongside).

**Support URL**:
The single canonical, configurable URL (dashboard base + `/support`) referenced by the shared error surfaces. Carries the Correlation Id (and light context) as query params. Distinct from the existing `DISCORD_INVITE_URL` (`/invite`).
_Avoid_: Help link, contact link.

## Example dialogue

> **Dev:** Autoplay broke for Server 12345 — keeps picking the same artist.
>
> **Domain expert:** Which Candidate Source is it pulling from? If the Recommendation Engine is the only one returning candidates and TrackHistory is thin, the Diversity selector won't have much to work with.
>
> **Dev:** All three Sources are firing, but Spotify Recommender is dominating the candidate pool.
>
> **Domain expert:** That's a scoring issue, not an Autoplay-vs-Recommendation issue. Look at `candidateScorer.ts` — the weights between Sources are tunable. Don't go editing the Recommendation Engine itself.

## Flagged ambiguities

**`source` field is overloaded.** Today it carries two distinct meanings depending on the object it lives on:

- On `TrackMetadata` and `Track`: the **audio Source** (`'youtube' | 'spotify' | 'soundcloud' | 'attachment' | 'virtual'`).
- On `RecommendationBasis` (autoplay pipeline): the **Candidate Source** (`'spotify-rec' | 'lastfm-similar' | 'lastfm-genre-fallback' | 'lastfm' | 'artist-fallback' | 'genre'`).

When writing new code, prefer renaming the `RecommendationBasis.source` field to `candidateSource` (or `recommender`) to remove the clash. Until then: in prose, always qualify ("audio Source" vs "Candidate Source") and never refer to either as bare "source".

**`engine` field on TrackMetadata is near-dead.** Used in exactly one path (`engine: 'preferences'` on virtual tracks). Don't propagate it. The runtime concept is **Search Engine** (`QueryType`), passed as `searchEngine` / `preferredEngine` to `player.search()`. Plan to drop `TrackMetadata.engine` when the virtual-track path is refactored.

**`UserPreferences` / `UserArtistPreference` are settings, not Integrations.** They live in the User domain but carry no external-service binding. Don't list them alongside Account Links or Event Subscriptions in docs or PR titles.
