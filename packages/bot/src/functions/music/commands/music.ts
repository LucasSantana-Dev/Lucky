import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createEmbed,
    EMBED_COLORS,
    EMOJIS,
    errorEmbed,
} from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { requireGuild } from '../../../utils/command/commandValidations'
import { providerHealthService } from '../../../utils/music/search/providerHealth'
import { musicWatchdogService } from '../../../utils/music/watchdog'
import { musicSessionSnapshotService } from '../../../utils/music/sessionSnapshots'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

function formatProviderHealth(): string {
    const statuses = providerHealthService.getAllStatuses()
    const ordered = Object.values(statuses).sort((a, b) => b.score - a.score)
    return ordered
        .map((status) => {
            const health = status.cooldownUntil ? 'cooldown' : 'ready'
            return `• ${status.provider}: ${(status.score * 100).toFixed(0)}% (${health}, failures: ${status.consecutiveFailures})`
        })
        .join('\n')
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('🎛️ Music diagnostics and reliability tools')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('health')
                .setDescription('Show queue health and recovery status'),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const subcommand = interaction.options.getSubcommand()
        if (subcommand !== 'health') {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', 'Unknown subcommand.')],
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
                        errorEmbed(
                            'Error',
                            'This command can only be used in a server.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        const { queue } = resolveGuildQueue(client, guildId)
        const queueState = queue
            ? `Playing: ${queue.node.isPlaying() ? 'yes' : 'no'}\nTracks in queue: ${queue.tracks.size}\nRepeat mode: ${queue.repeatMode}`
            : 'No active queue'
        const watchdog = musicWatchdogService.getGuildState(guildId)
        const snapshot = await musicSessionSnapshotService.getSnapshot(guildId)

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
                    value: formatProviderHealth(),
                    inline: false,
                },
                {
                    name: 'Watchdog',
                    value: `Timeout: ${watchdog.timeoutMs}ms\nLast recovery: ${watchdog.lastRecoveryAction}\nLast activity: ${watchdog.lastActivityAt ? new Date(watchdog.lastActivityAt).toISOString() : 'never'}`,
                    inline: false,
                },
                {
                    name: 'Session snapshot',
                    value: snapshot
                        ? `Snapshot: ${snapshot.sessionSnapshotId}\nSaved at: ${new Date(snapshot.savedAt).toISOString()}\nUpcoming tracks: ${snapshot.upcomingTracks.length}`
                        : 'No snapshot saved',
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
