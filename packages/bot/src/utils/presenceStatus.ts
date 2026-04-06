import { ActivityType, type PresenceStatusData } from 'discord.js'

const DEFAULT_PRESENCE_STATUS: PresenceStatusData = 'online'

export type PresenceActivityTemplate = {
    type: ActivityType
    template: string
    fallback?: string
}

export const DEFAULT_PRESENCE_ACTIVITY_TEMPLATES: PresenceActivityTemplate[] = [
    { type: ActivityType.Listening, template: '/play • High-fidelity music' },
    { type: ActivityType.Watching, template: '{guildCount} servers managed' },
    {
        type: ActivityType.Watching,
        template: '{memberCount} members protected',
    },
    {
        type: ActivityType.Competing,
        template: '{activeMusicSessions} active music sessions',
        fallback: 'Fast and safe moderation',
    },
    { type: ActivityType.Playing, template: '/help • {commandCount} commands' },
]

export const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
    PLAYING: ActivityType.Playing,
    WATCHING: ActivityType.Watching,
    LISTENING: ActivityType.Listening,
    COMPETING: ActivityType.Competing,
}

const ALLOWED_PRESENCE_STATUSES = new Set<PresenceStatusData>([
    'online',
    'idle',
    'dnd',
    'invisible',
])

const isPresenceStatusData = (status: string): status is PresenceStatusData =>
    ALLOWED_PRESENCE_STATUSES.has(status as PresenceStatusData)

export const getBotPresenceStatus = (): PresenceStatusData => {
    const configuredStatus =
        process.env.BOT_PRESENCE_STATUS?.trim().toLowerCase()

    if (!configuredStatus) {
        return DEFAULT_PRESENCE_STATUS
    }

    if (isPresenceStatusData(configuredStatus)) {
        return configuredStatus
    }

    return DEFAULT_PRESENCE_STATUS
}

export const getBotPresenceActivities = (): PresenceActivityTemplate[] => {
    const configuredActivities = process.env.BOT_PRESENCE_ACTIVITIES?.trim()

    if (!configuredActivities) {
        return DEFAULT_PRESENCE_ACTIVITY_TEMPLATES
    }

    const activities = configuredActivities
        .split('|')
        .map((entry) => {
            const trimmedEntry = entry.trim()
            if (!trimmedEntry) return null

            const separatorIndex = trimmedEntry.indexOf(':')
            if (separatorIndex === -1) return null

            const type = trimmedEntry
                .slice(0, separatorIndex)
                .trim()
                .toUpperCase()
            const templateAndFallback = trimmedEntry
                .slice(separatorIndex + 1)
                .trim()
            if (!type || !templateAndFallback) return null

            const fallbackIndex = templateAndFallback.indexOf('??')
            const template =
                fallbackIndex === -1
                    ? templateAndFallback
                    : templateAndFallback.slice(0, fallbackIndex).trim()
            const fallback =
                fallbackIndex === -1
                    ? undefined
                    : templateAndFallback.slice(fallbackIndex + 2).trim()

            if (!template) return null

            const activityType = ACTIVITY_TYPE_MAP[type]
            if (activityType === undefined) return null

            return {
                type: activityType,
                template,
                fallback: fallback || undefined,
            }
        })
        .filter(
            (activity): activity is PresenceActivityTemplate =>
                activity !== null,
        )

    return activities.length > 0
        ? activities
        : DEFAULT_PRESENCE_ACTIVITY_TEMPLATES
}
