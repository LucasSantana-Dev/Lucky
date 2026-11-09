import {
    BOT_CLIENT_ID,
    BOT_INVITE_PERMISSIONS,
    buildBotInviteUrl,
} from '@lucky/shared/constants'
import { inferApiBase } from '@/services/apiBase'

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
 * enabling guild_join_sources attribution (#2861). The API base resolves the
 * same way as the API client. A fork that overrides VITE_DISCORD_CLIENT_ID
 * keeps the direct invite URL: /api/add always uses the default application.
 */
export function getLandingAddUrl(): string {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID
    if (clientId && clientId !== BOT_CLIENT_ID) {
        return getBotInviteUrl()
    }
    const apiBase = inferApiBase(
        import.meta.env.VITE_API_BASE_URL,
        typeof window === 'undefined' ? undefined : window.location,
    ).replace(/\/+$/, '')
    return `${apiBase}/add?source=landing`
}
