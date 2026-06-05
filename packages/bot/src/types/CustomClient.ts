import type {
    ChatInputCommandInteraction,
    Client,
    Collection,
} from 'discord.js'
import type { Player } from 'discord-player'
import type Command from '../models/Command'

// Extracted from `./index` so consumers can import `CustomClient`
// without round-tripping through the barrel. See
// decisions/2026-05-16-next-refactor-target-bot-circular-deps.md.
// NOTE: a type-only cycle through `models/Command → types/CommandData`
// persists at the module-graph level (madge cycle 1 of the original
// list); it is `import type` only and erased by tsc, so it has no
// runtime effect. A structural break was attempted but cascades into
// `Collection<string, Command>` consumers (help.ts) that expect the
// real class. Deferred to a follow-up PR once Cluster C lands and the
// command-loader contracts can be revisited together.
export type CustomClient = Client & {
    commands: Collection<string, Command>
    player: Player
    cooldowns: Collection<string, number>
    redis?: unknown
    metrics?: unknown
    tracer?: unknown
    token?: string
    clientId?: string
}

export type CommandType = {
    data: unknown
    execute: (_interaction: ChatInputCommandInteraction) => Promise<void>
}
