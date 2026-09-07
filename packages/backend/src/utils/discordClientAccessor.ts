import type { Client, Guild } from 'discord.js'

let botClient: Client | null = null

export function setClient(client: Client | null): void {
    botClient = client
}

export function getClient(): Client | null {
    return botClient
}

export function getBotToken(): string | null {
    const token = process.env.DISCORD_TOKEN?.trim()
    return token && token.length > 0 ? token : null
}

export async function getServableGuild(guildId: string): Promise<Guild | null> {
    const client = getClient()
    if (!client) return null
    try {
        return (
            client.guilds.cache.get(guildId) ??
            (await client.guilds.fetch(guildId))
        )
    } catch {
        return null
    }
}
