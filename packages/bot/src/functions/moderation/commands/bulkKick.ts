import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
} from 'discord.js'
import Command from '../../../models/Command'
import { runBulkMemberAction } from './bulkMemberActionCommand'

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
        await runBulkMemberAction(interaction, {
            jobType: 'bulk_kick',
            permissionFlag: PermissionFlagsBits.KickMembers,
            permissionKey: 'KickMembers',
            operationLabel: 'bulk kick',
            loadExecutor: async () => {
                const { BulkKickExecutor } =
                    await import('../batch/bulkKickExecutor')
                return new BulkKickExecutor()
            },
            zeroMembersMessage: (role) =>
                `No non-bot members currently hold <@&${role.id}>. Nothing to do.`,
            dryRunMessage: (totalEstimate, role) =>
                `📊 **Dry Run**: **${totalEstimate}** member(s) with <@&${role.id}> would be kicked.\n\nRun again without \`dry_run\` to proceed.`,
            fidelityWarnings: (totalEstimate) => [
                `All ${totalEstimate} non-bot member(s) with the role will be kicked`,
                'Kicked members can rejoin with a new invite',
                'The server owner and members above the bot are skipped',
            ],
            queuedMessage: (jobId, totalEstimate) =>
                `✅ Bulk kick queued (ID: \`${jobId}\`) — ${totalEstimate} member(s). Track progress on the **Batch Jobs** dashboard page.`,
            queueFailureMessage:
                '❌ Failed to queue bulk kick job (Redis unavailable). Please try again.',
            createdLogMessage: (jobId) => `Bulk kick job created: ${jobId}`,
            createFailureLogMessage: 'Failed to create bulk kick job',
            createFailureReplyMessage:
                '❌ Failed to create batch job. Please try again.',
        })
    },
})
