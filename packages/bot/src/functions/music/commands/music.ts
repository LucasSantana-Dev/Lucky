import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createEmbed,
    EMBED_COLORS,
    EMOJIS,
    createErrorEmbed,
    createSuccessEmbed,
} from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { requireGuild } from '../../../utils/command/commandValidations'
import {
    providerHealthService,
    type ProviderStatus,
} from '../../../utils/music/search/providerHealth'
import {
    musicWatchdogService,
    type WatchdogGuildState,
} from '../../../utils/music/watchdog'
import { musicSessionSnapshotService } from '../../../utils/music/sessionSnapshots'
import {
    resolveGuildQueue,
    type QueueResolutionResult,
} from '../../../utils/music/queueResolver'
import { recommendationFeedbackService } from '../../../services/musicRecommendation/feedbackService'
import type { GuildQueue } from 'discord-player'

function formatProviderHealth(statuses: ProviderStatus[]): string {
    if (statuses.length === 0) {
        return 'No provider status data collected yet.'
    }

    const ordered = [...statuses].sort((a, b) => b.score - a.score)
    return ordered
        .map((status) => {
            const health = status.cooldownUntil ? 'cooldown' : 'ready'
            const score = (status.score * 100).toFixed(0)
            const failures = status.consecutiveFailures
            return `• ${status.provider}: ${score}% (${health}, failures: ${failures})`
        })
        .join('\n')
}

function formatRepeatMode(mode: number): string {
    if (mode === 1) return 'track'
    if (mode === 2) return 'queue'
    if (mode === 3) return 'autoplay'
    return 'off'
}

function formatTime(value: number | null): string {
    return value ? new Date(value).toISOString() : 'never'
}

function formatQueueState(queue: GuildQueue | null): string {
    if (!queue) return 'No active queue'

    return [
        `Playing: ${queue.node.isPlaying() ? 'yes' : 'no'}`,
        `Tracks in queue: ${queue.tracks.size}`,
        `Repeat mode: ${formatRepeatMode(queue.repeatMode)}`,
    ].join('\n')
}

function formatResolverDiagnostics(resolution: QueueResolutionResult): string {
    const { source, diagnostics } = resolution
    const keys =
        diagnostics.cacheSampleKeys.length > 0
            ? diagnostics.cacheSampleKeys.join(', ')
            : 'none'

    return `Source: ${source}\nCache size: ${diagnostics.cacheSize}\nCache keys: ${keys}`
}

async function formatFeedbackState(userId: string): Promise<string> {
    const counts = await recommendationFeedbackService.getFeedbackCounts(userId)
    if (counts.liked === 0 && counts.disliked === 0) {
        return 'No feedback recorded. Use /recommendation feedback to tune autoplay.'
    }
    return `Liked: ${counts.liked} | Disliked: ${counts.disliked} (filtered from autoplay)`
}

function buildActionableSteps({
    queue,
    providers,
    watchdog,
    hasSnapshot,
}: {
    queue: GuildQueue | null
    providers: ProviderStatus[]
    watchdog: WatchdogGuildState
    hasSnapshot: boolean
}): string {
    const steps: string[] = []

    if (!queue) {
        steps.push('• No queue active: run /play to prime playback.')
    }

    const cooldownCount = providers.filter(
        (provider) => provider.cooldownUntil !== null,
    ).length
    if (providers.length > 0 && cooldownCount === providers.length) {
        steps.push(
            '• Providers on cooldown: wait for recovery or switch query source.',
        )
    } else if (cooldownCount > 0) {
        steps.push(
            '• Some providers degraded: retry with healthy sources first.',
        )
    }

    if (watchdog.lastRecoveryAction === 'failed') {
        steps.push(
            `• Last watchdog recovery failed${
                watchdog.lastRecoveryDetail
                    ? ` (${watchdog.lastRecoveryDetail})`
                    : ''
            }: run /skip or /play to recover manually.`,
        )
    }

    if (!hasSnapshot) {
        steps.push(
            '• No snapshot saved: run /session save before bot restarts.',
        )
    }

    if (steps.length === 0) {
        steps.push(
            '• Music subsystem looks healthy. No operator action required.',
        )
    }

    return steps.join('\n')
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('🎛️ Music diagnostics and reliability tools')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('health')
                .setDescription('Show queue health and recovery status'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('clearfeedback')
                .setDescription(
                    'Clear your personal autoplay feedback history (likes and dislikes)',
                ),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const subcommand = interaction.options.getSubcommand()

        if (subcommand === 'clearfeedback') {
            await recommendationFeedbackService.clearFeedback(
                interaction.user.id,
            )
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            'Feedback cleared',
                            'Your autoplay feedback history has been cleared. Autoplay will no longer filter previously disliked tracks.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        if (subcommand !== 'health') {
            await interactionReply({
                interaction,
                content: {
                    embeds: [createErrorEmbed('Error', 'Unknown subcommand.')],
                    ephemeral: true,
                },
            })
            return
        }

        const guildId = interaction.guildId
        if (!guildId) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            'This command can only be used in a server.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        const resolution = resolveGuildQueue(client, guildId)
        const { queue } = resolution
        const queueState = formatQueueState(queue)
        const watchdog = musicWatchdogService.getGuildState(guildId)
        const snapshot = await musicSessionSnapshotService.getSnapshot(guildId)
        const providers = Object.values(providerHealthService.getAllStatuses())
        const feedbackState = await formatFeedbackState(interaction.user.id)
        const actions = buildActionableSteps({
            queue,
            providers,
            watchdog,
            hasSnapshot: Boolean(snapshot),
        })

        const embed = createEmbed({
            title: `${EMOJIS.INFO} Music Health`,
            color: EMBED_COLORS.INFO,
            fields: [
                {
                    name: 'Queue state',
                    value: queueState,
                    inline: false,
                },
                {
                    name: 'Provider health',
                    value: formatProviderHealth(providers),
                    inline: false,
                },
                {
                    name: 'Watchdog',
                    value: [
                        `Timeout: ${watchdog.timeoutMs}ms`,
                        `Last recovery: ${watchdog.lastRecoveryAction}`,
                        `Last recovery detail: ${watchdog.lastRecoveryDetail ?? 'n/a'}`,
                        `Last recovery at: ${formatTime(watchdog.lastRecoveryAt)}`,
                        `Last activity: ${formatTime(watchdog.lastActivityAt)}`,
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: 'Resolver diagnostics',
                    value: formatResolverDiagnostics(resolution),
                    inline: false,
                },
                {
                    name: 'Session snapshot',
                    value: snapshot
                        ? [
                              `Snapshot: ${snapshot.sessionSnapshotId}`,
                              `Saved at: ${new Date(snapshot.savedAt).toISOString()}`,
                              `Upcoming tracks: ${snapshot.upcomingTracks.length}`,
                          ].join('\n')
                        : 'No snapshot saved',
                    inline: false,
                },
                {
                    name: 'Recommendation feedback',
                    value: feedbackState,
                    inline: false,
                },
                {
                    name: 'Actionable next steps',
                    value: actions,
                    inline: false,
                },
            ],
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [embed],
                ephemeral: true,
            },
        })
    },
})
