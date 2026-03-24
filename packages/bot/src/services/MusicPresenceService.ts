import { ActivityType } from 'discord.js'
import type { Track } from 'discord-player'
import type { CustomClient } from '../types'
import { debugLog } from '@lucky/shared/utils'
import { getBotPresenceStatus } from '../utils/presenceStatus'

const activeGuilds = new Set<string>()
let pauseRotationFn: (() => void) | null = null
let resumeRotationFn: (() => void) | null = null
let clientRef: CustomClient | null = null

export function initMusicPresence(
    client: CustomClient,
    pause: () => void,
    resume: () => void,
): void {
    clientRef = client
    pauseRotationFn = pause
    resumeRotationFn = resume
}

export function setNowPlaying(guildId: string, track: Track): void {
    if (!clientRef?.user) return

    activeGuilds.add(guildId)
    pauseRotationFn?.()

    const name = truncateActivityName(`${track.title} — ${track.author}`)
    clientRef.user.setPresence({
        status: getBotPresenceStatus(),
        activities: [{ type: ActivityType.Listening, name }],
    })

    debugLog({ message: 'Music presence set', data: { guildId, track: name } })
}

export function clearMusicPresence(guildId: string): void {
    activeGuilds.delete(guildId)

    if (activeGuilds.size > 0) {
        debugLog({
            message: 'Music still active in other guilds',
            data: { remaining: activeGuilds.size },
        })
        return
    }

    resumeRotationFn?.()
    debugLog({ message: 'Music presence cleared, rotation resumed' })
}

function truncateActivityName(text: string): string {
    const MAX_LENGTH = 128
    if (text.length <= MAX_LENGTH) return text
    return text.slice(0, MAX_LENGTH - 1) + '…'
}
