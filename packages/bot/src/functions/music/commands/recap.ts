import { SlashCommandBuilder } from '@discordjs/builders'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { errorLog, infoLog } from '@lucky/shared/utils'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { translatorForInteraction } from '../../../i18n/translatorForInteraction'
import { disableRecap, enableRecap } from '../../../services/recap/recapStore'
import { resolveRecapChannel } from '../../../services/recap/recapScheduler'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('recap')
        .setDescription('📅 Weekly recap of what this server listened to')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('channel')
                .setDescription(
                    'Post the recap in a channel every Sunday at 18:00 UTC',
                )
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Text channel for the weekly recap')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('off').setDescription('Stop the weekly recap'),
        ),
    category: 'music',
    execute: async ({ interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const guild = interaction.guild
        if (!guild) return
        const t = await translatorForInteraction(interaction)
        const reply = (content: string) =>
            interactionReply({
                interaction,
                content: { content, allowedMentions: { parse: [] } },
            })

        try {
            if (interaction.options.getSubcommand() === 'off') {
                const wasOn = await disableRecap(guild.id)
                await reply(
                    t(
                        wasOn
                            ? 'music.recap.disabled'
                            : 'music.recap.alreadyOff',
                    ),
                )
                return
            }

            const picked = interaction.options.getChannel('channel', true)
            const target = await resolveRecapChannel(guild, picked.id)
            if ('reason' in target) {
                await reply(
                    target.reason === 'missing_channel'
                        ? t('music.recap.notTextChannel')
                        : t('music.recap.missingPermissions', {
                              channel: picked.id,
                          }),
                )
                return
            }

            await enableRecap(guild.id, target.channel.id, new Date())
            infoLog({
                message: 'recap: enabled',
                data: { guildId: guild.id, channelId: target.channel.id },
            })
            await reply(
                t('music.recap.enabled', { channel: target.channel.id }),
            )
        } catch (error) {
            errorLog({ message: 'recap: command failed', error })
            await reply(t('music.recap.failed'))
        }
    },
})
