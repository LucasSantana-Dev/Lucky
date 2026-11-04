import {
    BOT_CLIENT_ID,
    BOT_INVITE_PERMISSIONS,
    buildBotInviteUrl,
} from '@lucky/shared/constants'

// Discord CDN URL helpers. The backend returns avatar/icon HASHES, not full
// URLs — build the CDN URL before passing to an <img>.

export function getUserAvatarUrl(userId: string, avatarHash: string): string {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=64`
}

export function getGuildIconUrl(guildId: string, iconHash: string): string {
    return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=64`
}

/**
 * The one invite URL. Both the landing CTA and the docs page must use this:
 * they previously built their own, drifted, and the docs copy shipped
 * `permissions=8` (Administrator) while the landing page and every public
 * listing promised the minimal set (#1888). The permission set and URL shape
 * now come from shared, which the backend `/invite` redirect uses too (#1894).
 *
 * VITE_DISCORD_CLIENT_ID overrides the application id for a fork.
 */
export function getBotInviteUrl(): string {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || BOT_CLIENT_ID
    return buildBotInviteUrl(clientId)
}

export { BOT_INVITE_PERMISSIONS }

/**
 * URL the landing page "Add to Discord" CTA should point to. Routes through
 * the backend's /api/add endpoint so the OAuth state carries source=landing,
 * enabling guild_join_sources attribution (#2861).
 */
export function getLandingAddUrl(): string {
    const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(
        /\/+$/,
        '',
    )
    return `${apiBase || '/api'}/add?source=landing`
}
