# Lucky toolchain modernization — Node & TypeScript

- **Date:** 2026-07-12
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Method:** `/research-and-decide` — repo evidence + external research (document-specialist) → decision-critic (verdict NEEDS_REVISION; both blockers resolved below) → this ADR

## Context

Operator directive: *"node and npm should always be latest stable."* npm was already moved to
`npm@latest` (separate merged PR). This ADR resolves **Node base image** and **TypeScript
version** for the Lucky monorepo (packages shared/bot/backend/frontend; discord.js v14;
`@discordjs/opus ^0.10.0` — the **only** native dep; Next.js frontend; prod = homelab Docker,
merge-to-main = prod deploy; single-container bot).

Current state: root `engines "node": ">=22 <27"`; Docker base = `node:24-alpine` (build+prod);
CI = `node-version: '22'` (17 spots) → **CI tests on 22 but prod ships 24**. TypeScript `^6.0.3`;
`@typescript-eslint ^8.59`.

External research (2026-07, cited): Node **26.5.0 is latest but CURRENT, not LTS until Oct 2026**;
Active LTS = 24 (Krypton) + 22 (Jod). Node 26 = new ABI (NODE_MODULE_VERSION 147) → native
modules must rebuild; **`@discordjs/opus` has no node-26 prebuild** (alpine source-compile).
**TypeScript 7.0 GA'd 2026-07-08** but ecosystem is hard-blocked: `@typescript-eslint` peer-deps
`typescript <6.1.0` (no TS7 until the 7.1 API, ~Oct 2026), and **Next.js 16 build breaks on TS7**.

## Decision

**Interpretation of the directive (critic's blocker #1, resolved):** for a *production* bot,
"latest stable" = **latest LTS**, not the Current release. Node 24 (Krypton) IS the latest
production-recommended LTS. This is the sound default; operator can correct if bleeding-edge
Current was actually intended.

1. **Node: stay on 24 (LTS).** Do NOT bump to 26 — it is Current (not LTS until Oct 2026) and
   `@discordjs/opus` (the only native dep — confirmed, no sharp/canvas/bcrypt) has no node-26
   prebuild.
2. **Unify CI onto Node 24** (`node-version '22' → '24'`, all 17 workflow spots) so CI tests
   exactly what Docker/prod runs — closes a real test-vs-prod gap. **Keep `engines ">=22 <27"`
   unchanged** (dropping 22 is a separate low-value change with a publish caveat — root
   package.json is not marked `private` — so leave it).
3. **TypeScript: stay on 6.x; defer TS7.** Ecosystem hard-blocked (`@typescript-eslint` +
   Next.js 16). This is orthogonal to the Node decision.

## Alternatives considered

- **Bump Node to 26 now** (literal "latest stable = Current") — rejected: not LTS, opus has no
  node-26 prebuild → alpine source-compile risk on a single-container prod bot; the artifact's
  earlier claim that PR #846 already made node:26-alpine build is **unverified** (Dockerfile
  comment, not a tested CI build) — so 26 is not de-risked. (Critic blocker #2, resolved by
  dropping the claim and gating node-26 on a real CI build.)
- **Adopt TS7 now** — rejected: `@typescript-eslint` peer-dep `<6.1.0` breaks lint; Next.js 16
  build breaks. Hard gate.
- **Leave CI on 22** — rejected: CI must test what prod ships (24).
- **Drop Node 22 from engines** — deferred: harmless to keep; root is not `private`, so avoid
  narrowing a possibly-consumed range without need.

## Consequences

- **Positive:** CI now tests Node 24 = prod parity (the one real bug-surface here); zero native
  ABI churn (stay 24); no ecosystem breakage (stay TS6); low-risk, ~17-line workflow change.
- **Negative:** not "bleeding-edge latest" per a literal reading of the directive — but that
  reading is unsafe for a prod bot. Node 24 & TS6 lag the newest releases by one major each.
- **Neutral:** `@discordjs/opus` still source-compiles per ABI (unchanged); engines range
  unchanged.

## Revisit when

- **Node 26:** ALL of — (a) Node 26 reaches **LTS** (~Oct 2026); AND (b) `@discordjs/opus`
  publishes a node-26 (musl) prebuild OR a CI `docker build --build-arg NODE_VERSION=26-alpine`
  job proves the source-compile works. Then bump Docker + CI together to 26.
- **TypeScript 7:** ALL of — (a) TS **7.1** GA (stable programmatic API, ~Oct 2026); AND
  (b) `@typescript-eslint` ships a TS7-compatible release; AND (c) Next.js fixes TS7 detection.
  Then fold Lucky into the org-wide TS7 migration.
- Re-open early if a security advisory forces a Node/TS bump.
