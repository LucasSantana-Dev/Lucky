/**
 * One-off broadcast to every guild Lucky is in, posting ONLY to that guild's
 * Discord-designated system channel (the one that already receives join and
 * boost messages). Guilds with no system channel, or where Lucky cannot
 * actually post in it, are skipped and reported.
 *
 * Why system-channel-only: there is no per-guild "announcements channel" in the
 * schema. `LevelConfig.announceChannel` is level-up specific and
 * `ModerationSettings.modLogChannelId` is a staff surface; posting product news
 * to either is the wrong audience. The system channel is the closest thing
 * Discord gives to a sanctioned server-wide notice target, and a guild that has
 * disabled it has effectively opted out.
 *
 * Sending is IRREVERSIBLE and reaches third-party communities. So:
 *   - DRY_RUN is the DEFAULT. Sending requires CONFIRM_SEND=yes explicitly.
 *   - Effective per-channel permissions are computed, not assumed. A bot that
 *     holds Send Messages at guild level can still be denied by a channel
 *     overwrite, and validating under a permission set you happen to have
 *     rather than the one you documented has hidden real failures before.
 *   - Every run writes a JSON log so a partial send is resumable and auditable.
 *
 * Usage:
 *   node scripts/announce-broadcast.mjs                    # dry run, prints plan
 *   CONFIRM_SEND=yes node scripts/announce-broadcast.mjs   # actually posts
 *   SKIP_GUILDS=id1,id2 ...                                # exclude guilds
 *   ONLY_GUILDS=id1,id2 ...                                # restrict (for a canary)
 *
 * DISCORD_TOKEN is read from the environment and never printed.
 */

import { appendFile, open, readFile, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const TOKEN = process.env.DISCORD_TOKEN
const SEND = process.env.CONFIRM_SEND === 'yes'
const SKIP = new Set(
    (process.env.SKIP_GUILDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
)
const ONLY = new Set(
    (process.env.ONLY_GUILDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
)

// Append-only, WRITE-AHEAD delivery ledger. An `attempting` row is written
// BEFORE the POST and a terminal row after it, because Discord can accept a
// message and the process die before the result is recorded. Writing only after
// the POST left that window, and a rerun would duplicate the announcement in a
// third-party server. Holding results in memory until the end meant that a crash, a
// Ctrl-C, or a killed container left no record of what had already gone out,
// and the obvious response (rerun) would post to every guild a second time.
// Double-posting to third-party servers is the specific harm this whole script
// is built to avoid, so the ledger is the durable part, not the summary.
const LEDGER = 'announce-broadcast-ledger.jsonl'

// Exclusive lock for send mode. Two CONFIRM_SEND=yes processes started together
// would both replay the same ledger, select the same pending targets, and post
// to the same channels: the write-ahead rows are appended too late to stop
// that. Created with the 'wx' flag, which fails if the file already exists, so
// the check and the claim are one atomic filesystem operation rather than a
// read-then-write race.
const LOCK = 'announce-broadcast.lock'

export async function acquireSendLock() {
    let handle
    try {
        handle = await open(LOCK, 'wx')
    } catch (err) {
        if (err.code === 'EEXIST') {
            throw new Error(
                `another send appears to be running: ${LOCK} exists.\n` +
                    '  If no broadcast is actually in flight (a previous run was killed), delete it:\n' +
                    `    rm ${LOCK}\n` +
                    '  Check the ledger first. A killed run can leave ambiguous guilds.',
                { cause: err },
            )
        }
        throw err
    }
    await handle.writeFile(
        JSON.stringify({ pid: process.pid, at: new Date().toISOString() }) +
            '\n',
    )
    await handle.close()
}

export async function releaseSendLock() {
    try {
        await unlink(LOCK)
    } catch (err) {
        if (err.code !== 'ENOENT') throw err
    }
}

// Pure, so the resume rules are testable without Discord or the filesystem.
// Returns the three states a guild can be in after a previous run:
//   sent      -> terminal success, never retry
//   failed    -> terminal failure, safe to retry
//   ambiguous -> `attempting` with no terminal row. The POST may or may not have
//                landed. NEVER auto-retried; a human decides.
export function classifyLedger(lines) {
    const lastByGuild = new Map()
    for (const line of lines) {
        if (!line.trim()) continue
        let row
        try {
            row = JSON.parse(line)
        } catch {
            continue // a torn final line from a hard kill is not fatal
        }
        if (!row?.id) continue
        // STRICT last-line-wins, by file order. An earlier terminal row must
        // never mask a later `attempting`: a guild that failed in run 1 and was
        // retried in run 2 has rows [attempting, failed, attempting], and if the
        // stale `failed` won, the guild would read as safe to retry while the
        // run-2 POST may already have been delivered. That is the double-post
        // this ledger exists to prevent.
        lastByGuild.set(row.id, row.status)
    }
    const sent = new Set()
    const ambiguous = new Set()
    for (const [id, status] of lastByGuild) {
        if (status === 'sent') sent.add(id)
        else if (status === 'attempting') ambiguous.add(id)
    }
    return { sent, ambiguous }
}

const API = 'https://discord.com/api/v10'
const BRAND = 0x495df3
const SITE = 'https://lucky.lucassantana.tech'
const REPO = 'https://github.com/LucasSantana-Dev/Lucky'
const SUPPORT = 'https://discord.gg/f2rxBWvqeR'
const LISTING = 'https://top.gg/bot/962198089161134131'
const VOTE = `${LISTING}/vote`

// Served from the repo over raw.githubusercontent so the embed needs no deploy.
// Discord fetches once, then serves its own cached copy from media.discordapp.net.
const RAW = `${REPO.replace('github.com', 'raw.githubusercontent.com')}/main`
const GIF_URL = `${RAW}/assets/lucky-welcome.gif`
const LOGO_URL = `${RAW}/packages/frontend/public/lucky-logo.png`

// Discord permission bits actually required to post this message.
const VIEW_CHANNEL = 1n << 10n
const SEND_MESSAGES = 1n << 11n
const EMBED_LINKS = 1n << 14n
const ADMINISTRATOR = 1n << 3n

const GUILD_TEXT = 0
const GUILD_NEWS = 5

// Guild names come from the Discord API and are attacker-controlled: a server
// owner picks them. JSON.stringify already prevents breaking the JSONL
// structure, but the ledger is a file a human reads with `cat`, and a name can
// rewrite what they see in two ways: ANSI escape sequences via control
// characters, and bidi overrides (U+202E and friends) that reorder the rest of
// the line so a name appears to be a different one. Zero-width characters go
// too, since they hide differences between names that render identically.
//
// Length is bounded as well. Discord caps names at 100 chars, so a longer value
// is itself a signal something is off.
// Unicode format and invisible characters, by what they do to a reader:
//   U+034F         combining grapheme joiner, renders as nothing
//   U+061C         Arabic letter mark, a bidi control
//   U+200B-U+200F  zero width space/joiners, LRM and RLM
//   U+202A-U+202E  bidi embeddings and overrides (U+202E is the classic spoof)
//   U+2060-U+2064  word joiner and the invisible operators
//   U+2066-U+2069  bidi isolates
//   U+FEFF         zero width no-break space, the BOM as a body character
// All of them either reorder the rest of the rendered line or occupy no space,
// so two different names can be made to look like the same one in a file a
// human reads to decide what actually went out.
const FORMAT_AND_INVISIBLE_RE =
    /[\u034F\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

export function safeName(value) {
    if (typeof value !== 'string') return ''
    return (
        value
            // eslint-disable-next-line no-control-regex
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
            .replace(FORMAT_AND_INVISIBLE_RE, '')
            .slice(0, 100)
    )
}

function fail(msg) {
    console.error(`\n  ERROR  ${msg}\n`)
    process.exit(1)
}

let calls = 0

async function api(method, path, body) {
    for (let attempt = 0; attempt < 5; attempt++) {
        calls++
        const res = await fetch(`${API}${path}`, {
            method,
            headers: {
                Authorization: `Bot ${TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        })
        if (res.status === 429) {
            const retry = Number(res.headers.get('retry-after') ?? 1)
            await new Promise((r) => setTimeout(r, (retry + 0.5) * 1000))
            continue
        }
        if (res.status === 401) fail('DISCORD_TOKEN rejected by Discord (401).')
        if (!res.ok) {
            const text = await res.text()
            const err = new Error(
                `${method} ${path} -> ${res.status} ${text.slice(0, 200)}`,
            )
            err.status = res.status
            throw err
        }
        return res.status === 204 ? null : await res.json()
    }
    throw new Error(`${method} ${path} still rate limited after 5 attempts`)
}

// Full Discord permission resolution. Guild-level perms are NOT enough: a
// channel overwrite can deny what the role grants, and Administrator masks the
// difference entirely (which is exactly how a previous ops script looked green
// while being broken for non-admin runs).
function effectivePermissions(guild, channel, memberRoleIds, botUserId) {
    const everyone = guild.roles.find((r) => r.id === guild.id)
    let perms = BigInt(everyone?.permissions ?? '0')
    for (const role of guild.roles) {
        if (memberRoleIds.includes(role.id)) perms |= BigInt(role.permissions)
    }
    if (perms & ADMINISTRATOR) return ~0n

    const overwrites = channel.permission_overwrites ?? []
    const everyoneOw = overwrites.find((o) => o.id === guild.id)
    if (everyoneOw) {
        perms &= ~BigInt(everyoneOw.deny)
        perms |= BigInt(everyoneOw.allow)
    }
    let roleDeny = 0n
    let roleAllow = 0n
    for (const ow of overwrites) {
        if (ow.type === 0 && memberRoleIds.includes(ow.id)) {
            roleDeny |= BigInt(ow.deny)
            roleAllow |= BigInt(ow.allow)
        }
    }
    perms &= ~roleDeny
    perms |= roleAllow

    const memberOw = overwrites.find((o) => o.type === 1 && o.id === botUserId)
    if (memberOw) {
        perms &= ~BigInt(memberOw.deny)
        perms |= BigInt(memberOw.allow)
    }
    return perms
}

function missingPermissionNames(perms) {
    const names = []
    if (!(perms & VIEW_CHANNEL)) names.push('View Channel')
    if (!(perms & SEND_MESSAGES)) names.push('Send Messages')
    if (!(perms & EMBED_LINKS)) names.push('Embed Links')
    return names
}

// Discord embed formatting rules this obeys:
//   - markdown links render in `description` and field `value`, NEVER in
//     `title`, field `name`, or `footer.text`
//   - `image` renders large at the bottom, `thumbnail` small at top-right
//   - `inline: true` fields sit side by side, at most 3 per row
//   - limits: description 4096, field value 1024, 25 fields, 6000 total
function buildEmbed() {
    return {
        author: {
            name: 'Lucky',
            url: SITE,
            icon_url: LOGO_URL,
        },
        title: 'Lucky is on top.gg, and now has a support server',
        url: LISTING,
        color: BRAND,
        description: [
            'Two quick things, then straight back to the music.',
            '',
            'Lucky just got approved on top.gg. If it earns its place in this server,',
            'an upvote is the single best way to help other people find it.',
        ].join('\n'),
        fields: [
            {
                name: 'Upvote on top.gg',
                value: `[One click, once every 12h](${VOTE})`,
                inline: true,
            },
            {
                name: 'Support server',
                value: `[Bugs, questions, setup help](${SUPPORT})`,
                inline: true,
            },
            {
                name: 'Everything else',
                value: `[Dashboard](${SITE}) · [Commands](${SITE}/docs) · [GitHub](${REPO})`,
                inline: false,
            },
        ],
        image: { url: GIF_URL },
        footer: {
            text: 'One-off notice from the Lucky team. Lucky does not send recurring announcements.',
            icon_url: LOGO_URL,
        },
        timestamp: new Date().toISOString(),
    }
}

// Whether THIS process currently owns the send lock. Without it a crash
// between acquire and release leaves the lock behind and every later send is
// refused until someone deletes it by hand.
let holdingLock = false

async function main() {
    if (!TOKEN) fail('DISCORD_TOKEN is not set.')
    const mode = SEND ? 'SEND (irreversible)' : 'DRY RUN'
    console.log(`\n  Lucky broadcast (${mode})\n`)

    const me = await api('GET', '/users/@me')
    const botUserId = me.id

    // Paginate: /users/@me/guilds caps at 200 per page.
    const guilds = []
    let after = ''
    for (;;) {
        const page = await api(
            'GET',
            `/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`,
        )
        guilds.push(...page)
        if (page.length < 200) break
        after = page[page.length - 1].id
    }
    console.log(`  Guilds Lucky is in: ${guilds.length}\n`)
    if (guilds.length === 0)
        fail('Bot reports zero guilds. Refusing to continue.')

    const targets = []
    const skipped = []

    for (const g of guilds) {
        if (ONLY.size > 0 && !ONLY.has(g.id)) continue
        if (SKIP.has(g.id)) {
            skipped.push({ guild: g.name, id: g.id, reason: 'in SKIP_GUILDS' })
            continue
        }
        let guild
        let channels
        let member
        try {
            guild = await api('GET', `/guilds/${g.id}`)
            if (!guild.system_channel_id) {
                skipped.push({
                    guild: g.name,
                    id: g.id,
                    reason: 'no system channel set',
                })
                continue
            }
            channels = await api('GET', `/guilds/${g.id}/channels`)
            member = await api('GET', `/guilds/${g.id}/members/${botUserId}`)
        } catch (err) {
            skipped.push({
                guild: g.name,
                id: g.id,
                reason: `lookup failed: ${err.message}`,
            })
            continue
        }

        const channel = channels.find((c) => c.id === guild.system_channel_id)
        if (!channel) {
            skipped.push({
                guild: g.name,
                id: g.id,
                reason: 'system channel not visible to bot',
            })
            continue
        }
        if (channel.type !== GUILD_TEXT && channel.type !== GUILD_NEWS) {
            skipped.push({
                guild: g.name,
                id: g.id,
                reason: `system channel type ${channel.type} not postable`,
            })
            continue
        }

        const perms = effectivePermissions(
            guild,
            channel,
            member.roles ?? [],
            botUserId,
        )
        const missing = missingPermissionNames(perms)
        if (missing.length > 0) {
            skipped.push({
                guild: g.name,
                id: g.id,
                reason: `missing in #${channel.name}: ${missing.join(', ')}`,
            })
            continue
        }

        targets.push({
            guild: g.name,
            id: g.id,
            channelId: channel.id,
            channelName: channel.name,
        })
    }

    console.log(`  WOULD POST to ${targets.length} guild(s):`)
    for (const t of targets)
        console.log(`    ${t.guild}  ->  #${t.channelName}`)
    console.log(`\n  SKIPPED ${skipped.length} guild(s):`)
    for (const s of skipped) console.log(`    ${s.guild}  ::  ${s.reason}`)

    const results = []
    if (SEND) {
        try {
            await acquireSendLock()
            holdingLock = true
        } catch (err) {
            // Never set holdingLock here: the usual cause is that ANOTHER run
            // owns the lock, and releasing it would be deleting their lock.
            fail(err.message)
        }

        // Resume: anything already recorded as sent is never posted again.
        // Failures are NOT skipped, so a rerun retries only what did not land.
        let priorLines = []
        try {
            priorLines = (await readFile(LEDGER, 'utf8')).split('\n')
        } catch (err) {
            if (err.code !== 'ENOENT') throw err
        }
        const { sent: alreadySent, ambiguous } = classifyLedger(priorLines)

        if (alreadySent.size > 0) {
            console.log(
                `  Resuming: ${alreadySent.size} guild(s) recorded as sent in ${LEDGER}, skipping them.`,
            )
        }
        if (ambiguous.size > 0) {
            console.log(
                `\n  ${ambiguous.size} guild(s) are AMBIGUOUS: the POST was started but no result was\n` +
                    '  recorded, so the announcement may or may not have landed. They are NOT\n' +
                    '  retried automatically, because retrying a delivered message double-posts\n' +
                    "  into someone else's server. Check the channel, then either mark it sent:\n" +
                    `    echo '{"id":"<guildId>","status":"sent"}' >> ${LEDGER}\n` +
                    '  or mark it failed to let the next run retry it:\n' +
                    `    echo '{"id":"<guildId>","status":"failed"}' >> ${LEDGER}\n`,
            )
            for (const id of ambiguous) {
                const t = targets.find((x) => x.id === id)
                console.log(
                    `    ${id}  ${t ? t.guild : '(not in current targets)'}`,
                )
            }
            console.log('')
        }

        const pending = targets.filter(
            (t) => !alreadySent.has(t.id) && !ambiguous.has(t.id),
        )
        console.log(`  ${pending.length} guild(s) still to send.\n`)
        targets.length = 0
        targets.push(...pending)
    }
    if (SEND) {
        console.log(`\n  Sending to ${targets.length} guild(s)...\n`)
        const embed = buildEmbed()
        for (const t of targets) {
            // Write-ahead: intent is recorded before the network call, so a
            // crash mid-POST is detectable as ambiguous rather than invisible.
            await appendFile(
                LEDGER,
                `${JSON.stringify({ id: t.id, guild: safeName(t.guild), status: 'attempting', at: new Date().toISOString() })}\n`,
            )
            try {
                await api('POST', `/channels/${t.channelId}/messages`, {
                    embeds: [embed],
                })
                results.push({ ...t, status: 'sent' })
                console.log(`    sent    ${t.guild}`)
            } catch (err) {
                results.push({ ...t, status: 'failed', error: err.message })
                console.log(`    FAILED  ${t.guild}  ${err.message}`)
            }
            // Record BEFORE the next attempt, so an interrupt at any point
            // leaves an accurate account of what actually went out.
            const row = results[results.length - 1]
            await appendFile(
                LEDGER,
                `${JSON.stringify({ ...row, guild: safeName(row.guild), at: new Date().toISOString() })}\n`,
            )
            // Deliberately unhurried: this is a one-off, not a race.
            await new Promise((r) => setTimeout(r, 1200))
        }
    }

    const log = {
        mode: SEND ? 'send' : 'dry-run',
        guildsTotal: guilds.length,
        targets,
        skipped,
        results,
        apiCalls: calls,
    }
    if (holdingLock) {
        await releaseSendLock()
        holdingLock = false
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const path = `announce-broadcast-${SEND ? 'send' : 'dryrun'}-${stamp}.json`
    // Same reasoning as the ledger: this summary is a file a human opens, and
    // every `guild` in it is a name a server owner chose. Sanitising in the
    // replacer covers targets, skipped and results at the one point they are
    // serialised, instead of at each of the eight places a name is collected.
    await writeFile(
        path,
        JSON.stringify(
            log,
            (key, value) => (key === 'guild' ? safeName(value) : value),
            2,
        ),
    )

    const sent = results.filter((r) => r.status === 'sent').length
    const failed = results.filter((r) => r.status === 'failed').length
    console.log(
        `\n  ${SEND ? `Sent ${sent}, failed ${failed}.` : 'Dry run. Nothing was sent.'}`,
    )
    console.log(`  Log: ${path}   (${calls} API calls)\n`)
    if (!SEND) {
        console.log(
            '  To actually send:  CONFIRM_SEND=yes node scripts/announce-broadcast.mjs\n',
        )
    }
}

// Only run when executed directly. Importing this file (for tests of
// classifyLedger) must not start a broadcast or demand a token.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch(async (err) => {
        if (holdingLock) await releaseSendLock()
        fail(err.stack ?? String(err))
    })
}
