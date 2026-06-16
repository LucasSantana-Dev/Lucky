# YouTube extraction reliability: po_token on the existing extractor, gated on a homelab verification test

- Status: deferred (direction decided; commit gated on a homelab verification test)
- Date: 2026-06-16

## Context

On 2026-06-16 (~17:08 UTC) a user ran `#play <youtube url>` and the bot returned
"No results found for '[URL]' (Extractor:
com.retrouser955.discord-player.discord-player-youtubei)" twice (issue #1468). This
is the classic YouTube bot-detection / innertube-rejection symptom, not an invalid
URL.

Evidence (verified against `main`, packages/bot):

- **Extractor**: `discord-player-youtubei` pinned to `^3.0.0-beta.4` (a beta; the
  package has no stable release as of 2026-06). It is the only YouTube extractor
  registered (`playerFactory.ts loadYoutubeExtractor`), and registration is
  fire-and-forget. **No `po_token`/`visitorData`, cookies, or OAuth configured.**
- **The failure is at the metadata/innertube extraction layer.** The repo already
  uses `yt-dlp` as a _stream-level_ fallback (`streamBridge.ts createResilientStream`:
  yt-dlp direct URL → SoundCloud search → SoundCloud title-only), but that only runs
  _after_ extraction succeeds and yields metadata. An innertube rejection happens
  before streaming, so the stream fallback never engages.
- **URL queries hard-fail.** `resolveSearchEngine()` returns `QueryType.AUTO` for
  URLs (`queryUtils.ts:131`); `resolveProvider.ts:99-105` has an explicit
  "No fallbacks available for AUTO" branch that rethrows immediately. Non-URL search
  queries get a youtube→soundcloud fallback chain; URLs get none. (Note: a
  search-engine fallback for a _raw YouTube URL_ is largely useless anyway —
  `YOUTUBE_SEARCH` routes through the same youtubei extractor, and `SOUNDCLOUD_SEARCH`
  on a YouTube URL string is semantically wrong.)
- **Hosting is homelab.** Deploy chain is Cloudflare tunnel → nginx → webhook;
  outbound YouTube traffic egresses via the home ISP, i.e. **a residential IP, not a
  datacenter IP.** This moots residential-proxy strategies and means modern
  YouTube's po_token requirement (now enforced even from residential IPs for many
  requests), not IP reputation alone, is the likely gap.

Research (Phase 1, 2026 state of the art):

- `discord-player-youtubei` v3 supports `po_token` + `visitorData`
  (`generateWithPoToken` / `innertubeConfigRaw`), `cookie`, and an `authentication`
  option — per its GitHub README. (Exact option spelling to be reconfirmed against
  the installed version at implement-time.)
- YouTube **disabled standard OAuth login in 2026** — only cookie/po_token-derived
  auth works now; burner-account OAuth is dead and carries ban risk.
- `po_token` is now **bound per-video** with an inconsistent TTL (hours→months), so
  it is a continuous-refresh concern, not configure-once. Node generators
  (e.g. `youtube-po-token-generator`, bgutils) can mint tokens without a persistent
  headless browser.
- `play-dl` is effectively unmaintained; `@distube/ytdl-core` and `yt-dlp` are
  actively maintained. discord-player v7 dropped native YouTube; a custom extractor
  is the only path, so "yt-dlp as the primary metadata extractor" is a real but
  larger refactor.

Phase 2 (decision-critic, artifact-only Opus) returned **NEEDS_REVISION**: the
direction is sound (`po_token` is the least-breaking path) but the fix rests on a
load-bearing, **unverified** claim — that a Node po_token generator actually
succeeds from this residential homelab IP and that the resulting token resolves
metadata. "Reversible" is not "effective." It must be tested before code is
committed, and the revisit trigger must be tightened to prevent multi-cycle churn.

## Decision

**Direction (decided):** Fix YouTube reliability by adding `po_token` plus
`visitorData` (and, if needed, exported cookies) to the **existing**
`discord-player-youtubei` extractor, refreshed by a Node-based generator on a timer,
with structured logging and alerting on refresh failure. Keep the extractor and the
yt-dlp stream fallback unchanged. **Reject** residential proxy (IP already
residential), yt-dlp-as-primary metadata extractor (large custom-extractor
refactor — reserved as the escalation path), burner OAuth (disabled plus ban risk),
and "Spotify/SoundCloud only" (feature regression).

**Commit gate (must pass before writing the primary fix):**

1. Run a Node po_token generator **on the homelab host** and confirm it mints a
   token + `visitorData` from the residential IP.
2. With that token, confirm a youtubei **metadata extraction succeeds** for a known
   YouTube URL that currently fails.
3. From homelab logs, confirm _which_ innertube path rejects today (`/youtubei/v1/
player` vs `/search`) and whether it is 403 / empty-innertube vs. a genuine
   no-match.
4. Reconfirm the installed youtubei beta accepts the po_token/visitorData options
   (vs. requiring a fork).

If the gate passes → implement the primary fix with refresh + alerting. If the
generator fails on the residential IP, or the **first** refresh cycle fails/degrades
→ **escalate directly to yt-dlp-as-primary-extractor** (do not chase multiple
po_token refresh cycles).

This is **deferred**, not rejected, because steps 1–3 require homelab access/logs the
implementing agent does not have from CI; #1468 is labeled `needs-info` pending that
evidence.

The independent, immediately-actionable slice (does not need the gate): add
**structured logging on youtubei extraction failure** (endpoint + status) so the
operator gets visibility and the gate's step-3 evidence accrues naturally, and
surface a clearer user-facing error distinguishing "extraction blocked" from
"invalid URL." A search-engine fallback for AUTO/URL is explicitly **not** pursued
(useless for a raw YouTube URL).

## Alternatives considered

- **yt-dlp as the primary metadata extractor** — actively maintained, sidesteps
  innertube detection; rejected as the _first_ move due to custom-extractor effort,
  kept as the **escalation path** if po_token proves high-maintenance.
- **Residential proxy + cookies** — moot: the homelab egress is already residential.
- **discord-player-youtube + cookies only** — simpler, but brittle (cookie expiry)
  and no clear advantage over po_token on the extractor already in use.
- **Burner Google OAuth** — YouTube disabled OAuth login in 2026; ban risk; dead.
- **Spotify/SoundCloud only** — eliminates the risk but is a user-facing feature
  regression.
- **Code-only AUTO/URL fallback chain** — does not address the root cause (a failed
  YouTube URL has no meaningful non-youtubei fallback); rejected as masking.

## Consequences

- **Positive:** smallest reversible change that preserves the current architecture;
  no new lock-in; clear escalation path; the decision survives even though the
  commit is blocked, so the next operator-assisted session can act immediately.
- **Negative:** po_token is per-video with an unstable TTL → ongoing refresh +
  monitoring burden on a single-operator homelab; silent token rot is the primary
  failure mode (mitigated by mandatory alerting). The fix cannot be completed
  autonomously from CI.
- **Neutral:** youtubei stays on a beta pin for now; a future stable release may
  simplify or change the config surface.

## Revisit when

- The homelab po_token verification test (gate steps 1–4) is run — pass → implement;
  fail → escalate to yt-dlp-as-primary.
- The **first** po_token refresh cycle fails or degrades quality → escalate
  immediately to yt-dlp-as-primary (no multi-cycle chasing).
- `discord-player-youtubei` ships a stable (non-beta) release, or discord-player
  re-introduces a maintained YouTube path → re-evaluate the extractor choice.
- YouTube changes its bot-detection/po_token regime again (per-video binding
  relaxed/tightened) → re-evaluate refresh cadence and the proxy rejection.
