import type { GuildQueue, Track } from 'discord-player'
import type { ButtonInteraction, Client } from 'discord.js'

/**
 * Typed fixture casts for handler specs. Specs only populate the fields the
 * handler under test reads, so each widening cast lives here once and call
 * sites receive the real type instead of `as never`. All casts are identity
 * (no copy), so specs can keep asserting on the object they pass in.
 */
export function asTrack(mock: object): Track {
    return mock as unknown as Track
}

export function asGuildQueue(mock: object): GuildQueue {
    return mock as unknown as GuildQueue
}

export function asClient(mock: object): Client {
    return mock as unknown as Client
}

export function asButtonInteraction(mock: object): ButtonInteraction {
    return mock as unknown as ButtonInteraction
}

/** Casts a partial mock to the parameter type of the function under test. */
export function asParam<T>(mock: object): T {
    return mock as unknown as T
}
