import type { GuildQueue } from 'discord-player'
import type { VoiceBasedChannel } from 'discord.js'
import { debugLog, errorLog } from '@lucky/shared/utils'

const MAX_STATUS_LENGTH = 500

function truncateStatus(text: string): string {
    if (text.length <= MAX_STATUS_LENGTH) return text
    return text.slice(0, MAX_STATUS_LENGTH - 1) + '…'
}

function getVoiceChannel(queue: GuildQueue): VoiceBasedChannel | null {
    return queue.channel ?? null
}

export async function setTrackStatus(queue: GuildQueue): Promise<void> {
    const channel = getVoiceChannel(queue)
    if (!channel || !('setStatus' in channel)) return

    const track = queue.currentTrack
    if (!track) return

    const status = truncateStatus(`🎵 ${track.title} — ${track.author}`)
    try {
        await (
            channel as VoiceBasedChannel & {
                setStatus: (s: string) => Promise<void>
            }
        ).setStatus(status)
        debugLog({
            message: 'Voice channel status updated',
            data: { guildId: queue.guild.id, status },
        })
    } catch (error) {
        errorLog({ message: 'Failed to set voice channel status', error })
    }
}

export async function clearStatus(queue: GuildQueue): Promise<void> {
    const channel = getVoiceChannel(queue)
    if (!channel || !('setStatus' in channel)) return

    try {
        await (
            channel as VoiceBasedChannel & {
                setStatus: (s: string) => Promise<void>
            }
        ).setStatus('')
        debugLog({
            message: 'Voice channel status cleared',
            data: { guildId: queue.guild.id },
        })
    } catch (error) {
        errorLog({ message: 'Failed to clear voice channel status', error })
    }
}
