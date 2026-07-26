// Discord CDN URL helpers. The backend returns avatar/icon HASHES, not full
// URLs — build the CDN URL before passing to an <img>.

export function getUserAvatarUrl(userId: string, avatarHash: string): string {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=64`
}

export function getGuildIconUrl(guildId: string, iconHash: string): string {
    return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=64`
}

// Minimal permission set (View Channels, Send Messages, Embed Links, Connect,
// Speak) — matches the /invite command. NOT Administrator: requesting only what
// the bot needs is safer and converts better with server admins, and the public
// listings state that Lucky asks for no admin permission.
export const BOT_INVITE_PERMISSIONS = '3165184'

// Public Discord Application ID (a.k.a. client_id). Safe to ship: it appears in
// every OAuth invite link and is not a secret. Used as the default so the CTA
// works out of the box; override via VITE_DISCORD_CLIENT_ID for a fork.
const DEFAULT_DISCORD_CLIENT_ID = '962198089161134131'

/**
 * The one invite URL. Both the landing CTA and the docs page must use this:
 * they previously built their own, drifted, and the docs copy shipped
 * `permissions=8` (Administrator) while the landing page and every public
 * listing promised the minimal set (#1888).
 */
export function getBotInviteUrl(): string {
    const clientId =
        import.meta.env.VITE_DISCORD_CLIENT_ID || DEFAULT_DISCORD_CLIENT_ID
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${BOT_INVITE_PERMISSIONS}`
}
