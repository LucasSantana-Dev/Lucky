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
        .setName('bulk-kick')
        .setDescription('Kick every non-bot member holding a given role')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addRoleOption((option) =>
            option
                .setName('role')
                .setDescription('Kick all non-bot members with this role')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Audit-log reason for the kicks')
                .setRequired(false),
        )
        .addBooleanOption((option) =>
            option
                .setName('dry_run')
                .setDescription('Only report how many would be kicked')
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
        const jobType: BatchJobType = 'bulk_kick'
        const permResult = checkBatchPermissions(jobType, {
            KickMembers:
                botMember?.permissions.has(PermissionFlagsBits.KickMembers) ??
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
                content: `📊 **Dry Run**: **${totalEstimate}** member(s) with <@&${role.id}> would be kicked.\n\nRun again without \`dry_run\` to proceed.`,
            })
            return
        }

        const { BulkKickExecutor } = await import('../batch/bulkKickExecutor')
        const estimatedMinutes = new BulkKickExecutor().estimateMinutes({
            totalItems: totalEstimate,
        })

        const confirmed = await showBatchConfirmation(interaction, {
            operation: 'bulk kick',
            totalItems: totalEstimate,
            estimatedMinutes,
            fidelityWarnings: [
                `All ${totalEstimate} non-bot member(s) with the role will be kicked`,
                'Kicked members can rejoin with a new invite',
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

            await enqueueBatchJob(job.id)

            await interaction.editReply({
                content: `✅ Bulk kick queued (ID: \`${job.id}\`) — ${totalEstimate} member(s). Track progress on the **Batch Jobs** dashboard page.`,
            })

            infoLog({
                message: `Bulk kick job created: ${job.id}`,
                data: {
                    guildId: guild.id,
                    roleId: role.id,
                    totalItems: totalEstimate,
                },
            })
        } catch (error) {
            errorLog({ message: 'Failed to create bulk kick job', error })
            await interaction.editReply({
                content: '❌ Failed to create batch job. Please try again.',
            })
        }
    },
})
