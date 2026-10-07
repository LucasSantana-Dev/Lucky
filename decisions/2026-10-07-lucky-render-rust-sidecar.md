# ADR 2026-10-07: Weekly recap cards rendered by `lucky-render`, a Rust sidecar

**Status:** Proposed (after one adversarial critic pass, verdict "proceed with changes"; all required changes applied below)
**Deciders:** Lucas Santana
**Related issues:** #2658 (pitch switch to weekly recap, owner decision), #2652 (skips in track history), #2667 (autoplay enqueue rows), #2657 (gate query), #2655 (opus to mediaplex), #2678 (slice 1), #2690 (skips in the top lists)
**Slice 1 shipped:** #2679, #2680, #2681, #2668, released in v2.52.0. Points 2 and 3 below describe what was built.
**Related:** `decisions/2026-09-27-music-first-positioning.md`, `decisions/2026-09-26-lucky-owned-observability-stack.md`, `decisions/2026-07-12-brand-asset-regen-tooling.md`, `decisions/2026-07-02-resource-hygiene-alert-calibration-first.md`, `decisions/2026-07-11-bot-redeploy-no-bluegreen.md`

## Context

The music-first ADR pitches "Every Sunday, see what your server listened to" and lists Server Wrapped and a taste profile in Phase 3. Its positioning check fired on 2026-10-07: thumbs feedback usage was 0%, so the pitch leads with the weekly recap (#2658, confirmed by the owner in `decisions/2026-10-07-pitch-leads-with-weekly-recap.md`). None of it exists yet: the bot posts no recap and renders no images.

The gates read on 2026-10-07 (`scripts/music-first-gates.sql`): 4 to 6 weekly active guilds against 20, first-hour play 31% against 35%, day-8 activity 8% against 15%. Day-8 retention is the furthest gate, and a weekly post that lands in the server on day 7 is the one product surface aimed straight at it.

The owner wants a solid Rust project in Lucky, and has rejected a rewrite for speed: there is no measured hotspot (heap at 24%, about 17 plays a day; `2026-07-02-resource-hygiene-alert-calibration-first.md`). Rendering a share card is CPU-bound work Lucky does not do today, so it is new value, not a rewrite. Rust is wanted regardless of how the recap performs; the recap metrics below decide the product, not whether the renderer gets built.

Facts that constrain the design:

- History reads are capped twice. `TrackHistoryService` has a 7-day TTL (`ttl = 7*24*60*60`, `cutoff()`), and `getTopTracks`, `getTopArtists` and `generateStats` read through `getTrackHistory(guildId, 100)`. On writes, `trimToMaxSize` keeps 100 rows per guild. The daily sweep that actually runs is `DatabaseService.cleanupOldData` (30 days, `dataRetentionScheduler.ts`); `TrackHistoryService.cleanupOldData` (7 days) has the same name and is not scheduled.
- Autoplay writes a history row when it queues a track (#2667). That row is the exclusion source the replenisher reads (`getTrackHistory(guildId, 150)`) so autoplay does not re-recommend a queued track. Skips wrote two rows and no `skipped` flag until #2652; #2668 records `skipped` and the seconds played.
- `@resvg/resvg-js` (Rust resvg through napi-rs) renders the og-image in the frontend build (`packages/frontend/scripts/prerender-seo.ts`). That proves resvg links and runs here for a text-free SVG, not text rendering.
- The bot is a single container whose redeploy is a short gap (`2026-07-11-bot-redeploy-no-bluegreen.md`); a crash in the bot process drops every voice session. The bot has no weekly scheduler today; the only periodic job is the daily retention sweep.

## Decision

1. **The recap ships as text first, then as an image.** Slice 1 is a weekly embed built in TypeScript in the bot: top tracks, top artists, hours listened, autoplay share. That embed is the permanent fallback when the renderer is down or disabled.
2. **Recap data gets its own read path.** Slice 1 adds `getWeeklyRecap(guildId, from, to)`, which aggregates in SQL over an explicit window and does not reuse the 7-day/100-row readers. The recap window is the 7 days ending at the latest Sunday 18:00 UTC, inside the 30-day sweep, so it is never cut by the TTL. `plays` counts every start and `skips` is reported beside it; `listenedSeconds` sums the recorded seconds (#2668). The top lists count only plays that were not skipped (#2690), so a track skipped four times cannot top the week. The per-guild 100-row trim is removed (about 600 rows in prod for 30 days; the readers keep their own limits). #2667 lands in slice 1 only with its replacement exclusion source: the replenisher also excludes `queue.tracks` and an in-memory recently-recommended set, with a test that autoplay never re-recommends a queued or just-played track. `getAutoplayStats` and its `autoplayPercent` change meaning when the enqueue rows go (the old 66% was inflated), so the first recap's autoplay share has no pre-fix baseline. The unscheduled 7-day `TrackHistoryService.cleanupOldData` is removed so one sweep is authoritative.
3. **Scheduling and opt-in (slice 1).**
    - Opt-in per guild: `/recap channel #channel` and `/recap off`, stored as nullable `recapChannelId` and `recapLastPostedAt` on the guild settings (schema, zod and GET checked together).
    - Timing: an hourly in-process tick computes the latest Sunday 18:00 UTC boundary. A guild is due when `recapLastPostedAt` is null or earlier than that boundary, so the first week after opt-in is due and the cadence stays on Sundays (a "last post older than 6 days" check would drift to Saturdays). No jitter: at 1 to 3 opted-in guilds there is no burst to spread.
    - Idempotency is claim-first, not write-after-send. Before sending, a conditional update (`claimRecapWeek`) sets `recapLastPostedAt` to now only where the channel still matches and the stamp is null or older than the boundary; the tick that wins the claim is the only one that sends. A transient send failure releases the claim (`releaseRecapWeek`, matched on the exact stamp) so the next tick retries. A crash between claim and send loses that week's post rather than posting it twice, which is the cheaper failure for a weekly digest. Opt-in stamps now, so the first post is the next Sunday, not a partial week.
    - Skip the week below 5 plays (no empty post); the week is still claimed so it is not re-read hourly. Check `ViewChannel`, `SendMessages` and `EmbedLinks` before sending. A deleted or non-text channel, Discord codes 10003, 50001 or 50013, or a missing permission among those three clears the opt-in for that channel and logs once, with no retry loop. A 5xx, network error or uncached bot member keeps the opt-in for the next tick.
    - `AttachFiles` is never part of that check. When slice 3 adds the card and only `AttachFiles` is missing, the bot posts the text embed and keeps the opt-in; the text recap needs no attachment.
    - Privacy: the recap shows aggregates for the server; it names tracks and artists, never who played them (`playedBy` stays off the post).
    - Kill switch: `RECAP_RENDER_ENABLED=false` forces the text embed.
4. **Cards come from `lucky-render`, a Rust HTTP sidecar (slices 2 and 3).**
    - A crate at `packages/render/` (axum, resvg/tiny-skia, fontdb), its own container `lucky-render` on the compose network only, `small-svc` tier (128m, 0.25 CPU) unless the PoC says otherwise. Build: static musl binary on a distroless or Alpine base, linux/amd64 like the rest of the homelab images. `rust-toolchain.toml` pins the toolchain, `Cargo.lock` is committed, CI runs `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` and `cargo deny`, and the image goes to ghcr with the same tag scheme as the other services.
    - API: `POST /render/recap` takes the recap JSON and returns a 1200x630 PNG; `/healthz` backs the compose healthcheck; `/metrics` is scraped per the observability ADR, which gets the scrape entry. The bot does not `depends_on` the renderer and starts without it.
    - Contract: one JSON Schema at `packages/render/schema/recap.schema.json`, generated from the Rust serde types (schemars), with a `schema_version` field and unknown fields rejected. The TS builder validates against it in CI. `RecapPayload` is defined in slice 1 so slice 3 does not rework the builder. Rust tests keep SVG snapshot (golden) files per template.
    - Text, in this order on the raw string: normalize to NFC; drop characters XML 1.0 forbids (C0 controls except tab, newline and carriage return, lone surrogates, U+FFFE and U+FFFF) and the bidi overrides and isolates (U+202A to U+202E, U+2066 to U+2069); flatten newlines to spaces; truncate on a grapheme boundary with an ellipsis to a fixed width per slot. Only then XML-escape for the SVG context. Escaping first and truncating after can split an entity and produce an invalid SVG. Bundled fonts: a Noto Sans subset covering Latin, Cyrillic, Greek and CJK, plus Noto Emoji (monochrome; resvg does not render color emoji well), all OFL, licences shipped in the image.
    - No fetching: the sidecar never makes outbound requests. Album art is either omitted or passed by the bot as a bounded base64 image (PNG or JPEG, at most 256 KB encoded). The encoded cap does not bound memory, since a small PNG can decode to a huge buffer, so the sidecar also reads the header before decoding and rejects anything over 1024x1024 or 1,048,576 pixels (4 MB as RGBA), and sets the decoder's own allocation limit to match. A rejected image drops the art, not the card.
    - Posting: the PNG goes as an attachment referenced by the embed (`attachment://recap.png`) with alt text; a 1200x630 PNG is far below Discord's attachment limit.
5. **The bot never waits on the renderer.** It calls with a 2 s timeout from the weekly job only, never from a slash-command path. On any failure it posts the text embed and counts `lucky_bot_render_fallback_total`; an alert fires when every recap in a weekly run fell back.
6. **Slice 2 starts with a 1-hour proof of concept.** One card from fixed JSON with titles in CJK, emoji, RTL, and a 200-character string. Gates, measured with 200 renders after 10 warm-up renders inside the 0.25 CPU / 128m container on the homelab: p95 under 250 ms, peak RSS under 100 MB, no tofu boxes in the CJK/emoji fixture. A miss on any of those moves the default to the napi-rs option below. A separate visual gate covers direction: an Arabic title, a Hebrew artist and a mixed Latin/Hebrew string, compared by the owner against the same strings in a browser. That one is not fixed by switching to napi-rs (same resvg engine); a miss ships the card with recaps that contain RTL script falling back to the text embed, and the gap is recorded here.

### Slices

| Slice | Content                                                                                                                                | Language   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1     | Shipped in v2.52.0: `getWeeklyRecap`, cap removal, #2667 with its replacement exclusion, opt-in, scheduler, text embed, `RecapPayload` | TypeScript |
| 2     | `lucky-render` PoC against the gates, then crate, Dockerfile, compose, CI, observability entries                                       | Rust       |
| 3     | Recap card wired to `RecapPayload`, fallback tested with the sidecar stopped and with the kill switch                                  | Rust + TS  |
| 4     | Server Wrapped, only if the 2026-12-20 decision is continue                                                                            | Rust + TS  |

Slice 2 does not wait on slice-1 results; `RecapPayload` exists (`packages/shared/src/services/weeklyRecap.ts`).

## Consequences

- Positive: the recap starts measuring in slice 1, independent of Rust. The Rust code is a bounded service with a JSON contract, deployable and restartable on its own; a renderer panic cannot drop voice. Lucky gains its first share-card surface.
- Negative: a fourth app container and a second toolchain in CI (cargo cache, its own image build, `cargo deny`). The owner maintains Rust alone. The recap shape lives in two languages, held together by the generated schema and the CI check. Bundled CJK fonts make the image larger than the binary alone.
- Neutral: no change to the bot's audio path; mediaplex (#2655) and davey are already Rust through npm.

## Alternatives considered

- **`@resvg/resvg-js` inside the bot (napi-rs, prebuilt).** Least moving parts and already in the frontend build. Rejected as the default because it puts CPU-bound rendering and a native addon in the voice process and leaves the owner no Rust of their own to write; it is the fallback if the slice-2 gates fail.
- **A napi-rs addon written in-house.** Rust in the bot process with ABI and musl builds to own, for no gain over the sidecar.
- **Satori or canvas in Node.** No Rust, and `canvas` brings back a native compile on Alpine, the problem #2655 just removed.
- **No image, text recap only.** Cheapest, and slice 1 is exactly that. It loses the share card, the one recap surface that can travel outside the server.

## Measuring the recap

At 4 to 6 weekly active guilds, opt-in leaves perhaps 1 to 3 guilds, so no threshold here is statistics. Each opted-in guild is compared with its own 4 weeks before opting in: a play on day 8 or later after 3 of 4 recap posts counts as a positive signal for that guild. Whether the recap stays the pitch is the owner's call on that qualitative read, recorded in #2658, not an automatic gate.

## Issues to file when accepted

One per remaining slice (2 and 3), plus the observability scrape and alert entries for `lucky-render`. Slice 1 is #2678, done; it also removed the unscheduled 7-day `TrackHistoryService.cleanupOldData` and folded in #2667.

## Revisit when

- The 2026-12-20 decision is portfolio mode: keep whatever slices shipped, start no new ones.
- Rendering moves to an interactive path (a `/wrapped` command): re-check the 2 s budget and the CPU tier.
- The slice-2 gates fail: switch to `@resvg/resvg-js` in the bot and record why here.
