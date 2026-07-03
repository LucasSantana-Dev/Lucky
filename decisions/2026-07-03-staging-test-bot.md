# Staging test bot for pre-merge live smoke

- Status: accepted
- Date: 2026-07-03

## Context

The staging stack (`docker-compose.staging.yml`) was deliberately **bot-less**:
the dashboard reads guild data via Discord REST, so it needs no gateway bot, and
"two bots cannot share one token."

That left a gap. Lucky is mostly a **bot** — commands, message handlers,
schedulers. None of it could be verified on a real guild before merge; only unit
mocks. The gap bit when the destructive-interaction merge gate
(`decisions/2026-06-21-destructive-interaction-merge-gate.md`) required a live
on-guild smoke for a channel-cleanup PR that deletes messages, and there was no
bot to smoke it with.

## Decision

Add an **opt-in, test-only** bot service to the staging stack.

- It logs in with a **separate Discord app** token, `STAGING_DISCORD_TOKEN` — not
  the production token. In `docker-compose.staging.yml` the bot's
  `DISCORD_TOKEN` is explicitly overridden to `${STAGING_DISCORD_TOKEN:-}`,
  which wins over the `common-app-env` production token. The empty default means
  a missing token yields a **clean login failure, never a production login**.
- Because it's a distinct app, it is only ever in guilds where that app was
  invited, so it **cannot act in production guilds** (e.g. Criativaria).
- It is **gated on the token's presence**: `scripts/deploy-staging.sh` includes
  `bot` in the build/up set only when `STAGING_DISCORD_TOKEN` is set in
  `.env.staging`. Merging this change with no token configured is a no-op — the
  stack does not crash-loop.
- It shares the isolated `lucky-staging-postgres` / `lucky-staging` network, so
  its data never touches production.

## One-time setup (operator)

1. Create a **new** Discord application + bot at
   <https://discord.com/developers/applications> (e.g. "Lucky Staging").
2. Create or pick a **test guild** and invite the new bot to it (needs the
   permissions the feature under test uses, e.g. Manage Messages for cleanup).
3. On the homelab, add the token to the staging env file
   (`/home/luk-server/lucky-staging/.env.staging`):
   `STAGING_DISCORD_TOKEN=<the test app's token>`
4. Re-deploy staging (label a PR `staging`, or run the deploy script). The bot
   now comes up automatically.

After that, any bot PR can be smoke-tested pre-merge: label it `staging`, wait
for the branch bot to deploy, exercise the feature in the test guild.

## Consequences

- **Positive:** the destructive-interaction gate becomes a real gate for bot
  work, not a checkbox. Every future bot feature gets pre-merge live
  verification.
- **Negative:** one more idle gateway connection on the shared staging stack —
  in slight tension with the Phase-C staging auto-stop goal
  (`adr_2026-07-02_resource_hygiene`). Mitigated: small-svc limits (128m /
  0.25 cpu) and it only runs when a token is configured.

## Revisit when

- Staging moves to on-demand start/stop (Phase C) — fold the bot into the same
  lifecycle.
- A second test guild / multi-tenant smoke is needed — then parameterize the
  invited guild set instead of relying on app-invite scope.
