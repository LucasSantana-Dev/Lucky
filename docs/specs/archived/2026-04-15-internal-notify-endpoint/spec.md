---
status: shipped
created: 2026-04-15
shipped: 2026-04-15
owner: lucassantana
pr: https://github.com/LucasSantana-Dev/Lucky/pull/625
tags: rag,backend,homelab
---

# internal-notify-endpoint

## Goal
Replace brittle per-channel Discord webhooks with a bot-token-backed REST proxy so homelab alerts keep flowing even when a channel webhook is rotated or deleted.

## Context
Four homelab webhooks went 404 silently for weeks before detection. Lucky bot already holds a valid token; proxying through it lets the bot identity carry the messages.

## Approach
New `POST /api/internal/notify` on lucky-backend. Header auth via `X-Notify-Key` (shared secret in env). Body `{channelId, content|embeds}`. Calls Discord REST v10 directly with Bot token. 204 on success.

## Verification
- Supertest unit coverage: 7 cases.
- Smoke via homelab-watchdog send_discord posting to this endpoint.
