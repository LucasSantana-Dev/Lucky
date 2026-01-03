import type {
    Client,
    Collection,
    ChatInputCommandInteraction,
} from 'discord.js'
import type { Player } from 'discord-player'
import type Command from '../models/Command'

export type CustomClient = Client & {
    commands: Collection<string, Command>
    player: Player
    cooldowns: Collection<string, number>
    redis?: unknown // Redis client
    metrics?: unknown // Metrics client
    tracer?: unknown // OpenTelemetry tracer
}

export type CommandType = {
    data: unknown
    execute: (_interaction: ChatInputCommandInteraction) => Promise<void>
}
