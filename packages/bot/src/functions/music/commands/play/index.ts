import { SlashCommandBuilder } from '@discordjs/builders'
import type { GuildMember, ChatInputCommandInteraction } from 'discord.js'
import { requireQueue } from '../../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../../types/CommandData'
import type { CustomClient } from '../../../../types'
import Command from '../../../../models/Command'
import {
    logYouTubeError,
    isRecoverableYouTubeError,
} from '../../../../utils/music/youtubeErrorHandler'
import {
    handleError,
    createUserErrorMessage,
} from '@lukbot/shared/utils'
import { createErrorEmbed } from '../../../../utils/general/embeds'
import { PlayCommandProcessor } from './processor'
import { createSuccessResponse } from './responseHandler'
import type { PlayCommandOptions, PlayCommandResult } from './types'

async function validateGuildAndUser(
    interaction: ChatInputCommandInteraction,
    _member: GuildMember,
): Promise<boolean> {
    if (interaction.guildId === null) {
        await interaction.reply({
            embeds: [
                createErrorEmbed(
                    'Error',
                    'This command can only be used in a server',
                ),
            ],
            ephemeral: true,
        })
        return false
    }

    // Member is guaranteed to exist at this point

    return true
}

type ProcessPlayCommandOptions = {
    query: string
    member: GuildMember
    guildId: string
    channelId: string
    interaction: ChatInputCommandInteraction
    client: CustomClient
}

async function processPlayCommand(
    options: ProcessPlayCommandOptions,
): Promise<void> {
    const { query, member, guildId, channelId, interaction, client } = options
    const processor = new PlayCommandProcessor()
    const queue = client.player.queues.get(guildId)
    if (!queue) {
        await interaction.editReply({
            embeds: [createErrorEmbed('Error', 'Queue not found')],
        })
        return
    }
    const playOptions: PlayCommandOptions = {
        query,
        user: member,
        guildId,
        channelId,
        player: client.player,
        queue,
    }

    const result: PlayCommandResult =
        await processor.processPlayCommand(playOptions)

    if (result.success) {
        const response = createSuccessResponse(result, query)
        await interaction.editReply(response)
    } else {
        const errorMessage = createUserErrorMessage(
            result.error ?? 'Unknown error',
        )
        await interaction.editReply({
            embeds: [createErrorEmbed('Play Error', errorMessage)],
        })
    }
}

type HandlePlayErrorOptions = {
    error: Error
    query: string
    member: GuildMember
    guildId: string
    interaction: ChatInputCommandInteraction
}

async function handlePlayError(options: HandlePlayErrorOptions): Promise<void> {
    const { error, query, member, guildId, interaction } = options
    logYouTubeError(error, query, member.id)

    if (isRecoverableYouTubeError(error)) {
        await interaction.editReply({
            embeds: [
                createErrorEmbed(
                    'Temporary Error',
                    'Please try again in a moment',
                ),
            ],
        })
    } else {
        await handleError(error, {
            userId: member.id,
            guildId,
            details: { query },
        })

        await interaction.editReply({
            embeds: [
                createErrorEmbed(
                    'Play Error',
                    'An error occurred while processing your request',
                ),
            ],
        })
    }
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription(
            '🎵 Play music from YouTube, Spotify, or search for tracks',
        )
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription(
                    'Song name, artist, YouTube URL, or Spotify URL',
                )
                .setRequired(true),
        ),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
        const { guildId } = interaction
        if (guildId === null) {
            await interaction.reply({
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'This command can only be used in a server',
                    ),
                ],
                ephemeral: true,
            })
            return
        }
        const queue = client.player.queues.get(guildId)
        if (!(await requireQueue(queue, interaction))) return

        const query = interaction.options.getString('query', true)
        const member = interaction.member as GuildMember

        if (!(await validateGuildAndUser(interaction, member))) {
            return
        }

        await interaction.deferReply()

        try {
            await processPlayCommand({
                query,
                member,
                guildId,
                channelId: interaction.channelId,
                interaction,
                client,
            })
        } catch (error) {
            await handlePlayError({
                error: error as Error,
                query,
                member,
                guildId,
                interaction,
            })
        }
    },
})
