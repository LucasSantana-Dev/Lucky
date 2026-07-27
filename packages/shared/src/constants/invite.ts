import { TOP_GG_BOT_ID } from './topgg'

/**
 * Minimal permission set for the bot invite: View Channels, Send Messages,
 * Embed Links, Connect, Speak.
 *
 * NOT Administrator, and deliberately no Manage Messages. The public listings
 * (Top.gg, README) state that Lucky only asks for what it needs, so this value
 * is a promise we make to server admins, not a preference.
 *
 * This lives in shared because three copies had already drifted apart (#1888,
 * #1894): the docs page shipped `8` (Administrator), the backend redirect
 * shipped `36970496` (Manage Messages + Connect + Speak, and missing View
 * Channels / Send Messages entirely), and only the landing page was correct.
 */
export const BOT_INVITE_PERMISSIONS = '3165184'

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
