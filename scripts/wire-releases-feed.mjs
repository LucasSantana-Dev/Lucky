/**
 * Wires GitHub release events into the #🚀-releases channel of the Lucky support
 * server, so that channel fills itself instead of needing a human to repost.
 *
 * Two halves:
 *   1. a Discord webhook on the channel (the bot needs MANAGE_WEBHOOKS)
 *   2. a GitHub repo webhook posting `release` events to <discord_url>/github,
 *      Discord's GitHub-compatible endpoint, which renders the payload with no
 *      code or third-party service in between
 *
 * The Discord webhook URL is a bearer credential: anyone holding it can post to
 * that channel. It is never printed, never passed as an argv, and reaches `gh`
 * only over stdin.
 *
 * Idempotent: re-running finds the existing webhook on each side and skips.
 *
 * Verify delivery afterwards with the hook id this prints, rather than trusting
 * the 201 from creation:
 *   gh api repos/<owner>/<repo>/hooks/<id>/pings --method POST
 *   gh api repos/<owner>/<repo>/hooks/<id> -q .last_response
 *   # 204 / "OK" means Discord accepted it
 *
 * Usage:
 *   GUILD_ID=<id> node scripts/wire-releases-feed.mjs
 *
 * DISCORD_TOKEN is read from the environment and never printed. `gh` must be
 * authenticated with a token carrying `repo` scope.
 */

import { spawn } from 'node:child_process'

const TOKEN = process.env.DISCORD_TOKEN
const GUILD_ID = process.env.GUILD_ID
const REPO = process.env.REPO ?? 'LucasSantana-Dev/Lucky'
const CHANNEL_NAME = '🚀-releases'
const WEBHOOK_NAME = 'GitHub Releases'
const API = 'https://discord.com/api/v10'

if (!TOKEN) fail('DISCORD_TOKEN is not set.')
if (!GUILD_ID) fail('GUILD_ID is not set.')

function fail(msg) {
    console.error(`\n  ERROR  ${msg}\n`)
    process.exit(1)
}

async function discord(method, path, body) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            Authorization: `Bot ${TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok)
        throw new Error(
            `${method} ${path} -> ${res.status} ${await res.text()}`,
        )
    return res.status === 204 ? null : await res.json()
}

/** Run `gh`, feeding stdin, so no secret ever lands in argv or the shell history. */
function gh(args, stdin) {
    return new Promise((resolve, reject) => {
        const p = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] })
        let out = '',
            err = ''
        p.stdout.on('data', (d) => (out += d))
        p.stderr.on('data', (d) => (err += d))
        p.on('close', (code) =>
            code === 0
                ? resolve(out)
                : reject(
                      new Error(`gh ${args[0]} exited ${code}: ${err.trim()}`),
                  ),
        )
        if (stdin !== undefined) p.stdin.write(stdin)
        p.stdin.end()
    })
}

async function main() {
    // --- Discord side
    const channels = await discord('GET', `/guilds/${GUILD_ID}/channels`)
    const channel = channels.find((c) => c.name === CHANNEL_NAME)
    if (!channel)
        fail(`channel ${CHANNEL_NAME} not found in guild ${GUILD_ID}.`)

    const existing = await discord('GET', `/channels/${channel.id}/webhooks`)
    let hook = existing.find((w) => w.name === WEBHOOK_NAME)
    if (hook) {
        console.log(
            `  = Discord webhook "${WEBHOOK_NAME}" already exists (id ${hook.id}), reusing`,
        )
    } else {
        hook = await discord('POST', `/channels/${channel.id}/webhooks`, {
            name: WEBHOOK_NAME,
        })
        console.log(
            `  + Discord webhook created on #${CHANNEL_NAME} (id ${hook.id})`,
        )
    }

    // Discord returns webhook.token ONLY on creation. On a re-run the GET
    // above omits it, so the URL cannot be rebuilt. That does not mean the
    // wiring is broken: if a GitHub hook already points at this webhook id,
    // the feed is live and there is nothing to rebuild. Check that first,
    // and only fail when the token is genuinely needed.
    const hooksJson = await gh(['api', `repos/${REPO}/hooks`])
    const hooks = JSON.parse(hooksJson)
    const already = hooks.find((h) =>
        (h.config?.url ?? '').includes(`/webhooks/${hook.id}/`),
    )

    if (already) {
        // Reconcile rather than assume: a hook that exists but is disabled,
        // lost the `release` event, or points at the base Discord URL without
        // the /github suffix delivers nothing, and returning here would report
        // success while the channel stays empty.
        const url = already.config?.url ?? ''
        const needsFix =
            !already.active ||
            !already.events?.includes('release') ||
            !url.endsWith('/github')

        if (!needsFix) {
            console.log(
                `  = GitHub webhook already wired (id ${already.id}), nothing to do`,
            )
            console.log(
                `    events: ${already.events.join(', ')}  active: ${already.active}`,
            )
            return
        }

        if (!url.endsWith('/github') && !hook.token) {
            fail(
                `GitHub hook ${already.id} points at the Discord webhook without the\n` +
                    '         /github suffix, and Discord will not hand back the token needed\n' +
                    `         to rebuild the URL. Delete webhook ${hook.id} on #${CHANNEL_NAME},\n` +
                    `         delete GitHub hook ${already.id}, then re-run.`,
            )
        }

        const patch = JSON.stringify({
            active: true,
            events: ['release'],
            config: {
                url: url.endsWith('/github') ? url : `${url}/github`,
                content_type: 'json',
            },
        })
        const fixed = JSON.parse(
            await gh(
                [
                    'api',
                    `repos/${REPO}/hooks/${already.id}`,
                    '--method',
                    'PATCH',
                    '--input',
                    '-',
                ],
                patch,
            ),
        )
        console.log(`  ~ GitHub webhook repaired (id ${fixed.id})`)
        console.log(
            `    events: ${fixed.events.join(', ')}  active: ${fixed.active}`,
        )
        return
    }

    // No GitHub hook yet, so the URL is genuinely required.
    if (!hook.token) {
        fail(
            'The Discord webhook already exists but Discord only returns its token\n' +
                '         on creation, so the URL cannot be rebuilt, and no GitHub hook\n' +
                `         points at it yet. Delete webhook ${hook.id} on #${CHANNEL_NAME}\n` +
                '         and re-run to mint a fresh one.',
        )
    }
    const discordUrl = `https://discord.com/api/webhooks/${hook.id}/${hook.token}/github`

    const payload = JSON.stringify({
        name: 'web',
        active: true,
        events: ['release'],
        config: { url: discordUrl, content_type: 'json' },
    })
    const created = JSON.parse(
        await gh(
            ['api', `repos/${REPO}/hooks`, '--method', 'POST', '--input', '-'],
            payload,
        ),
    )
    console.log(`  + GitHub webhook created (id ${created.id})`)
    console.log(
        `    events: ${created.events.join(', ')}  active: ${created.active}`,
    )
    console.log(
        `    target: https://discord.com/api/webhooks/${hook.id}/<token>/github`,
    )
}

main().catch((e) => fail(e.message))
