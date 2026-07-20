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
        .setName('bulk-ban')
        .setDescription('Ban every non-bot member holding a given role')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addRoleOption((option) =>
            option
                .setName('role')
                .setDescription('Ban all non-bot members with this role')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Audit-log reason for the bans')
                .setRequired(false),
        )
        .addBooleanOption((option) =>
            option
                .setName('dry_run')
                .setDescription('Only report how many would be banned')
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
        const jobType: BatchJobType = 'bulk_ban'
        const permResult = checkBatchPermissions(jobType, {
            BanMembers:
                botMember?.permissions.has(PermissionFlagsBits.BanMembers) ??
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

        // Exact count: fetch members, then count non-bot holders of the role.
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
                content: `📊 **Dry Run**: **${totalEstimate}** member(s) with <@&${role.id}> would be banned.\n\nRun again without \`dry_run\` to proceed.`,
            })
            return
        }

        const { BulkBanExecutor } = await import('../batch/bulkBanExecutor')
        const estimatedMinutes = new BulkBanExecutor().estimateMinutes({
            totalItems: totalEstimate,
        })

        const confirmed = await showBatchConfirmation(interaction, {
            operation: 'bulk ban',
            totalItems: totalEstimate,
            estimatedMinutes,
            fidelityWarnings: [
                `All ${totalEstimate} non-bot member(s) with the role will be banned`,
                'Banned members cannot rejoin unless unbanned',
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
                options: { roleId: role.id, reason },
                totalItems: totalEstimate,
                estimatedMinutes,
            })

            const enqueueResult = await enqueueBatchJob(
                (job as { id: string }).id,
            )
            if (!enqueueResult) {
                await interaction.editReply({
                    content: '❌ Failed to queue bulk ban job (Redis unavailable). Please try again.',
                })
                return
            }

            await interaction.editReply({
                content: `✅ Bulk ban queued (ID: \`${job.id}\`) — ${totalEstimate} member(s). Track progress on the **Batch Jobs** dashboard page.`,
            })

            infoLog({
                message: `Bulk ban job created: ${job.id}`,
                data: {
                    guildId: guild.id,
                    roleId: role.id,
                    totalItems: totalEstimate,
                },
            })
        } catch (error) {
            errorLog({ message: 'Failed to create bulk ban job', error })
            await interaction.editReply({
                content: '❌ Failed to create batch job. Please try again.',
            })
        }
    },
})
