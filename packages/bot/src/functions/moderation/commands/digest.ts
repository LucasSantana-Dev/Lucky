import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    type ChatInputCommandInteraction,
    type TextChannel,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { moderationService } from '@lucky/shared/services'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'
import { createUserFriendlyError } from '@lucky/shared/utils'
import {
    buildDigestEmbed,
    resolveDigestPeriodDays,
} from '../../../utils/moderation/digestEmbed.js'
import { modDigestConfigService } from '../../../utils/moderation/modDigestConfig.js'
import { modDigestSchedulerService } from '../../../utils/moderation/modDigestScheduler.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export default new Command({
    data: new SlashCommandBuilder()
        .setName('digest')
        .setDescription('📊 Moderation activity digest tools')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand((sub) =>
            sub
                .setName('view')
                .setDescription('Show a moderation digest right now')
                .addStringOption((option) =>
                    option
                        .setName('period')
                        .setDescription('Time period to summarise (default: 7d)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Last 7 days', value: '7d' },
                            { name: 'Last 30 days', value: '30d' },
                            { name: 'Last 90 days', value: '90d' },
                        ),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('schedule')
                .setDescription(
                    'Enable weekly automated digest posts in a channel',
                )
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Text channel that will receive the digest')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('unschedule')
                .setDescription('Disable the automated weekly digest'),
        ),
    category: 'moderation',
    execute: async ({ interaction }) => {
        if (!interaction.guild) {
            await interactionReply({
                interaction,
                content: { content: '❌ This command can only be used in a server.' },
            })
            return
        }

        const subcommand = interaction.options.getSubcommand(false) ?? 'view'

        if (subcommand === 'schedule') {
            await handleSchedule(interaction)
            return
        }

        if (subcommand === 'unschedule') {
            await handleUnschedule(interaction)
            return
        }

        await handleView(interaction)
    },
})

async function handleView(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const period = interaction.options.getString('period') ?? '7d'
    const days = resolveDigestPeriodDays(period)

    try {
        const guildId = interaction.guild!.id
        const since = new Date(Date.now() - days * MS_PER_DAY)
        const [stats, periodCases] = await Promise.all([
            moderationService.getStats(guildId),
            moderationService.getCasesSince(guildId, since),
        ])

        const embed = buildDigestEmbed({ stats, cases: periodCases, days })

        await interactionReply({ interaction, content: { embeds: [embed] } })

        infoLog({
            message: `Mod digest viewed by ${interaction.user.tag} in ${interaction.guild!.name} (period: ${period})`,
        })
    } catch (error) {
        errorLog({ message: 'Failed to generate mod digest', error: error as Error })
        await interactionReply({
            interaction,
            content: { content: createUserFriendlyError(error) },
        })
    }
}

async function handleSchedule(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const channel = interaction.options.getChannel('channel')
    if (!channel || channel.type !== ChannelType.GuildText) {
        await interactionReply({
            interaction,
            content: { content: '❌ Please pick a text channel.' },
        })
        return
    }

    const guildId = interaction.guild!.id
    const channelId = (channel as TextChannel).id

    try {
        // Send the sample digest BEFORE persisting the schedule. This guarantees
        // that the scheduler tick can never see the guild as enabled+due-now
        // until we've already accounted for the sample post by writing
        // lastSentAt atomically with enable() below.
        const sent = await modDigestSchedulerService.sendDigestForGuild(
            guildId,
            channelId,
        )
        await modDigestConfigService.enable({
            guildId,
            channelId,
            lastSentAt: sent ? Date.now() : null,
        })

        await interactionReply({
            interaction,
            content: {
                content: `✅ Weekly mod digest scheduled for <#${channelId}>. ${
                    sent
                        ? 'A sample digest has been posted now.'
                        : 'Sample digest could not be posted yet, but the schedule is active.'
                }`,
            },
        })

        infoLog({
            message: `Mod digest scheduled by ${interaction.user.tag} in ${interaction.guild!.name} → channel ${channelId}`,
        })
    } catch (error) {
        errorLog({ message: 'Failed to schedule mod digest', error: error as Error })
        await interactionReply({
            interaction,
            content: { content: createUserFriendlyError(error) },
        })
    }
}

async function handleUnschedule(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    try {
        const removed = await modDigestConfigService.disable(interaction.guild!.id)

        await interactionReply({
            interaction,
            content: {
                content: removed
                    ? '✅ Weekly mod digest disabled.'
                    : 'ℹ️ No active digest schedule to disable.',
            },
        })

        if (removed) {
            infoLog({
                message: `Mod digest unscheduled by ${interaction.user.tag} in ${interaction.guild!.name}`,
            })
        }
    } catch (error) {
        errorLog({ message: 'Failed to unschedule mod digest', error: error as Error })
        await interactionReply({
            interaction,
            content: { content: createUserFriendlyError(error) },
        })
    }
}
