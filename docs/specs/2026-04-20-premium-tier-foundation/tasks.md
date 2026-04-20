---
spec: 2026-04-20-premium-tier-foundation
status: proposed
---

# tasks

## PR 1 — Schema + PremiumService stub (S, ~2h)

- [ ] Add `GuildSubscription` model to `prisma/schema.prisma`
- [ ] Add `StripeWebhookEvent` model to `prisma/schema.prisma`
- [ ] Create migration `<timestamp>_add_premium_tier_schema`
- [ ] `packages/shared/src/services/PremiumService.ts`:
  - [ ] `isPremium(guildId): Promise<boolean>`
  - [ ] `getSubscription(guildId): Promise<GuildSubscription | null>`
  - [ ] Status check: `status IN ('active', 'trialing')` AND (no `currentPeriodEnd` OR `currentPeriodEnd > now()`)
- [ ] Unit tests covering all status combinations + null case
- [ ] Export from `packages/shared/src/services/index.ts`

Acceptance: `PremiumService.isPremium('any-guild-id')` returns `false` cleanly (no subscription row exists yet). TypeScript clean. No Stripe dependencies added.

## PR 2 — Stripe billing + webhooks (M, ~6h)

- [ ] Install `stripe` SDK in `packages/backend`
- [ ] Env vars added to `.env.example`:
  - [ ] `STRIPE_ENABLED` (default `false`)
  - [ ] `STRIPE_SECRET_KEY`
  - [ ] `STRIPE_PUBLISHABLE_KEY`
  - [ ] `STRIPE_PRICE_ID`
  - [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `packages/backend/src/services/StripeService.ts`:
  - [ ] Lazy singleton (`new Stripe(...)` only when `STRIPE_ENABLED`)
  - [ ] `createCheckoutSession(guildId, userDiscordId, returnUrl)`
  - [ ] `createBillingPortalSession(guildId, returnUrl)`
  - [ ] `verifyWebhookSignature(rawBody, signature)`
- [ ] `packages/backend/src/routes/billing.ts`:
  - [ ] `POST /api/billing/checkout-session` — requireAuth + guild ManageGuild perm
  - [ ] `POST /api/billing/portal-session` — requireAuth + guild ManageGuild perm
  - [ ] `GET /api/me/premium-guilds` — requireAuth
- [ ] `packages/backend/src/routes/webhooks.ts`: extend with `POST /webhooks/stripe`
  - [ ] Use `express.raw({ type: 'application/json' })` for the route (NOT the global JSON parser — Stripe needs raw body for signature verification)
  - [ ] Dedupe on `event.id` via `StripeWebhookEvent`
  - [ ] Handle `customer.subscription.created|updated|deleted` + `invoice.paid` + `invoice.payment_failed`
- [ ] Tests: webhook round-trip with `stripe.webhooks.constructEvent` against a fixture signature
- [ ] Documentation: `docs/STRIPE_SETUP.md` with Stripe CLI `stripe listen` dev-loop instructions

Acceptance: With `STRIPE_ENABLED=false` everything is inert and returns 503 cleanly. With `STRIPE_ENABLED=true` + test-mode secrets, a Checkout Session can be created via curl, followed in Stripe Dashboard, and the resulting subscription row appears in the DB.

## PR 3 — First feature gate: premium autoplay depth (S, ~2h)

- [ ] Identify the cap in `autoplay/replenisher.ts` (hardcoded number around the replenish threshold)
- [ ] Wire `PremiumService.isPremium(guildId)` into the replenisher path
- [ ] Non-premium: cap backfill at 20 songs
- [ ] Premium: uncapped (or 200-song ceiling for safety)
- [ ] Unit tests: mock `PremiumService`, verify replenisher returns capped list for non-premium, uncapped for premium
- [ ] Add to CHANGELOG `[Unreleased]` under **Added** with clear premium callout

Acceptance: Integration test in a dev environment with `STRIPE_ENABLED=true` — a premium guild's autoplay queue replenishes past the 20-song threshold; a non-premium guild stops at 20.

## PR 4 — Dashboard billing route + second/third gates (M, ~6h)

- [ ] `packages/frontend/src/pages/BillingPage.tsx`:
  - [ ] "Upgrade to Lucky Premium" CTA → `apiClient.post('/billing/checkout-session')` → `window.location = data.url`
  - [ ] Active subscription card with "Manage billing" → portal session
  - [ ] Pricing breakdown + 3 feature gate descriptions
- [ ] Add route to `App.tsx` at `/settings/billing`
- [ ] Sidebar entry under Settings
- [ ] Feature gate 2: `GuildSettings.embedColor` editable only when premium (backend PATCH guard + frontend input disabled state)
- [ ] Feature gate 3: `/leaderboard --limit > 10` returns gentle "Premium only" message with dashboard link for non-premium guilds
- [ ] Add all 3 gates to CHANGELOG

Acceptance: Playwright smoke test — unauthenticated user sees upgrade CTA, authenticated non-premium user sees upgrade CTA, authenticated premium user sees portal link.

## Post-launch monitoring (first 30 days)

- [ ] Weekly: check Stripe dashboard for subscription growth vs. target
- [ ] Weekly: verify webhook delivery success rate > 99% in Stripe logs
- [ ] Bi-weekly: review Sentry for `StripeService` / `/webhooks/stripe` errors
- [ ] After 30 days: decide tier ladder vs. single-tier based on conversion signal
