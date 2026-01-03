/**
 * Discord.js interaction and client type definitions
 */

export interface DiscordChannel {
    id: string
    send: (options: { embeds: unknown[] }) => Promise<{ id: string }>
}

export interface DiscordMember {
    voice?: {
        channel?: {
            id: string
            name: string
        }
    }
}

export interface DiscordGuildMember {
    voice?: {
        channel?: {
            id: string
            name: string
        }
    }
}

export interface PlayerEvents {
    events: {
        on: (event: string, handler: Function) => void
    }
}

export interface PlayerExtractor {
    name: string
    validate: (url: string) => boolean
    extract: (url: string) => Promise<unknown>
}

export interface PlayerExtractors {
    register: (extractor: PlayerExtractor, options: Record<string, unknown>) => void
}
