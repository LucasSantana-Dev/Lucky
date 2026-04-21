# top.gg Submission Pack

Copy-paste artifacts for filing Lucky on https://top.gg. Launch sequence in `~/.claude/plans/lucky-next-phases-ultraplan.md` Phase 0.

## 1. Bot identification

| Field | Value |
|---|---|
| Client ID | `962198089161134131` |
| Invite URL | `https://discord.com/oauth2/authorize?client_id=962198089161134131&scope=bot%20applications.commands&permissions=36970496` |
| Website | `https://lucky.lucassantana.tech` |
| GitHub | `https://github.com/LucasSantana-Dev/Lucky` |
| Support server | *Create a Lucky Discord server first (Phase 0 task #7), then paste invite here.* |

**Note on permissions integer `36970496`** — this is Read Messages (1024) + Send Messages (2048) + Manage Messages (8192) + Embed Links (16384) + Attach Files (32768) + Add Reactions (64) + Use External Emojis (262144) + Connect (1048576) + Speak (2097152) + Use Voice Activity (33554432). Scoped — not Admin. Use this for top.gg. The README invite still uses `permissions=8` (Admin) to match the existing Landing page; don't mix the two.

## 2. Short description (120 char cap)

```text
Self-hosted Discord music bot with autoplay, dashboard, and moderation. TypeScript, open source, 2500+ tests.
```

Character count: 111.

## 3. Long description (Markdown supported)

```markdown
# Lucky 🎵

**Self-hosted Discord music bot + React dashboard.** Production-grade TypeScript monorepo — music, moderation, engagement — fully open source under ISC.

## Highlights
- 🎵 **Music**: YouTube + Spotify + SoundCloud · autoplay with diversity-aware recommendations · `/queue smartshuffle` · `/session save|restore`
- 🛡️ **Moderation**: warn · mute · kick · ban · case tracking · `/digest` weekly reports · automod presets
- 📊 **Dashboard**: Discord OAuth · RBAC · guild management · feature toggles at [lucky.lucassantana.tech](https://lucky.lucassantana.tech)
- 🎯 **Engagement**: leveling · starboard · Last.fm scrobbling · Twitch notifications
- ⚡ **Reliability**: music watchdog auto-recovery · provider health cooldown · queue snapshot restore · cold-Redis survival

## Why pick Lucky
- Real autoplay — uses Spotify Discover + genre graphs, not a static playlist loop
- Self-hostable in Docker — no vendor lock-in, no hidden costs
- Active development — [releases every few days](https://github.com/LucasSantana-Dev/Lucky/releases)
- 2500+ tests, SonarCloud A rating, zero production incidents in 2026

## Get started
- [Invite Lucky](https://discord.com/oauth2/authorize?client_id=962198089161134131&scope=bot%20applications.commands&permissions=36970496) to your server
- [Star on GitHub](https://github.com/LucasSantana-Dev/Lucky) if you find it useful
- Report issues on [GitHub Issues](https://github.com/LucasSantana-Dev/Lucky/issues)

Made with ❤️ in Brazil · Open source under [ISC](https://github.com/LucasSantana-Dev/Lucky/blob/main/LICENSE)
```

## 4. Tags

Primary (pick 3): `music`, `moderation`, `dashboard`
Secondary (add up to 5): `typescript`, `open-source`, `self-hosted`, `autoplay`, `spotify`

## 5. Banner spec

- Size: 1000×500 px (top.gg recommendation)
- Source: adapt existing `assets/lucky-social-preview.png` (currently 252 KB, 1280×640) — crop/resize
- Must include: "Lucky" wordmark, bot avatar, one-line value prop, subtle link to `lucky.lucassantana.tech`
- Keep text < 30% of canvas so Discord thumbnail still reads

## 6. Vote webhook wiring (prep)

Once the listing is live, get your top.gg API token from https://top.gg/bot/962198089161134131/webhooks and add this to `.env`:

```env
TOPGG_AUTH_TOKEN=<top.gg-provided token>
```

Then create the endpoint in `packages/backend/src/routes/`. Stub shape:

```ts
// packages/backend/src/routes/webhooks.ts
import { Router } from 'express'
import { redisClient } from '@lucky/shared/services'

const router = Router()

router.post('/webhooks/topgg-votes', async (req, res) => {
    if (req.headers.authorization !== process.env.TOPGG_AUTH_TOKEN) {
        return res.status(401).send('unauthorized')
    }

    const { user: userId, type } = req.body as { user: string; type: 'upvote' | 'test' }

    if (type === 'test') return res.status(200).send('ok')

    // 12h vote window — top.gg allows one vote every 12h
    const key = `votes:${userId}`
    await redisClient.set(key, Date.now().toString(), 'EX', 60 * 60 * 12)

    // Streak tracking: increment a counter with 36h expiry (give 12h grace)
    const streakKey = `votes:streak:${userId}`
    await redisClient.incr(streakKey)
    await redisClient.expire(streakKey, 60 * 60 * 36)

    return res.status(200).send('ok')
})

export default router
```

Then register this router in `packages/backend/src/routes/index.ts` (or similar central route registration) by importing and mounting it:

```ts
import webhooksRouter from './webhooks'
// ... in your Express app setup
app.use(webhooksRouter)
```

Finally, in `packages/bot/src/functions/general/commands/`, add `/voterewards` that reads `votes:streak:<user>` and grants tier (e.g. 7+ votes → custom autoplay weighting, 30+ → dashboard badge).

**Security**: the `authorization` header check is the ONLY guard — top.gg sends the token as a plain header. Never log the raw header body.

## 7. Submission checklist

- [ ] Bot verified with Discord (`https://discord.com/developers/applications/962198089161134131/bot` → "Server Members Intent" + "Message Content Intent" enabled if used)
- [ ] Banner rendered at 1000×500
- [ ] Short description pasted
- [ ] Long description pasted
- [ ] 3-8 tags selected
- [ ] Support server invite link added
- [ ] GitHub URL added
- [ ] Prefix: `/` (slash commands only)
- [ ] Webhook URL set to `https://api.lucky.lucassantana.tech/webhooks/topgg-votes` (after deploy)
- [ ] Webhook auth token pasted in top.gg's field
- [ ] Announce the listing in the support Discord + a GitHub release note
