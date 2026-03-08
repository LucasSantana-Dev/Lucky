import { SlashCommandBuilder } from '@discordjs/builders'
import type { GuildMember, ChatInputCommandInteraction } from 'discord.js'
import { requireVoiceChannel } from '../../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../../types/CommandData'
import type { CustomClient } from '../../../../types'
import Command from '../../../../models/Command'
import { errorLog } from '@nexus/shared/utils'
import { createErrorEmbed } from '../../../../utils/general/embeds'
import { createSuccessEmbed } from '../../../../utils/general/embeds'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription(
            'Play music from YouTube, Spotify, or search for tracks',
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
        if (!interaction.guildId) {
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

        const member = interaction.member as GuildMember
        if (!(await requireVoiceChannel(interaction))) return

        const voiceChannel = member.voice.channel
        if (!voiceChannel) return

        const query = interaction.options.getString('query', true)

        console.log(`[PLAY-DEBUG] /play invoked by ${interaction.user.tag} with query: ${query}`)

        await interaction.deferReply()

        try {
            const result = await client.player.play(voiceChannel, query, {
                nodeOptions: {
                    metadata: {
                        channel: interaction.channel,
                        requestedBy: interaction.user,
                    },
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 30_000,
                    leaveOnEnd: true,
                    leaveOnEndCooldown: 30_000,
                },
                requestedBy: interaction.user,
            })

            const track = result.track
            const embed = result.searchResult.playlist
                ? createSuccessEmbed(
                      'Playlist Enqueued',
                      `**${result.searchResult.playlist.title}** — ${result.searchResult.tracks.length} tracks`,
                  )
                : createSuccessEmbed(
                      'Now Playing',
                      `**${track.title}** by ${track.author}`,
                  )

            await interaction.editReply({ embeds: [embed] })
        } catch (error) {
            errorLog({
                message: 'Play command error:',
                error,
                data: { query, guildId: interaction.guildId },
            })

            await interaction.editReply({
                embeds: [
                    createErrorEmbed(
                        'Play Error',
                        'Could not find or play the requested track',
                    ),
                ],
            })
        }
    },
})
