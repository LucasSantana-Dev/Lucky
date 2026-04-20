---
status: proposed
created: 2026-04-20
owner: lucassantana
pr:
tags: premium,monetization,stripe,dashboard,phase-2
---

# premium-tier-foundation

## Goal
Introduce paid tiers on Lucky so the engagement base from Phases 0–1 (autoplay depth, reliability, dashboard, leaderboard, birthdays, social, voterewards) has a revenue surface. Target: **$50/month MRR within 60 days of launch** from ~3–5 paying guilds at a single $2.99/mo tier, proving the pricing loop before scaling tiers.

The upstream ultraplan (`~/.claude/plans/lucky-next-phases-ultraplan.md`) assumed backend premium guards already existed (per the deferred `/playlist collaborative` roadmap entry). **Audit 2026-04-19 showed they do not.** No `requirePremium`, no Stripe, no subscription schema. This spec replaces that assumption with a concrete greenfield plan.

## Non-goals
- **Not** a multi-tier ladder. Single $2.99/mo tier for MVP. Ladder comes later if MRR gate clears.
- **Not** a trial/coupon engine. A manual admin-set flag + Stripe-managed trials are enough for the first 90 days.
- **Not** usage-based billing. Flat monthly subscription only.
- **Not** a team/enterprise SKU. Per-guild only.

## Pricing anchor
- **Rythm**: $4.99/mo
- **MEE6**: $1.99–$42.49/mo
- **Nekotina**: freemium
- **Dyno**: $10–$30/mo

**Lucky tier: $2.99/mo per guild.** Undercuts Rythm, premium-feeling vs. MEE6 entry. Single price keeps the checkout flow trivial.

## Approach

### 1. Schema
New Prisma models:

```prisma
model GuildSubscription {
  id                    String    @id @default(cuid())
  guildId               String    @unique
  stripeCustomerId      String?
  stripeSubscriptionId  String?   @unique
  status                String    // "active" | "trialing" | "past_due" | "canceled" | "incomplete"
  currentPeriodEnd      DateTime?
  priceId               String?
  canceledAt            DateTime?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([guildId])
  @@index([status])
  @@map("guild_subscriptions")
}

model StripeWebhookEvent {
  id        String   @id @default(cuid())
  eventId   String   @unique   // Stripe event.id — dedupe key
  type      String
  payload   Json
  createdAt DateTime @default(now())

  @@index([type, createdAt])
  @@map("stripe_webhook_events")
}
```

- `GuildSubscription.status` is authoritative (mirrors Stripe). `isPremium(guildId) := subscription.status IN ('active', 'trialing') AND currentPeriodEnd > now()`.
- `StripeWebhookEvent` dedupes replayed webhooks (Stripe recommends idempotency keys).

### 2. Backend
- `services/PremiumService.ts` — single read API:
  - `isPremium(guildId): Promise<boolean>`
  - `getSubscription(guildId): Promise<GuildSubscription | null>`
  - `requirePremium(guildId): throws AppError(402) if not premium`
- `routes/billing.ts`:
  - `POST /api/billing/checkout-session` — requireAuth + guild manage perm → creates Stripe Checkout Session → returns `{ url }`
  - `POST /api/billing/portal-session` — requireAuth + guild manage perm → returns Stripe billing portal URL
  - `GET /api/me/premium-guilds` — requireAuth → guilds where the user has Manage Server + active subscription
- `routes/webhooks.ts` (extend existing vote webhook file):
  - `POST /webhooks/stripe` — verifies `stripe-signature` against `STRIPE_WEBHOOK_SECRET`, dedupes via `StripeWebhookEvent`, updates `GuildSubscription` for `customer.subscription.{created,updated,deleted}` + `invoice.paid` + `invoice.payment_failed`.

### 3. Feature gates (first 3)
Start small. Three feature gates prove the loop without risky over-scoping:

1. **Premium autoplay depth** — non-premium guilds capped at 20-song autoplay backfill; premium uncapped. Already configurable in `autoplay/replenisher.ts`; just wire the ceiling to `isPremium`.
2. **Premium-only commands** — `/leaderboard` extended limit (50 instead of 10), `/birthday role` (keeps feature but promotes the perk). Implement as a thin `requirePremium()` check at command entry.
3. **Custom embed color in dashboard** — `GuildSettings.embedColor` already exists. Non-premium: fixed `0x5865F2`. Premium: user-editable. Pure frontend gate + backend guard on the PATCH endpoint.

### 4. Dashboard
- New `/settings/billing` route in the React dashboard
- "Upgrade to Lucky Premium" button → POST to `/api/billing/checkout-session` → `window.location = url`
- Active subscription card → "Manage billing" → `/api/billing/portal-session` → redirect
- Per-feature toggle screens show a lock badge for premium-gated features with CTA back to billing

### 5. Bot UX
- No command-level checkout (Discord OAuth flow too heavy for slash commands)
- `/voterewards` + `/leaderboard --limit > 10` reply gracefully with a dashboard link for non-premium users: *"This is a Lucky Premium perk. Upgrade at <https://lucky.lucassantana.tech/settings/billing>."*

## Sequencing (4 PRs)

| # | Effort | Dependencies | Contents |
|---|---|---|---|
| 1 | S | — | Schema + migration + `PremiumService.isPremium()` + unit tests. No Stripe yet. Everything returns `false`. |
| 2 | M | PR 1, Stripe account | `routes/billing.ts` (checkout + portal sessions) + `routes/webhooks.ts` Stripe handler + webhook dedupe. Behind `STRIPE_ENABLED=false` env flag so deploy is safe even without the secret. |
| 3 | S | PR 2, staging Stripe test mode | First feature gate (premium autoplay depth — minimal blast radius). Wires `PremiumService.isPremium` into `autoplay/replenisher.ts`. |
| 4 | M | PR 3 | Dashboard `/settings/billing` route + upgrade CTA + frontend-only feature gates (embed color, leaderboard limit). |

Timeline: 1 PR per working day = **4 days to first paying customer**.

## Verification
- **Unit**: `PremiumService.isPremium` covers {no subscription, active, trialing, canceled, past_due, expired period end}.
- **Integration**: Stripe Checkout session creation + webhook round-trip via Stripe CLI (`stripe listen --forward-to ...`). Confirm `GuildSubscription` row reflects every relevant event.
- **E2E**: Playwright flow in the dashboard — unauthenticated → upgrade CTA → Checkout → back to dashboard shows "Premium active" → portal → cancel → status flips to `canceled`.
- **Rollback**: all 4 PRs behind `STRIPE_ENABLED` env flag so any failure can be `false`-gated in seconds without reverts.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Webhook signature failure silently drops status updates | Log every event ID received + returned 200/4xx to Sentry. Dedupe by `event.id`. Set up a `stripe_webhook_events` dashboard on metrics. |
| Clock skew → `currentPeriodEnd` treated as active past Stripe's expiry | Trust Stripe's `status` field, not the period end. Period end is informational. |
| Bot processes drift from backend on subscription status | Bot reads via backend HTTP (internal-key auth, same pattern as `/api/internal/votes/:userId`) rather than hitting Postgres directly. Cache 60s in-memory to avoid per-command roundtrips. |
| Discord ToS on paid features | Read Discord's monetization terms before launch. Self-hostable side stays free; premium only on the hosted instance. |
| Stripe account review delays | Set up account early (week 1), get account into live mode before PR 2 lands. |

## Out of scope (future specs)
- Team/enterprise SKU with seat billing
- Annual billing discount
- Multi-tier ladder (Pro / Legend / Enterprise)
- Discord Server Subscriptions native integration
- Referral / affiliate program

## References
- `~/.claude/plans/lucky-next-phases-ultraplan.md` (Phase 2 in the broader roadmap)
- `~/.claude/plans/lucky-competitive-analysis.md` (pricing anchor)
- Stripe Billing docs — webhook signature verification, subscription lifecycle events
