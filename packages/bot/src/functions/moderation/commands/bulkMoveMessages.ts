import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
    type GuildTextBasedChannel,
    type Collection,
    type Message,
} from 'discord.js'
import Command from '../../../models/Command'
import {
    batchJobService,
    checkBatchPermissions,
    matchesScope,
} from '@lucky/shared/services/batch'
import type { BatchJobType } from '@lucky/shared/services/batch'
import { enqueueBatchJob } from '../../../utils/batch/batchQueue'
import { showBatchConfirmation } from '../../../utils/batch/confirmationGate'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('bulk-move-messages')
        .setDescription('Move multiple messages from one channel to another')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption((option) =>
            option
                .setName('source')
                .setDescription('Source channel to move messages from')
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName('destination')
                .setDescription('Destination channel to move messages to')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('scope')
                .setDescription('Which messages to move')
                .setRequired(true)
                .addChoices(
                    { name: 'All messages', value: 'all' },
                    { name: 'Newest N messages', value: 'count' },
                    { name: 'Messages by user', value: 'user' },
                    { name: 'Messages in date range', value: 'date_range' },
                    { name: 'Messages containing text', value: 'contains' },
                ),
        )
        .addIntegerOption((option) =>
            option
                .setName('count')
                .setDescription('Number of messages (for count scope)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(5000),
        )
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('User whose messages to move (for user scope)')
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName('date_range')
                .setDescription(
                    'Date range for filtering (for date_range scope)',
                )
                .setRequired(false)
                .addChoices(
                    { name: 'Last 2 days', value: '2d' },
                    { name: 'Last 7 days', value: '7d' },
                    { name: 'Last 30 days', value: '30d' },
                ),
        )
        .addStringOption((option) =>
            option
                .setName('contains')
                .setDescription('Text filter (for contains scope)')
                .setRequired(false),
        )
        .addBooleanOption((option) =>
            option
                .setName('dry_run')
                .setDescription('Preview count without moving messages')
                .setRequired(false),
        ),
    category: 'moderation',
    botPermissions: [PermissionFlagsBits.ManageMessages],
    execute: async ({ interaction }) => {
        const guild = interaction.guild
        if (!guild) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ This command can only be used in a server.',
                },
            })
            return
        }

        const sourceChannelInput = interaction.options.getChannel(
            'source',
            true,
        )
        const destChannelInput = interaction.options.getChannel(
            'destination',
            true,
        )
        const scopeType = interaction.options.getString('scope', true) as
            | 'all'
            | 'count'
            | 'user'
            | 'date_range'
            | 'contains'
        const dryRun = interaction.options.getBoolean('dry_run') ?? false

        // Type-guard the channels
        const sourceChannel = sourceChannelInput as GuildTextBasedChannel | null
        const destChannel = destChannelInput as GuildTextBasedChannel | null

        if (!sourceChannel?.isTextBased() || !destChannel?.isTextBased()) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ Both channels must be text channels.',
                },
            })
            return
        }

        // Validate scope options
        let scopeConfig: Record<string, unknown> = {}

        if (scopeType === 'count') {
            const count = interaction.options.getInteger('count')
            if (!count) {
                await interactionReply({
                    interaction,
                    content: {
                        content: '❌ Count scope requires the `count` option.',
                    },
                })
                return
            }
            scopeConfig = { count }
        } else if (scopeType === 'user') {
            const user = interaction.options.getUser('user')
            if (!user) {
                await interactionReply({
                    interaction,
                    content: {
                        content: '❌ User scope requires the `user` option.',
                    },
                })
                return
            }
            scopeConfig = { userId: user.id }
        } else if (scopeType === 'date_range') {
            const dateRangeStr = interaction.options.getString('date_range')
            if (!dateRangeStr) {
                await interactionReply({
                    interaction,
                    content: {
                        content:
                            '❌ Date range scope requires the `date_range` option.',
                    },
                })
                return
            }
            const now = new Date()
            let start = new Date()
            if (dateRangeStr === '2d') {
                start.setDate(now.getDate() - 2)
            } else if (dateRangeStr === '7d') {
                start.setDate(now.getDate() - 7)
            } else if (dateRangeStr === '30d') {
                start.setDate(now.getDate() - 30)
            }
            scopeConfig = {
                dateRangeStart: start,
                dateRangeEnd: now,
            }
        } else if (scopeType === 'contains') {
            const searchText = interaction.options.getString('contains')
            if (!searchText) {
                await interactionReply({
                    interaction,
                    content: {
                        content:
                            '❌ Contains scope requires the `contains` option.',
                    },
                })
                return
            }
            scopeConfig = { searchText }
        }

        // Validate channels
        if (sourceChannel.id === destChannel.id) {
            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Source and destination channels must be different.',
                },
            })
            return
        }

        // Check permissions
        const botMember = guild.members.me
        if (!botMember) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ Bot member not found.',
                },
            })
            return
        }

        const jobType: BatchJobType = 'channel_move_batch'
        const permResult = checkBatchPermissions(jobType, {
            ManageMessages:
                sourceChannel
                    .permissionsFor(botMember)
                    ?.has('ManageMessages') ?? false,
            SendMessages:
                destChannel.permissionsFor(botMember)?.has('SendMessages') ??
                false,
            EmbedLinks:
                destChannel.permissionsFor(botMember)?.has('EmbedLinks') ??
                false,
            AttachFiles:
                destChannel.permissionsFor(botMember)?.has('AttachFiles') ??
                false,
        })
        if (!permResult.allowed) {
            await interactionReply({
                interaction,
                content: {
                    content: `❌ Permission check failed:\n${permResult.missing.map((m) => `• ${m}`).join('\n')}`,
                },
            })
            return
        }

        // Estimate total by sampling (cap at 500 fetches for performance)
        await interaction.deferReply({ ephemeral: true })

        let totalEstimate = 0
        const SAMPLE_SIZE = 500
        try {
            const sampleMessages = (await sourceChannel.messages.fetch({
                limit: SAMPLE_SIZE,
            })) as Collection<string, Message<true>>

            let sampleMatched = 0
            let messageIndex = 0
            for (const msg of sampleMessages.values()) {
                const matches = matchesScope(
                    {
                        id: msg.id,
                        authorId: msg.author.id,
                        content: msg.content,
                        createdAt: msg.createdAt,
                        index: messageIndex,
                    },
                    {
                        type: scopeType,
                        config: scopeConfig,
                    } as any,
                )
                if (matches) sampleMatched++
                messageIndex++
            }

            // Estimate based on sample ratio (conservatively assume all match)
            totalEstimate =
                scopeType === 'count'
                    ? ((scopeConfig.count as number) ?? 0)
                    : sampleMatched
        } catch (error) {
            errorLog({
                message: 'Failed to estimate message count',
                error,
            })
            await interaction.editReply({
                content: '❌ Failed to estimate message count.',
            })
            return
        }

        if (totalEstimate === 0) {
            await interaction.editReply({
                content: '⚠️ No messages match the specified scope.',
            })
            return
        }

        if (dryRun) {
            await interaction.editReply({
                content: `📊 **Dry Run**: Estimated **${totalEstimate}** messages would be moved.\n\nRun again without \`dry_run\` to proceed.`,
            })
            return
        }

        // Show confirmation dialog
        const { ChannelMoveBatchExecutor } =
            await import('../batch/channelMoveExecutor')
        const executor = new ChannelMoveBatchExecutor()
        const estimatedMinutes = executor.estimateMinutes({
            totalItems: totalEstimate,
        })

        const confirmed = await showBatchConfirmation(interaction, {
            operation: 'channel move',
            totalItems: totalEstimate,
            estimatedMinutes,
            fidelityWarnings: [
                'Reactions, threads, and pins are not preserved',
                'This operation is irreversible',
            ],
        })

        if (!confirmed) {
            await interaction.editReply({
                content: '❌ Operation cancelled.',
            })
            return
        }

        // Create batch job
        try {
            const job = await batchJobService.create({
                guildId: guild.id,
                jobType,
                initiatedBy: interaction.user.id,
                sourceChannelId: sourceChannel.id,
                targetChannelId: destChannel.id,
                scope: {
                    type: scopeType,
                    config: scopeConfig,
                },
                totalItems: totalEstimate,
                estimatedMinutes,
            })

            await enqueueBatchJob(job.id)

            await interaction.editReply({
                content: `✅ Batch job created (ID: \`${job.id}\`). Track progress in the **Batch Jobs** dashboard page.`,
            })

            infoLog({
                message: `Batch move job created: ${job.id}`,
                data: {
                    sourceChannelId: sourceChannel.id,
                    destChannelId: destChannel.id,
                    totalItems: totalEstimate,
                },
            })
        } catch (error) {
            errorLog({
                message: 'Failed to create batch job',
                error,
            })
            await interaction.editReply({
                content: '❌ Failed to create batch job. Please try again.',
            })
        }
    },
})
