# Tasks

> Generated from `~/.claude/plans/lucky-next-phases-ultraplan.md` via `spec-new`.
> Tick items as they land. When all ✓ and PR merged → `spec-ship`.

## Phase 0 — Visibility Quick Wins ✅ SHIPPED
- [x] `LICENSE` (ISC) at repo root (PR #728)
- [x] README hero + invite URL (PR #728)
- [x] Social preview verified (PR #728)
- [x] top.gg submission pack (PR #728)
- [x] top.gg vote webhook endpoint (PR #729)
- [x] vote-tier badge in dashboard header (PR #737)

## Phase 1 — Engagement Loops MVP ✅ SHIPPED
- [x] Social actions `/hug` `/pat` `/kiss` + counters
- [x] Birthdays schema + `/birthday set|clear` (PR #738)
- [x] Birthday scheduler + `/birthday channel` (PR #740)
- [x] Birthday role auto-grant + `/birthday role` (PR #743)
- [x] `/birthday list` — next 5 upcoming (PR #742)
- [ ] Polls & Giveaways module (S) — viral growth lever, not started
- [ ] Roleplay Phase 1 counter extension

## Phase 2 — Premium Tier Surfacing (in progress)
- [x] **PR 1**: `GuildSubscription` + `StripeWebhookEvent` Prisma models + `PremiumService.isPremium() / .getSubscription()` with fail-closed DB semantics (PR #746)
- [x] **PR 2 env prep**: `STRIPE_*` placeholders in `.env.example` (PR #747)
- [x] **PR 2 skeleton**: `/api/billing/{status,checkout,portal}` + `DELETE /api/billing/subscription` + `POST /webhooks/stripe` returning 503 when `STRIPE_ENABLED` unset (PR #749)
- [x] **PR 3 — first gate**: premium autoplay buffer 8 → 16 (PR #750)
- [ ] **PR 2 real**: `npm i stripe`, replace 4 `AppError(501)` stubs with real Stripe session creation, wire `express.raw()` before global JSON parser for `/webhooks/stripe`, signature verification via `stripe.webhooks.constructEvent`, idempotent dedupe on `StripeWebhookEvent.id` (see handoff file)
- [ ] **PR 4**: dashboard `/settings/billing` route (Next.js), premium embed-color gate, leaderboard row-limit gate

### Gate inventory (audited 2026-04-20)
Surfaces that are premium-ready vs. need wiring:
- `packages/bot/src/utils/music/autoplay/replenisher.ts` — **✅ gated** via `premiumService.isPremium` (PR #750)
- `packages/bot/src/utils/music/collaborativePlaylist.ts` — **unshipped surface**, natural P2 gate (deferred per roadmap)
- `UserPreferences.embedColor` (Prisma, defaults `0x5865F2`) — premium palette gate candidate
- `packages/bot/src/functions/management/commands/helpers/serversetupCriativaria.ts:550` — hardcoded `embedColor: '0x8B5CF6'` for premium-server setup wizard; good anchor for premium-only palette
- Leaderboard row-limit: no hardcoded `10`-cap found in `packages/*/src`; likely frontend pagination — investigate `packages/frontend/src` before PR 4
- Only `PremiumService` and `replenisher.ts` reference `isPremium` across all `packages/*/src` — rest of the surface is greenfield

## Phase 3 — Engagement v2 + Analytics (gated)
Unblock only after Phase 2 hits $50 MRR (per ultraplan KPI table).
- [ ] Economy & currency system (earn/spend, leaderboards)
- [ ] Server analytics dashboard (listening trends, member activity)
- [ ] Automod presets v2

## Phase 4 — BR Cultural Fit + Scale (gated)
- [ ] `/playlist collaborative` command surface (service already exists at `packages/bot/src/utils/music/collaborativePlaylist.ts`)
- [ ] PT-BR localised dashboard + slash commands
- [ ] Tickets/Support module

## Measurement Gates
| Gate | Target |
|---|---|
| GitHub ⭐ | 15 → 30 → 60 |
| top.gg 🗳 | 50 → 150 → 400 |
| Server installs | 25 → 100 → 300 |
| Avg `/play`/day | 30 → 100 → 300 |
| Premium MRR | — → $50 → $300 |

If a gate stalls 2+ weeks, pause the next phase and debug.
