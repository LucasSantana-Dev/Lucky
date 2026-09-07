import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
} from 'discord.js'
import Command from '../../../models/Command'
import { runBulkMemberAction } from './bulkMemberActionCommand'

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
        await runBulkMemberAction(interaction, {
            jobType: 'bulk_remove_role',
            permissionFlag: PermissionFlagsBits.ManageRoles,
            permissionKey: 'ManageRoles',
            operationLabel: 'bulk role removal',
            validateRole: (role, guild) => {
                if (role.id === guild.id) {
                    return '❌ The @everyone role cannot be removed this way.'
                }
                if (!role.editable) {
                    return '❌ This role is managed by an integration or is above the bot in the role hierarchy, so it cannot be removed.'
                }
                return undefined
            },
            loadExecutor: async () => {
                const { BulkRemoveRoleExecutor } =
                    await import('../batch/bulkRemoveRoleExecutor')
                return new BulkRemoveRoleExecutor()
            },
            zeroMembersMessage: (role) =>
                `No non-bot members currently hold <@&${role.id}>. Nothing to do.`,
            dryRunMessage: (totalEstimate, role) =>
                `📊 **Dry Run**: **${totalEstimate}** member(s) would have <@&${role.id}> removed.\n\nRun again without \`dry_run\` to proceed.`,
            fidelityWarnings: (totalEstimate, role) => [
                `<@&${role.id}> will be removed from all ${totalEstimate} non-bot member(s) holding it`,
                'The role can be re-added manually afterward if needed',
                'Members above the bot in the role hierarchy are skipped',
            ],
            queuedMessage: (jobId, totalEstimate) =>
                `✅ Bulk role removal queued (ID: \`${jobId}\`) — ${totalEstimate} member(s). Track progress on the **Batch Jobs** dashboard page.`,
            queueFailureMessage:
                '❌ Failed to queue bulk role removal job (Redis unavailable). Please try again.',
            createdLogMessage: (jobId) =>
                `Bulk role removal job created: ${jobId}`,
            createFailureLogMessage: 'Failed to create bulk role removal job',
            createFailureReplyMessage:
                '❌ Failed to create batch job. Please try again.',
        })
    },
})
