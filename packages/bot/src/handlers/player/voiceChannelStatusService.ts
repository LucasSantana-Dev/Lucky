import type { GuildQueue } from 'discord-player'
import { PermissionFlagsBits, type VoiceBasedChannel } from 'discord.js'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'

const MAX_STATUS_LENGTH = 500
const MISSING_PERMISSIONS = 50013

// Guilds already warned about the missing permission. One warning per guild
// per process keeps a misconfigured server from flooding the logs on every
// track start.
const warnedGuilds = new Set<string>()

function truncateStatus(text: string): string {
    if (text.length <= MAX_STATUS_LENGTH) return text
    return text.slice(0, MAX_STATUS_LENGTH - 1) + '…'
}

function formatStatus(title: string, author?: string): string {
    return truncateStatus(author ? `▶ ${title} - ${author}` : `▶ ${title}`)
}

function warnMissingPermission(guildId: string, channelId: string): void {
    if (warnedGuilds.has(guildId)) return
    warnedGuilds.add(guildId)
    warnLog({
        message:
            'Cannot set voice channel status: bot lacks the Set Voice Channel Status permission in this channel',
        data: { guildId, channelId },
    })
}

type StatusAccess = 'allowed' | 'missing-permission' | 'not-connected'

// Discord requires Set Voice Channel Status, plus Manage Channels when the
// bot is not connected to that channel (the clear after a disconnect).
function checkAccess(channel: VoiceBasedChannel): StatusAccess {
    const me = channel.guild.members.me
    if (!me) return 'allowed' // unknown: let the API decide
    const permissions = channel.permissionsFor(me)
    if (!permissions?.has(PermissionFlagsBits.SetVoiceChannelStatus))
        return 'missing-permission'
    if (
        me.voice?.channelId !== channel.id &&
        !permissions.has(PermissionFlagsBits.ManageChannels)
    )
        return 'not-connected'
    return 'allowed'
}

// discord.js v14 has no VoiceChannel#setStatus, so the status goes through
// the raw REST route PUT /channels/{id}/voice-status.
async function putStatus(
    queue: GuildQueue,
    status: string,
    action: 'set' | 'clear',
): Promise<void> {
    const channel = queue.channel
    if (!channel) return

    const guildId = queue.guild.id
    const access = checkAccess(channel)
    if (access === 'missing-permission') {
        warnMissingPermission(guildId, channel.id)
        return
    }
    if (access === 'not-connected') {
        // Expected after a disconnect without Manage Channels; not a
        // misconfiguration worth a warning.
        debugLog({
            message: `Skipped voice channel status ${action}: bot is not in the channel`,
            data: { guildId, channelId: channel.id },
        })
        return
    }

    try {
        await channel.client.rest.put(`/channels/${channel.id}/voice-status`, {
            body: { status },
        })
        debugLog({
            message:
                action === 'set'
                    ? 'Voice channel status updated'
                    : 'Voice channel status cleared',
            data: { guildId, status },
        })
    } catch (error) {
        if ((error as { code?: unknown })?.code === MISSING_PERMISSIONS) {
            warnMissingPermission(guildId, channel.id)
            return
        }
        errorLog({
            message: `Failed to ${action} voice channel status`,
            error,
            data: { guildId, channelId: channel.id },
        })
    }
}

export async function setTrackStatus(queue: GuildQueue): Promise<void> {
    const track = queue.currentTrack
    if (!track) return
    await putStatus(queue, formatStatus(track.title, track.author), 'set')
}

export async function clearStatus(queue: GuildQueue): Promise<void> {
    await putStatus(queue, '', 'clear')
}

/** Test hook: forget which guilds were already warned. */
export function resetWarnedGuilds(): void {
    warnedGuilds.clear()
}
