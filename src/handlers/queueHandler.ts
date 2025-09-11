import type {
    ChatInputCommandInteraction,
    VoiceChannel,
    GuildMember,
} from "discord.js"
import type { GuildQueue } from "discord-player"
import type { ICustomClient } from "../types"
import { ValidationError } from "../types/errors"

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
        throw new ValidationError("Guild not found in interaction", {
            userId: interaction.user?.id,
            channelId: interaction.channel?.id,
        })
    }

    const queue = client.player.nodes.create(interaction.guild)

    // Enable autoplay by default
    queue.setRepeatMode(3) // QueueRepeatMode.AUTOPLAY

    return queue
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
