// Discord CDN URL helpers. The backend returns avatar/icon HASHES, not full
// URLs — build the CDN URL before passing to an <img>.

export function getUserAvatarUrl(userId: string, avatarHash: string): string {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=64`
}

export function getGuildIconUrl(guildId: string, iconHash: string): string {
    return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=64`
}
