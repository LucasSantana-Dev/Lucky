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
        .setName('bulk-add-role')
        .setDescription('Add a role to every non-bot member holding a given role')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addRoleOption((option) =>
            option
                .setName('filter_role')
                .setDescription('Members with this role will receive the target role')
                .setRequired(true),
        )
        .addRoleOption((option) =>
            option
                .setName('target_role')
                .setDescription('The role to add to each member')
                .setRequired(true),
        )
        .addBooleanOption((option) =>
            option
                .setName('dry_run')
                .setDescription('Only report how many would be affected')
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

        const filterRole = interaction.options.getRole('filter_role', true) as Role
        const targetRole = interaction.options.getRole('target_role', true) as Role
        const dryRun = interaction.options.getBoolean('dry_run') ?? false

        const botMember = guild.members.me
        const jobType: BatchJobType = 'bulk_add_role'
        const permResult = checkBatchPermissions(jobType, {
            ManageRoles:
                botMember?.permissions.has(PermissionFlagsBits.ManageRoles) ??
                false,
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
        const totalEstimate = filterRole.members.filter(
            (member) => !member.user.bot,
        ).size

        if (totalEstimate === 0) {
            await interaction.editReply({
                content: `No non-bot members currently hold <@&${filterRole.id}>. Nothing to do.`,
            })
            return
        }

        if (dryRun) {
            await interaction.editReply({
                content: `📊 **Dry Run**: **${totalEstimate}** member(s) with <@&${filterRole.id}> would receive <@&${targetRole.id}>.\n\nRun again without \`dry_run\` to proceed.`,
            })
            return
        }

        const { BulkAddRoleExecutor } = await import('../batch/bulkAddRoleExecutor')
        const estimatedMinutes = new BulkAddRoleExecutor().estimateMinutes({
            totalItems: totalEstimate,
        })

        const confirmed = await showBatchConfirmation(interaction, {
            operation: 'bulk add role',
            totalItems: totalEstimate,
            estimatedMinutes,
            fidelityWarnings: [
                `All ${totalEstimate} non-bot member(s) will receive <@&${targetRole.id}>`,
                'The server owner and members above the bot are skipped',
                'Members who already have the target role are skipped',
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
                    filterRoleId: filterRole.id,
                    targetRoleId: targetRole.id,
                },
                totalItems: totalEstimate,
                estimatedMinutes,
            })

            const enqueueResult = await enqueueBatchJob(
                (job as { id: string }).id,
            )
            if (!enqueueResult) {
                await interaction.editReply({
                    content: '❌ Failed to queue bulk add-role job (Redis unavailable). Please try again.',
                })
                return
            }

            await interaction.editReply({
                content: `✅ Bulk add-role queued (ID: \`${job.id}\`) — ${totalEstimate} member(s). Track progress on the **Batch Jobs** dashboard page.`,
            })

            infoLog({
                message: `Bulk add-role job created: ${job.id}`,
                data: {
                    guildId: guild.id,
                    filterRoleId: filterRole.id,
                    targetRoleId: targetRole.id,
                    totalItems: totalEstimate,
                },
            })
        } catch (error) {
            errorLog({ message: 'Failed to create bulk add-role job', error })
            await interaction.editReply({
                content: '❌ Failed to create batch job. Please try again.',
            })
        }
    },
})
