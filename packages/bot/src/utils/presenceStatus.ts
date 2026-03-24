import type { PresenceStatusData } from 'discord.js'

const DEFAULT_PRESENCE_STATUS: PresenceStatusData = 'online'

const ALLOWED_PRESENCE_STATUSES = new Set<PresenceStatusData>([
    'online',
    'idle',
    'dnd',
    'invisible',
])

const isPresenceStatusData = (status: string): status is PresenceStatusData =>
    ALLOWED_PRESENCE_STATUSES.has(status as PresenceStatusData)

export const getBotPresenceStatus = (): PresenceStatusData => {
    const configuredStatus = process.env.BOT_PRESENCE_STATUS?.trim().toLowerCase()

    if (!configuredStatus) {
        return DEFAULT_PRESENCE_STATUS
    }

    if (isPresenceStatusData(configuredStatus)) {
        return configuredStatus
    }

    return DEFAULT_PRESENCE_STATUS
}
