import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
    type Role,
} from 'discord.js'
import Command from '../../../models/Command'
import {
    batchJobService,
    checkBatchPermissions,
} from '@lucky/shared/services/batch'
import type { BatchJobType } from '@lucky/shared/services/batch'
import { enqueueBatchJob } from '../../../utils/batch/batchQueue'
import { showBatchConfirmation } from '../../../utils/batch/confirmationGate'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('bulk-warn')
        .setDescription('Warn every non-bot member holding a given role')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addRoleOption((option) =>
            option
                .setName('role')
                .setDescription('Warn all non-bot members with this role')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Audit-log reason for the warnings')
                .setRequired(false),
        )
        .addBooleanOption((option) =>
            option
                .setName('dry_run')
                .setDescription('Only report how many would be warned')
                .setRequired(false),
        ),
    category: 'moderation',
    execute: async ({
        interaction,
    }: {
        interaction: ChatInputCommandInteraction
    }) => {
        const guild = interaction.guild
        if (!guild) {
            await interactionReply({
                interaction,
                content: { content: '❌ This command must be run in a guild.' },
            })
            return
        }

        const role = interaction.options.getRole('role', true) as Role
        const reason = interaction.options.getString('reason') ?? undefined
        const dryRun = interaction.options.getBoolean('dry_run') ?? false

        const botMember = guild.members.me
        const jobType: BatchJobType = 'bulk_warn'
        const permResult = checkBatchPermissions(jobType, {
            ManageMessages:
                botMember?.permissions.has(
                    PermissionFlagsBits.ModerateMembers,
                ) ?? false,
        })
        if (!permResult.allowed) {
            await interactionReply({
                interaction,
                content: {
                    content: `❌ Permission check failed:\n${permResult.missing
                        .map((m) => `• ${m}`)
                        .join('\n')}`,
                },
            })
            return
        }

        await interaction.deferReply({ ephemeral: true })

        await guild.members.fetch()
        const totalEstimate = role.members.filter(
            (member) => !member.user.bot,
        ).size

        if (totalEstimate === 0) {
            await interaction.editReply({
                content: `No non-bot members currently hold <@&${role.id}>. Nothing to do.`,
            })
            return
        }

        if (dryRun) {
            await interaction.editReply({
                content: `📊 **Dry Run**: **${totalEstimate}** member(s) with <@&${role.id}> would be warned.\n\nRun again without \`dry_run\` to proceed.`,
            })
            return
        }

        const { BulkWarnExecutor } = await import('../batch/bulkWarnExecutor')
        const estimatedMinutes = new BulkWarnExecutor().estimateMinutes({
            totalItems: totalEstimate,
        })

        const confirmed = await showBatchConfirmation(interaction, {
            operation: 'bulk warn',
            totalItems: totalEstimate,
            estimatedMinutes,
            fidelityWarnings: [
                `All ${totalEstimate} non-bot member(s) with the role will receive a warning case`,
                'No DMs will be sent (batch operation)',
                'The server owner and members above the bot are skipped',
            ],
        })

        if (!confirmed) {
            await interaction.editReply({ content: '❌ Operation cancelled.' })
            return
        }

        try {
            const job = await batchJobService.create({
                guildId: guild.id,
                jobType,
                initiatedBy: interaction.user.id,
                scope: { type: 'all', config: {} },
                options: {
                    roleId: role.id,
                    reason: reason ?? 'No reason provided',
                    moderatorId: interaction.user.id,
                    moderatorName: interaction.user.tag,
                },
                totalItems: totalEstimate,
                estimatedMinutes,
            })

            const enqueueResult = await enqueueBatchJob(
                (job as { id: string }).id,
            )
            if (!enqueueResult) {
                await interaction.editReply({
                    content: '❌ Failed to queue bulk warn job (Redis unavailable). Please try again.',
                })
                return
            }

            await interaction.editReply({
                content: `✅ Bulk warn queued (ID: \`${job.id}\`) — ${totalEstimate} member(s). Track progress on the **Batch Jobs** dashboard page.`,
            })

            infoLog({
                message: `Bulk warn job created: ${job.id}`,
                data: {
                    guildId: guild.id,
                    roleId: role.id,
                    totalItems: totalEstimate,
                },
            })
        } catch (error) {
            errorLog({ message: 'Failed to create bulk warn job', error })
            await interaction.editReply({
                content: '❌ Failed to create batch job. Please try again.',
            })
        }
    },
})
