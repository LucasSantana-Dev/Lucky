import { TOP_GG_BOT_ID } from './topgg'

/**
 * The invite permission set. Music-only since #2736 (amendment 1 of
 * `decisions/2026-10-18-music-first-business-review-amendments.md`), which
 * narrows `decisions/2026-06-18-invite-permission-scope.md`:
 *
 *   music   View Channels, Send Messages, Embed Links, Connect, Speak
 *   recap   Attach Files: the weekly recap image card (without it the recap
 *           falls back to a text embed)
 *
 * Manage Messages (auto-mod deletion) and View Audit Log (moderation case
 * attribution) were dropped: no music command needs them, and an invite that
 * asks for them is part of why 28% of new servers removed the bot within 5
 * minutes. Servers that use moderation grant them by hand.
 *
 * **Never Administrator.** The bot genuinely does not need it: `Administrator`
 * appears in this codebase only as `setDefaultMemberPermissions`, which gates
 * *who may invoke a command*, not what the bot itself can do.
 *
 * The high-alarm permissions (Ban/Kick/ManageRoles/ManageChannels/ManageGuild/
 * ModerateMembers) are deliberately **not** in the invite. They are escalated
 * on demand, and commands needing them check `interaction.appPermissions` and
 * prompt rather than throwing a raw `50013` (#1498).
 *
 * This lives in shared because five copies had drifted apart (#1888, #1894,
 * #1923). The docs page shipped `8` (Administrator); so did the dashboard's
 * "add Lucky to this server" flow in `GuildService.generateBotInviteUrl`. The
 * backend redirect shipped `36970496` (Manage Messages, Use External Emojis,
 * Connect, Speak, Use Voice Activity) with no View Channels and no Send
 * Messages, so a bot invited with it could not read or post.
 */
export const BOT_INVITE_PERMISSIONS = '3197952'

/** The Discord application id. Public: it appears in every OAuth invite URL. */
export const BOT_CLIENT_ID = TOP_GG_BOT_ID

/**
 * The canonical Discord OAuth invite URL.
 *
 * @param clientId - Override for forks running their own application.
 */
export function buildBotInviteUrl(clientId: string = BOT_CLIENT_ID): string {
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${BOT_INVITE_PERMISSIONS}`
}

/**
 * Where a guild add came from (#2750). The landing route carries the source
 * through the OAuth `state` parameter so the callback can tie the join to it.
 * The list is deliberately short: anything else collapses to the fallback, so
 * `state` can never be used to write arbitrary text to the table.
 */
export const LANDING_SOURCES = [
    'topgg',
    'discordbotlist',
    'botsgg',
    'meta',
    'landing',
] as const

export type LandingSource = (typeof LANDING_SOURCES)[number]

/** Stored when the source is missing or not on the allowlist. */
export const FALLBACK_LANDING_SOURCE = 'unknown'

/**
 * `state` of the add flow starts with this prefix. The dashboard login state
 * is 64 random hex characters, so the two can never be confused.
 */
export const ADD_STATE_PREFIX = 'src.'

const MAX_SOURCE_INPUT_LENGTH = 32

/** Validate a raw `source` value: allowlist match or the safe fallback. */
export function normalizeLandingSource(raw: unknown): string {
    if (typeof raw !== 'string' || raw.length > MAX_SOURCE_INPUT_LENGTH) {
        return FALLBACK_LANDING_SOURCE
    }
    const value = raw.trim().toLowerCase()
    return (LANDING_SOURCES as readonly string[]).includes(value)
        ? value
        : FALLBACK_LANDING_SOURCE
}

/**
 * Read the source back out of an OAuth `state`. Returns null when the state is
 * not an add-flow state (e.g. the dashboard login state), and the validated
 * source otherwise.
 */
export function parseAddState(state: unknown): string | null {
    if (typeof state !== 'string' || !state.startsWith(ADD_STATE_PREFIX)) {
        return null
    }
    return normalizeLandingSource(state.slice(ADD_STATE_PREFIX.length))
}

/**
 * The bot add URL for a landing source: the canonical invite URL (same
 * permissions) plus `response_type=code`, the existing OAuth redirect URI and
 * `state=src.<source>`, so Discord returns `guild_id` and `state` to the
 * callback.
 */
export function buildBotAddUrl(
    source: unknown,
    redirectUri: string,
    clientId: string = BOT_CLIENT_ID,
): string {
    const state = `${ADD_STATE_PREFIX}${normalizeLandingSource(source)}`
    return `${buildBotInviteUrl(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`
}

/**
 * Activation funnel event kinds (`activation_events.kind`). A closed list so
 * the table only ever holds the steps the business dashboard reads.
 */
export const ACTIVATION_EVENT_KINDS = [
    'onboarding_delivered',
    'onboarding_failed',
    'station_click',
    'recap_auto_enabled',
] as const

export type ActivationEventKind = (typeof ACTIVATION_EVENT_KINDS)[number]
