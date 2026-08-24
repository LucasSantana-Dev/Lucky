/**
 * Idempotent provisioning for the Lucky support server, the one linked from the
 * site footer, the docs sidebar and the top.gg listing (see
 * `packages/shared/src/constants/support.ts`).
 *
 * Committed because the structure it builds is durable context: it lived only in
 * /tmp after the server was first set up, so a rebuild would have had nothing to
 * work from. Re-running is safe; every role and channel is matched by name and
 * skipped if it already exists.
 *
 * Requires, in the target guild only, a Lucky role with:
 *   Manage Channels  (create categories/channels)
 *   Manage Roles     (create roles, write permission overwrites)
 *   Manage Guild     (optional: server settings; skipped cleanly if absent)
 *
 * Grant them for the run and revoke afterwards. The invite deliberately does not
 * carry them, per `decisions/2026-06-18-invite-permission-scope.md`, and
 * Administrator is never needed.
 *
 * Two Discord behaviours this encodes, both found the hard way:
 *   - Announcement channels (type 5) only exist once the guild has Community
 *     enabled; otherwise the create is rejected with 50035. Falls back to a plain
 *     text channel and says so.
 *   - A bot cannot move a role above its own highest role, and Administrator does
 *     not bypass role hierarchy. Only the guild owner can. So role ORDER is left
 *     to a human; this script only creates.
 *
 * Usage:
 *   DRY_RUN=1 GUILD_ID=<id> node scripts/setup-support-server.mjs   # print plan
 *   GUILD_ID=<id> node scripts/setup-support-server.mjs             # apply
 *
 * DISCORD_TOKEN is read from the environment and never printed.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const TOKEN = process.env.DISCORD_TOKEN
const GUILD_ID = process.env.GUILD_ID
const DRY_RUN = process.env.DRY_RUN === '1'
// assets/lucky-logo.png is NOT the Lucky mark despite the name: it carries a
// NEXUS logo (#2094). The real one is the neon cat.
const LOGO_PATH =
    process.env.LOGO_PATH ??
    fileURLToPath(new URL('../assets/outline-v4-neon.jpeg', import.meta.url))

const API = 'https://discord.com/api/v10'
const REPO = 'https://github.com/LucasSantana-Dev/Lucky'
const SITE = 'https://lucky.lucassantana.tech'
const BRAND = 0x495df3 // frontend --primary: 233 88% 62%

function fail(msg) {
    console.error(`\n  ERROR  ${msg}\n`)
    process.exit(1)
}

if (!TOKEN) fail('DISCORD_TOKEN is not set in the environment.')
if (!GUILD_ID) fail('GUILD_ID is not set. Pass the support server id.')

// Discord permission bits used below.
const P = {
    VIEW_CHANNEL: 1n << 10n,
    SEND_MESSAGES: 1n << 11n,
    MANAGE_CHANNELS: 1n << 4n,
    MANAGE_GUILD: 1n << 5n,
    MANAGE_ROLES: 1n << 28n,
    CREATE_PUBLIC_THREADS: 1n << 35n,
    SEND_MESSAGES_IN_THREADS: 1n << 38n,
    ADD_REACTIONS: 1n << 6n,
    READ_MESSAGE_HISTORY: 1n << 16n,
    MANAGE_MESSAGES: 1n << 13n,
}

let calls = 0

async function api(method, path, body) {
    if (DRY_RUN && method !== 'GET') {
        console.log(`      [dry-run] ${method} ${path}`)
        return {
            id: `dry-${Math.abs(hash(path + JSON.stringify(body ?? {})))}`,
        }
    }
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
            console.log(`      rate limited, waiting ${retry}s`)
            await new Promise((r) => setTimeout(r, (retry + 0.5) * 1000))
            continue
        }
        if (res.status === 401) fail('DISCORD_TOKEN rejected by Discord (401).')
        if (!res.ok) {
            const text = await res.text()
            const err = new Error(`${method} ${path} -> ${res.status} ${text}`)
            err.status = res.status
            throw err
        }
        return res.status === 204 ? null : await res.json()
    }
    throw new Error(`${method} ${path} still rate limited after 5 attempts`)
}

function hash(s) {
    let h = 0
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
    return h
}

// ---------------------------------------------------------------- plan

const ROLES = [
    {
        name: 'Maintainer',
        color: BRAND,
        hoist: true,
        mentionable: true,
        permissions: '0',
    },
    {
        name: 'Contributor',
        color: 0x3ba55d,
        hoist: true,
        mentionable: true,
        permissions: '0',
    },
]

// Category -> channels. `locked` categories deny SEND_MESSAGES to @everyone;
// children sync with the category, so the deny is written once.
const STRUCTURE = [
    {
        category: 'INFORMATION',
        locked: true,
        channels: [
            {
                name: '📌-start-here',
                topic: 'What Lucky is, how to invite it, and where to get help.',
            },
            {
                name: '📣-announcements',
                announcement: true,
                topic: 'Product announcements. Follow this channel to get them in your own server.',
            },
            {
                name: '🚀-releases',
                topic: `Automated release feed from ${REPO}/releases`,
            },
        ],
    },
    {
        category: 'SUPPORT',
        locked: false,
        channels: [
            {
                name: '🆘-help',
                topic: 'Trouble with a command, playback, or the dashboard? Ask here.',
            },
            {
                name: '🐛-issues',
                topic: `Bugs and feature requests are tracked on GitHub: ${REPO}/issues`,
            },
        ],
    },
    {
        category: 'COMMUNITY',
        locked: false,
        channels: [
            { name: '💬-general', topic: 'Off-topic chat.' },
            { name: '🔊 Music Lounge', voice: true },
        ],
    },
]

const PINS = {
    '📌-start-here': {
        title: 'Welcome to Lucky',
        description: [
            '**Lucky** is an open-source Discord music bot with genre-aware autoplay, moderation, and a web dashboard. Self-hostable, free, no paywall.',
            '',
            `**Add Lucky to your server** · ${SITE}/invite`,
            `**Dashboard** · ${SITE}`,
            `**Source** · ${REPO}`,
            '',
            '**Getting help**',
            'Ask in <#HELP> and include: the command you ran, what you expected, and what happened instead. A screenshot of the error usually saves a round trip.',
            '',
            '**Found a bug, or want a feature?**',
            `Those live on GitHub, not here, so they do not get lost in scrollback: ${REPO}/issues`,
        ].join('\n'),
    },
    '🐛-issues': {
        title: 'Bugs and feature requests go to GitHub',
        description: [
            `This project tracks all work in GitHub Issues: **${REPO}/issues**`,
            '',
            'Post here if you want to talk something through first. Once it is confirmed it moves to an issue, so it stays searchable and can be picked up.',
            '',
            '**A good report has**',
            '· what you ran, and in which server',
            '· what you expected',
            '· what happened instead, with the exact error text',
            '· roughly when it happened',
        ].join('\n'),
    },
}

// ---------------------------------------------------------------- run

async function main() {
    console.log(
        `\n  Lucky support server setup${DRY_RUN ? '  [DRY RUN, nothing will be changed]' : ''}\n`,
    )

    // Pre-flight: what can the bot actually do here?
    const guilds = await api('GET', '/users/@me/guilds')
    const target = guilds.find((g) => g.id === GUILD_ID)
    if (!target) {
        fail(
            `The bot is not a member of guild ${GUILD_ID}.\n` +
                '         Invite it first, then re-run.',
        )
    }
    const perms = BigInt(target.permissions)
    const has = (bit) => (perms & bit) === bit

    // Announcement channels (type 5) only exist once the guild has Community
    // enabled. Without it Discord rejects the create with 50035:
    // "Value must be one of {0, 2, 4, 6, 13, 14, 15, 16, 21}".
    const guild = await api('GET', `/guilds/${GUILD_ID}`)
    const me = await api('GET', '/users/@me')
    const isCommunity = (guild.features ?? []).includes('COMMUNITY')

    console.log(`  Guild: ${target.name} (${GUILD_ID})`)
    console.log(`  Manage Channels: ${has(P.MANAGE_CHANNELS) ? 'yes' : 'NO'}`)
    console.log(`  Manage Roles:    ${has(P.MANAGE_ROLES) ? 'yes' : 'NO'}`)
    console.log(
        `  Manage Guild:    ${has(P.MANAGE_GUILD) ? 'yes' : 'no (server settings will be skipped)'}`,
    )
    // Pins need both: GET /pins reads history, PUT /pins writes it.
    console.log(
        `  Read Msg History:${has(P.READ_MESSAGE_HISTORY) ? 'yes' : 'NO'}`,
    )
    console.log(`  Manage Messages: ${has(P.MANAGE_MESSAGES) ? 'yes' : 'NO'}\n`)

    const missing = [
        ['Manage Channels', P.MANAGE_CHANNELS],
        ['Manage Roles', P.MANAGE_ROLES],
        ['Read Message History', P.READ_MESSAGE_HISTORY],
        ['Manage Messages', P.MANAGE_MESSAGES],
    ]
        .filter(([, bit]) => !has(bit))
        .map(([name]) => name)

    if (missing.length) {
        fail(
            `Missing in this guild: ${missing.join(', ')}.\n` +
                '         Server Settings -> Roles -> Lucky -> enable them, then re-run.\n' +
                '         Read Message History and Manage Messages are needed for the\n' +
                '         pinned welcome embeds, not just for channel creation.',
        )
    }

    // ---- roles (idempotent by name)
    console.log('  Roles')
    const existingRoles = await api('GET', `/guilds/${GUILD_ID}/roles`)
    for (const role of ROLES) {
        if (existingRoles.some((r) => r.name === role.name)) {
            console.log(`    = ${role.name} already exists, skipping`)
            continue
        }
        await api('POST', `/guilds/${GUILD_ID}/roles`, role)
        console.log(`    + ${role.name}`)
    }

    // ---- channels (idempotent by name)
    console.log('\n  Channels')
    const existing = await api('GET', `/guilds/${GUILD_ID}/channels`)
    const byName = new Map(existing.map((c) => [c.name, c]))
    const created = new Map()

    for (const group of STRUCTURE) {
        // A locked category denies SEND_MESSAGES to @everyone, and the bot
        // inherits that deny like anyone else. Without an explicit allow it
        // cannot post the pinned welcome embeds into its own category. A
        // member overwrite (type 1) avoids resolving the bot's role first.
        const lockedOverwrites = [
            {
                id: GUILD_ID, // the @everyone role id equals the guild id
                type: 0,
                allow: String(P.VIEW_CHANNEL | P.ADD_REACTIONS),
                deny: String(
                    P.SEND_MESSAGES |
                        P.CREATE_PUBLIC_THREADS |
                        P.SEND_MESSAGES_IN_THREADS,
                ),
            },
            {
                id: me.id,
                type: 1,
                allow: String(
                    P.VIEW_CHANNEL |
                        P.SEND_MESSAGES |
                        P.READ_MESSAGE_HISTORY |
                        P.MANAGE_MESSAGES,
                ),
                deny: '0',
            },
        ]

        let parent = byName.get(group.category)
        if (parent) {
            console.log(`    = ${group.category} already exists, skipping`)
            // An existing locked category from an older run predates the bot
            // overwrite above and would still block pinning. Reconcile it.
            const hasBotAllow = (parent.permission_overwrites ?? []).some(
                (o) => o.id === me.id,
            )
            if (group.locked && !hasBotAllow) {
                await api('PATCH', `/channels/${parent.id}`, {
                    permission_overwrites: lockedOverwrites,
                })
                console.log('      ~ added the bot overwrite it was missing')
            }
        } else {
            const overwrites = group.locked ? lockedOverwrites : []
            parent = await api('POST', `/guilds/${GUILD_ID}/channels`, {
                name: group.category,
                type: 4,
                permission_overwrites: overwrites,
            })
            console.log(
                `    + ${group.category}${group.locked ? '  (read-only for @everyone)' : ''}`,
            )
        }

        for (const ch of group.channels) {
            if (byName.has(ch.name)) {
                console.log(`      = ${ch.name} already exists, skipping`)
                continue
            }
            // 0 text, 2 voice, 5 announcement
            const wantsAnnouncement = Boolean(ch.announcement) && isCommunity
            const type = ch.voice ? 2 : wantsAnnouncement ? 5 : 0
            const made = await api('POST', `/guilds/${GUILD_ID}/channels`, {
                name: ch.name,
                type,
                parent_id: parent.id,
                ...(ch.topic ? { topic: ch.topic } : {}),
            })
            created.set(ch.name, made)
            const note =
                ch.announcement && !isCommunity
                    ? '  (plain text: Community is off, convert later)'
                    : ''
            console.log(`      + ${ch.name}${note}`)
        }
    }

    // ---- welcome content, pinned
    console.log('\n  Pinned messages')
    const helpChannel = created.get('🆘-help') ?? byName.get('🆘-help')
    for (const [channelName, embed] of Object.entries(PINS)) {
        const channel = created.get(channelName) ?? byName.get(channelName)
        if (!channel) {
            console.log(`    ! ${channelName} not found, skipping pin`)
            continue
        }
        // Posting is not idempotent on its own: a second run would pin a second
        // copy of the same embed. Match on the embed title already pinned.
        // In dry-run a freshly "created" channel carries a fabricated id, so a
        // real GET against it would 404 and abort the whole dry run.
        if (DRY_RUN && String(channel.id).startsWith('dry-')) {
            console.log(`    + would pin in ${channelName} (new channel)`)
            continue
        }
        const pinned = await api('GET', `/channels/${channel.id}/pins`)
        const items = Array.isArray(pinned) ? pinned : (pinned?.items ?? [])
        const already = items.some((m) =>
            (m.message ?? m).embeds?.some((e) => e.title === embed.title),
        )
        if (already) {
            console.log(`    = ${channelName} already pinned, skipping`)
            continue
        }

        const description = embed.description.replace(
            '<#HELP>',
            helpChannel ? `<#${helpChannel.id}>` : '#help',
        )
        const msg = await api('POST', `/channels/${channel.id}/messages`, {
            embeds: [
                {
                    title: embed.title,
                    description,
                    color: BRAND,
                    footer: { text: 'Lucky · open source under ISC' },
                },
            ],
        })
        await api('PUT', `/channels/${channel.id}/pins/${msg.id}`)
        console.log(`    + pinned in ${channelName}`)
    }

    // ---- server settings (only with Manage Guild)
    if (has(P.MANAGE_GUILD)) {
        console.log('\n  Server settings')
        const patch = {
            name: 'Lucky',
            verification_level: 2, // registered on Discord for longer than 5 minutes
            default_message_notifications: 1, // mentions only, not every message
            explicit_content_filter: 2, // scan media from all members
        }
        try {
            const logo = await readFile(LOGO_PATH)
            const mime = LOGO_PATH.endsWith('.png') ? 'image/png' : 'image/jpeg'
            patch.icon = `data:${mime};base64,${logo.toString('base64')}`
            console.log(`    + icon from ${LOGO_PATH}`)
        } catch {
            console.log(`    ! could not read ${LOGO_PATH}, skipping icon`)
        }
        await api('PATCH', `/guilds/${GUILD_ID}`, patch)
        console.log(
            '    + name, verification level, notification default, content filter',
        )
    } else {
        console.log('\n  Server settings skipped (no Manage Guild).')
        console.log(
            '    Set by hand: name "Lucky", icon assets/outline-v4-neon.jpeg,',
        )
        console.log(
            '    verification level Medium, notifications "Only @mentions".',
        )
    }

    console.log(`\n  Done. ${calls} API calls.`)
    if (DRY_RUN) {
        console.log(
            '  This was a dry run. Re-run without DRY_RUN=1 to apply.\n',
        )
    } else {
        console.log('\n  Next, by hand:')
        console.log(
            '    1. Revoke Manage Channels / Manage Roles / Manage Guild from Lucky.',
        )
        console.log(
            '    2. If this is a new server, create a permanent invite:',
        )
        console.log(
            '       Expire After = Never, Max Uses = No limit. The Discord default',
        )
        console.log(
            '       expires in 30 days, which silently rots every published link.',
        )
        console.log(
            '    3. Put it in packages/shared/src/constants/support.ts, nowhere else.\n',
        )
    }
}

main().catch((e) => {
    if (e.status === 403) {
        fail(
            `Discord refused with 403 Forbidden.\n         ${e.message}\n` +
                '         The Lucky role is likely missing a permission, or sits below\n' +
                '         the role it is trying to manage in the role list.',
        )
    }
    fail(e.stack ?? String(e))
})
