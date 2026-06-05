# ADR 2026-06-04 — Support report intake + correlation in error surfaces

**Status:** Accepted
**Issue:** #1174
**Glossary:** CONTEXT.md → Support Report, Correlation Id, Support URL

## Context

User-facing error surfaces already promise support ("…Please contact support if this
persists." — `errorSanitizer.ts:60`) but point nowhere — a dead-end. There is no
structured way to capture the screenshot + context needed to reproduce a bug (the
YouTube "Unknown Track" class was only debuggable because a user pasted a screenshot
by hand). We need (a) an intake that captures image + context, and (b) error surfaces
that link to it with an id that maps a report back to the logged error.

Relevant existing state: dashboard uses Discord OAuth; a `DISCORD_INVITE_URL`/`/invite`
redirect exists; **no object-storage / upload infra** exists; bot has 70 slash commands;
`captureException` exists but discards the Sentry event id; Sentry is **optional**
(runtime capture skipped when `SENTRY_DSN` is unset or `SENTRY_ENABLED=false` —
`SENTRY_AUTH_TOKEN` only gates CI release uploads). Postgres is the system of record
and the project trend is minimal external infra (Redis is being scoped down to music
pub/sub; KV/cache use is migrating to Postgres + in-memory).

## Decision

1. **Intake = web form on the dashboard (`/support`).** A public route that accepts
   free-text context + an optional screenshot. (Chosen over the operator-recommended
   `/report` slash command — see Alternatives.)
2. **Image storage = Postgres `Bytes` column, size-capped (≤5 MB), single image,
   png/jpg/webp.** No new storage service/credentials; fits Postgres-as-SoT and the
   low volume of bug reports.
3. **Access = public, no login.** A user mid-error shouldn't be forced through OAuth.
   Spam-mitigated by IP rate-limiting (reuse the backend `writeLimiter` pattern) + size
   caps + content-type allowlist.
4. **Triage = DB + Discord staff-channel ping + admin-only dashboard view.** On submit:
   persist the Support Report, then the bot posts a summary + link to the admin report
   view (where the image renders) in a configured staff channel. A maintainer triages
   there and **manually** promotes real reports to a GitHub issue. No public→tracker
   auto-write (spam gate).
5. **Correlation Id = self-generated short id**, written to logs, set as a Sentry tag,
   shown in the error surface, and prefilled into the form. Works even when Sentry is
   off. (Chosen over the Sentry event id, which is null without a token.)
6. **Surfaces = bot error embeds + web error states**, with Correlation Id + light
   context (guild / command / error-category) prefilled as hidden form fields. Delivered
   in phases (bot embeds first, then web). A single canonical configurable **`SUPPORT_URL`**
   (dashboard base + `/support`) is referenced by the shared error surfaces.

## Alternatives considered

- **`/report` slash command (image via Discord attachment → GitHub/support channel)** —
  _recommended by the assistant_: reuses slash infra, free Discord-CDN image hosting,
  zero storage infra, keeps users in Discord where errors occur. **Rejected by operator**
  in favour of the richer web-form UX.
- **Cloudflare R2 / homelab disk / Discord-CDN relay** for images — rejected: R2/disk add
  net-new infra/creds/serving for a low-volume feature; Discord-CDN URLs rotate. Postgres
  Bytes is simplest and durable at this volume.
- **OAuth-required or signed-token-gated form** — rejected: OAuth adds friction mid-error;
  token-gating blocks general/unsolicited feedback. Public + rate-limit chosen.
- **Auto-create a GitHub issue per submission** — rejected: a public form auto-writing to
  the tracker is a spam vector; human-gated promotion instead.
- **Sentry event id as the correlation id** — rejected: null when Sentry is disabled.

## Consequences

- **Positive:** error surfaces stop being dead-ends; reproduction context (image +
  correlation id) is captured structurally; no new storage service; one id spans
  logs/Sentry/report.
- **Negative / watch:** blobs in Postgres (acceptable at low volume; revisit if it grows);
  a public endpoint accepting uploads is an abuse surface (mitigated by rate-limit + caps +
  allowlist); manual promote-to-issue is a human step (intentional).
- **New infra:** a `SupportReport` Prisma model + migration; a public `POST /support`
  (multipart) + admin list/detail routes; a frontend `/support` form + admin view; a
  `SUPPORT_URL` config + staff-channel id; Correlation Id plumbing through the shared
  error path.

## Revisit when

- Bug-report volume makes Postgres image storage costly → migrate images to R2 (the
  storage decision is the most likely to flip).
- Spam/abuse on the public endpoint proves unmanageable → add OAuth or token-gating.
- Manual triage becomes a bottleneck → revisit auto-issue creation with filtering.
