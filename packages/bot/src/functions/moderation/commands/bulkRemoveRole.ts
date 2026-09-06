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
        .setName('bulk-remove-role')
        .setDescription('Remove a role from every non-bot member holding it')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addRoleOption((option) =>
            option
                .setName('role')
                .setDescription('Remove this role from every member holding it')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Audit-log reason for the role removals')
                .setRequired(false),
        )
        .addBooleanOption((option) =>
            option
                .setName('dry_run')
                .setDescription(
                    'Only report how many members would be affected',
                )
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
        const jobType: BatchJobType = 'bulk_remove_role'
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

        // Exact count (no message sampling): fetch members, then count non-bot
        // holders of the role. Discord's member fetch respects its own paging,
        // so this sidesteps the 100-item message-sample trap (see #1763).
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
                content: `📊 **Dry Run**: **${totalEstimate}** member(s) would have <@&${role.id}> removed.\n\nRun again without \`dry_run\` to proceed.`,
            })
            return
        }

        const { BulkRemoveRoleExecutor } =
            await import('../batch/bulkRemoveRoleExecutor')
        const estimatedMinutes = new BulkRemoveRoleExecutor().estimateMinutes({
            totalItems: totalEstimate,
        })

        const confirmed = await showBatchConfirmation(interaction, {
            operation: 'bulk role removal',
            totalItems: totalEstimate,
            estimatedMinutes,
            fidelityWarnings: [
                `<@&${role.id}> will be removed from all ${totalEstimate} non-bot member(s) holding it`,
                'The role can be re-added manually afterward if needed',
                'Members above the bot in the role hierarchy are skipped',
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
                options: { roleId: role.id, reason },
                totalItems: totalEstimate,
                estimatedMinutes,
            })

            const enqueueResult = await enqueueBatchJob(
                (job as { id: string }).id,
            )
            if (!enqueueResult) {
                await interaction.editReply({
                    content:
                        '❌ Failed to queue bulk role removal job (Redis unavailable). Please try again.',
                })
                return
            }

            await interaction.editReply({
                content: `✅ Bulk role removal queued (ID: \`${job.id}\`) — ${totalEstimate} member(s). Track progress on the **Batch Jobs** dashboard page.`,
            })

            infoLog({
                message: `Bulk role removal job created: ${job.id}`,
                data: {
                    guildId: guild.id,
                    roleId: role.id,
                    totalItems: totalEstimate,
                },
            })
        } catch (error) {
            errorLog({
                message: 'Failed to create bulk role removal job',
                error,
            })
            await interaction.editReply({
                content: '❌ Failed to create batch job. Please try again.',
            })
        }
    },
})
