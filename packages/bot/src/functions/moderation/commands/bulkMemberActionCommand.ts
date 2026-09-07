import type { ChatInputCommandInteraction, Guild, Role } from 'discord.js'
import {
    batchJobService,
    checkBatchPermissions,
} from '@lucky/shared/services/batch'
import type { BatchJobType } from '@lucky/shared/services/batch'
import { enqueueBatchJob } from '../../../utils/batch/batchQueue'
import { showBatchConfirmation } from '../../../utils/batch/confirmationGate'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'

/**
 * Shared execute() body for "bulk role-scoped member action" slash commands
 * (bulk-kick, bulk-remove-role, ...): guard on guild, check bot permissions,
 * count non-bot role holders, honor dry-run, confirm, then create+enqueue the
 * batch job. Extracted because the per-command executors are >85% identical
 * and were flagging SonarCloud's duplication gate.
 */
export interface BulkMemberActionConfig {
    jobType: BatchJobType
    permissionFlag: bigint
    permissionKey: string
    operationLabel: string
    loadExecutor: () => Promise<{
        estimateMinutes(job: { totalItems: number }): number
    }>
    /** Return an error message to reject the selected role, or undefined if it's usable. */
    validateRole?: (role: Role, guild: Guild) => string | undefined
    zeroMembersMessage: (role: Role) => string
    dryRunMessage: (totalEstimate: number, role: Role) => string
    fidelityWarnings: (totalEstimate: number, role: Role) => string[]
    queuedMessage: (jobId: string, totalEstimate: number) => string
    queueFailureMessage: string
    createdLogMessage: (jobId: string) => string
    createFailureLogMessage: string
    createFailureReplyMessage: string
}

export async function runBulkMemberAction(
    interaction: ChatInputCommandInteraction,
    config: BulkMemberActionConfig,
): Promise<void> {
    const guild = interaction.guild
    if (!guild) {
        await interactionReply({
            interaction,
            content: { content: '❌ This command must be run in a guild.' },
        })
        return
    }

    const role = interaction.options.getRole('role', true) as Role
    // Discord caps audit-log reasons at 512 characters; longer values make
    // every per-member REST call in the batch job fail.
    const reason =
        interaction.options.getString('reason')?.slice(0, 512) ?? undefined
    const dryRun = interaction.options.getBoolean('dry_run') ?? false

    if (config.validateRole) {
        const validationError = config.validateRole(role, guild)
        if (validationError) {
            await interactionReply({
                interaction,
                content: { content: validationError },
            })
            return
        }
    }

    const botMember = guild.members.me
    const permResult = checkBatchPermissions(config.jobType, {
        [config.permissionKey]:
            botMember?.permissions.has(config.permissionFlag) ?? false,
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
    const totalEstimate = role.members.filter((member) => !member.user.bot).size

    if (totalEstimate === 0) {
        await interaction.editReply({
            content: config.zeroMembersMessage(role),
        })
        return
    }

    if (dryRun) {
        await interaction.editReply({
            content: config.dryRunMessage(totalEstimate, role),
        })
        return
    }

    const executor = await config.loadExecutor()
    const estimatedMinutes = executor.estimateMinutes({
        totalItems: totalEstimate,
    })

    const confirmed = await showBatchConfirmation(interaction, {
        operation: config.operationLabel,
        totalItems: totalEstimate,
        estimatedMinutes,
        fidelityWarnings: config.fidelityWarnings(totalEstimate, role),
    })

    if (!confirmed) {
        await interaction.editReply({ content: '❌ Operation cancelled.' })
        return
    }

    try {
        const job = await batchJobService.create({
            guildId: guild.id,
            jobType: config.jobType,
            initiatedBy: interaction.user.id,
            scope: { type: 'all', config: {} },
            options: { roleId: role.id, reason },
            totalItems: totalEstimate,
            estimatedMinutes,
        })

        const jobId = (job as { id: string }).id

        const enqueueResult = await enqueueBatchJob(jobId)
        if (!enqueueResult) {
            // Job row was already created; without this it stays "pending"
            // forever since nothing will ever pick it up off the queue.
            await batchJobService.markFailed(
                jobId,
                'Failed to enqueue job for processing (Redis unavailable)',
            )
            await interaction.editReply({ content: config.queueFailureMessage })
            return
        }

        await interaction.editReply({
            content: config.queuedMessage(jobId, totalEstimate),
        })

        infoLog({
            message: config.createdLogMessage(jobId),
            data: {
                guildId: guild.id,
                roleId: role.id,
                totalItems: totalEstimate,
            },
        })
    } catch (error) {
        errorLog({ message: config.createFailureLogMessage, error })
        await interaction.editReply({
            content: config.createFailureReplyMessage,
        })
    }
}
