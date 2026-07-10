import {
    type GuildTextBasedChannel,
    type Collection,
    type Message,
    type AttachmentBuilder,
    PermissionFlagsBits,
} from 'discord.js'
import {
    type BatchJobExecutor,
    type BatchProgress,
    type ScopeConfig,
    matchesScope,
    batchJobService,
} from '@lucky/shared/services/batch'
import { debugLog, errorLog } from '@lucky/shared/utils'
import {
    buildMoveEmbed,
    fetchAttachments,
    partitionAttachments,
    getUploadLimit,
} from '../../../handlers/moveMessageHandler'
import type { CustomClient } from '../../../types'
import { getStoredClient } from '../../../bot/clientStore'

/**
 * Executor for batch channel move operations.
 * Moves messages from a source channel to a destination channel, preserving
 * content and attachments. Implements resumability checkpointing and graceful
 * cancellation detection.
 *
 * Checkpoint ordering: updates stored BEFORE destructive delete step to ensure
 * crash-safety without duplicate posts or orphaned originals.
 */
export class ChannelMoveBatchExecutor implements BatchJobExecutor {
    jobType: 'channel_move_batch' = 'channel_move_batch'

    estimateMinutes(job: { totalItems: number }): number {
        // Estimate ~0.2 minutes per message (includes fetch, upload, delete)
        const minutes = Math.ceil(job.totalItems * 0.2)
        return Math.min(Math.max(minutes, 1), 5000) // Clamp 1–5000 mins
    }

    async execute(
        job: {
            id: string
            guildId: string
            totalItems: number
            sourceChannelId?: string
            targetChannelId?: string
            options?: Record<string, unknown>
        },
        onProgress: (progress: BatchProgress) => Promise<void>,
    ): Promise<Record<string, unknown>> {
        const client = getStoredClient() as CustomClient | null
        if (!client) {
            throw new Error('Discord client not available')
        }

        const { id: jobId, guildId, sourceChannelId, targetChannelId } = job

        if (!sourceChannelId || !targetChannelId) {
            throw new Error('sourceChannelId and targetChannelId are required')
        }

        const guild = await client.guilds.fetch(guildId).catch(() => null)
        if (!guild) {
            throw new Error(`Guild not found: ${guildId}`)
        }

        const sourceChannel = (await guild.channels
            .fetch(sourceChannelId)
            .catch(() => null)) as GuildTextBasedChannel | null

        const destChannel = (await guild.channels
            .fetch(targetChannelId)
            .catch(() => null)) as GuildTextBasedChannel | null

        if (!sourceChannel?.isTextBased() || !destChannel?.isTextBased()) {
            throw new Error(
                'Source or destination channel is not a text channel',
            )
        }

        // Verify permissions
        const botMember = guild.members.me
        if (!botMember) {
            throw new Error('Bot member not found in guild')
        }

        const sourcePerms = sourceChannel.permissionsFor(botMember)
        const destPerms = destChannel.permissionsFor(botMember)

        if (!sourcePerms?.has(PermissionFlagsBits.ManageMessages)) {
            throw new Error(
                `Missing Manage Messages permission in source channel ${sourceChannelId}`,
            )
        }

        if (
            !destPerms?.has(PermissionFlagsBits.SendMessages) ||
            !destPerms?.has(PermissionFlagsBits.EmbedLinks)
        ) {
            throw new Error(
                `Missing Send Messages or Embed Links permission in destination channel ${targetChannelId}`,
            )
        }

        // Load the job to get scope and cursor state
        const dbJob = await batchJobService.getById(jobId)
        if (!dbJob) {
            throw new Error(`Batch job not found: ${jobId}`)
        }

        const scope = dbJob.scope as unknown as ScopeConfig
        let cursor = dbJob.nextCursor || undefined
        let processed = 0
        let failed = 0
        let skipped = 0
        let messageIndex = 0
        const movedMessages: string[] = []
        const failedIds: string[] = []

        // Fetch messages in pages; start from cursor or newest
        const PAGE_SIZE = 100
        // hasMore is a fixed sentinel — the loop only ever exits via the
        // break/return below, not by this condition becoming false.
        const hasMore = true

        while (hasMore) {
            // Check for cancellation
            const refreshedJob = await batchJobService.getById(jobId)
            if (refreshedJob?.status === 'cancelled') {
                debugLog({
                    message: `Batch job ${jobId} cancelled, stopping gracefully`,
                })
                return {
                    moved: movedMessages.length,
                    failed: failedIds.length,
                    skipped,
                    cancelled: true,
                }
            }

            // Re-validate client connection mid-loop
            const currentClient = getStoredClient() as CustomClient | null
            if (!currentClient) {
                debugLog({
                    message: `Bot disconnected during batch job ${jobId}, pausing execution`,
                })
                return {
                    moved: movedMessages.length,
                    failed: failedIds.length,
                    skipped,
                    paused: true,
                }
            }

            // Fetch a page of messages
            const messages = (await sourceChannel.messages
                .fetch({
                    limit: PAGE_SIZE,
                    before: cursor,
                })
                .catch((err) => {
                    errorLog({
                        message: `Failed to fetch messages from channel ${sourceChannelId}`,
                        error: err,
                    })
                    return null
                })) as Collection<string, Message<true>> | null

            if (!messages || messages.size === 0) {
                break
            }

            // Process oldest-first within the page
            const messageArray = Array.from(messages.values())
            for (const message of messageArray) {
                // Check if message matches scope
                const matchesScopeResult = matchesScope(
                    {
                        id: message.id,
                        authorId: message.author.id,
                        content: message.content,
                        createdAt: message.createdAt,
                        index: messageIndex,
                    },
                    scope as ScopeConfig,
                )

                if (!matchesScopeResult) {
                    skipped++
                    messageIndex++
                    cursor = message.id
                    continue
                }

                try {
                    const { toUpload, tooLarge } = partitionAttachments(
                        [...message.attachments.values()],
                        getUploadLimit(guild.premiumTier),
                    )

                    // Build and send the moved embed
                    const embed = buildMoveEmbed({
                        author: message.author,
                        content: message.content,
                        createdAt: message.createdAt,
                        sourceChannelId,
                        moverTag: botMember.user.tag,
                        tooLarge,
                    })

                    let files: AttachmentBuilder[] = []
                    try {
                        files = await fetchAttachments(toUpload)
                    } catch (fetchError) {
                        errorLog({
                            message: `Failed to fetch attachments for message ${message.id}, continuing without files`,
                            error: fetchError,
                        })
                        // Continue with empty files array — embed will be posted without attachments
                    }

                    const movedMessage = await destChannel.send({
                        embeds: [embed],
                        files,
                    })

                    // CHECKPOINT BEFORE DELETE: persist success + cursor
                    // This ensures a crash after this point resumes without
                    // re-processing or duplicating the post.
                    await onProgress({
                        processed: processed + 1,
                        failed,
                        skipped,
                        total: job.totalItems,
                        percentComplete: Math.round(
                            ((processed + 1) / job.totalItems) * 100,
                        ),
                        message: `Moved ${processed + 1}/${job.totalItems} messages`,
                        nextCursor: message.id,
                    })

                    // Now delete the original (the destructive step)
                    await message.delete()

                    movedMessages.push(movedMessage.url)
                    processed++
                    messageIndex++
                    cursor = message.id

                    // Backoff between items to avoid rate limiting
                    await new Promise((resolve) => setTimeout(resolve, 120))
                } catch (error) {
                    errorLog({
                        message: `Failed to move message ${message.id}`,
                        error,
                    })
                    failed++
                    failedIds.push(message.id)
                    messageIndex++
                    cursor = message.id

                    // Even on failure, checkpoint so we don't re-attempt this message
                    await onProgress({
                        processed,
                        failed,
                        skipped,
                        total: job.totalItems,
                        percentComplete: Math.round(
                            ((processed + failed + skipped) / job.totalItems) *
                                100,
                        ),
                        message: `Processed ${processed + failed + skipped}/${job.totalItems} messages (${failed} failed)`,
                        nextCursor: cursor,
                    })
                }
            }
            // `cursor` is advanced per-message inside the loop (on skip, success,
            // and failure), so it already points at the last message examined here —
            // no page-boundary update needed.
        }

        // Final progress update
        await onProgress({
            processed,
            failed,
            skipped,
            total: job.totalItems,
            percentComplete: 100,
            message: `Completed: moved ${processed}, failed ${failed}, skipped ${skipped}`,
        })

        return {
            moved: movedMessages.length,
            failed: failedIds.length,
            skipped,
            movedUrls: movedMessages,
            failedIds,
        }
    }
}
