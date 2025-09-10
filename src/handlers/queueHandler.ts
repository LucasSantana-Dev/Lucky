import type {
    ChatInputCommandInteraction,
    VoiceChannel,
    GuildMember,
} from "discord.js"
import type { GuildQueue } from "discord-player"
import type { ICustomClient } from "../types"

interface CreateQueueParams {
    client: ICustomClient
    interaction: ChatInputCommandInteraction
}

interface QueueConnectParams {
    queue: GuildQueue
    interaction: ChatInputCommandInteraction
}

export const createQueue = async ({
    client,
    interaction,
}: CreateQueueParams): Promise<GuildQueue> => {
    if (!interaction.guild) {
        throw new Error("Guild not found in interaction")
    }
    return client.player.nodes.create(interaction.guild)
}

export const queueConnect = async ({
    queue,
    interaction,
}: QueueConnectParams): Promise<void> => {
    if (queue.connection) return
    await queue.connect(
        (interaction.member as GuildMember)?.voice.channel as VoiceChannel,
    )
}
