import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js'
import Command from '../../../models/Command'
import { batchJobService } from '@lucky/shared/services/batch'
import { enqueueBatchJob } from '../../../utils/batch/batchQueue'
import { errorLog, infoLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('batch-resume')
        .setDescription('Resume a paused or failed batch job')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((option) =>
            option
                .setName('job_id')
                .setDescription('The ID of the batch job to resume')
                .setRequired(true),
        ),
    category: 'moderation',
    botPermissions: [],
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

        const jobId = interaction.options.getString('job_id', true)

        try {
            const job = await batchJobService.getById(jobId)

            if (!job) {
                await interactionReply({
                    interaction,
                    content: {
                        content: `❌ Batch job not found: \`${jobId}\``,
                    },
                })
                return
            }

            // Verify the job belongs to this guild
            if (job.guildId !== guild.id) {
                await interactionReply({
                    interaction,
                    content: {
                        content:
                            '❌ This batch job belongs to a different server.',
                    },
                })
                return
            }

            // Verify the invoker is the initiator or has ManageGuild
            const isInitiator = job.initiatedBy === interaction.user.id
            const hasManageGuild = interaction.memberPermissions?.has(
                PermissionFlagsBits.ManageGuild,
            )

            if (!isInitiator && !hasManageGuild) {
                await interactionReply({
                    interaction,
                    content: {
                        content:
                            '❌ You can only resume jobs you initiated, or you need **Manage Server** permission.',
                    },
                })
                return
            }

            // Check job status
            if (!['paused', 'failed'].includes(job.status)) {
                await interactionReply({
                    interaction,
                    content: {
                        content: `❌ Job is in \`${job.status}\` state — can only resume paused or failed jobs.`,
                    },
                })
                return
            }

            // Mark as in-progress and enqueue
            await batchJobService.markInProgress(jobId)
            const queued = await enqueueBatchJob(jobId)
            if (queued === null) {
                // Enqueue failed (Redis unavailable); roll back to failed so the job
                // is not stuck as in_progress without ever being processed.
                await batchJobService.markFailed(
                    jobId,
                    'Failed to enqueue job for processing (Redis unavailable)',
                )
                await interactionReply({
                    interaction,
                    content: {
                        content:
                            '❌ Failed to queue the batch job for processing. Please try again when the service is available.',
                    },
                })
                return
            }

            await interactionReply({
                interaction,
                content: {
                    content: `✅ Resumed batch job \`${jobId}\`. Check progress in the Batch Jobs dashboard.`,
                },
            })

            infoLog({
                message: `Resumed batch job: ${jobId}`,
                data: { guildId: guild.id, resumedBy: interaction.user.id },
            })
        } catch (error) {
            errorLog({
                message: 'Failed to resume batch job',
                error,
            })
            await interactionReply({
                interaction,
                content: {
                    content: '❌ Failed to resume batch job. Please try again.',
                },
            })
        }
    },
})
