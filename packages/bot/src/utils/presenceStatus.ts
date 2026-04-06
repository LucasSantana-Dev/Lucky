import type { PresenceStatusData } from 'discord.js'
import { ActivityType } from 'discord.js'

const DEFAULT_PRESENCE_STATUS: PresenceStatusData = 'online'
const DEFAULT_PRESENCE_ROTATION_INTERVAL_MS = 45_000
const MIN_PRESENCE_ROTATION_INTERVAL_MS = 15_000

export type PresenceActivityTemplate = {
    type: ActivityType
    template: string
    fallback?: string
}

const DEFAULT_PRESENCE_ACTIVITY_TEMPLATES: PresenceActivityTemplate[] = [
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

const ALLOWED_PRESENCE_STATUSES = new Set<PresenceStatusData>([
    'online',
    'idle',
    'dnd',
    'invisible',
])

const isPresenceStatusData = (status: string): status is PresenceStatusData =>
    ALLOWED_PRESENCE_STATUSES.has(status as PresenceStatusData)

const PRESENCE_ACTIVITY_TYPES = new Map<string, ActivityType>([
    ['PLAYING', ActivityType.Playing],
    ['WATCHING', ActivityType.Watching],
    ['LISTENING', ActivityType.Listening],
    ['COMPETING', ActivityType.Competing],
])

const parsePresenceActivityTemplate = (
    entry: string,
): PresenceActivityTemplate | null => {
    const trimmed = entry.trim()

    if (!trimmed) {
        return null
    }

    const separatorIndex = trimmed.indexOf(':')

    if (separatorIndex <= 0) {
        return null
    }

    const type = PRESENCE_ACTIVITY_TYPES.get(
        trimmed.slice(0, separatorIndex).trim().toUpperCase(),
    )

    if (type === undefined) {
        return null
    }

    const templateWithFallback = trimmed.slice(separatorIndex + 1).trim()

    if (!templateWithFallback) {
        return null
    }

    const fallbackIndex = templateWithFallback.indexOf('??')

    if (fallbackIndex === -1) {
        return { type, template: templateWithFallback }
    }

    const template = templateWithFallback.slice(0, fallbackIndex).trim()
    const fallback = templateWithFallback.slice(fallbackIndex + 2).trim()

    if (!template || !fallback) {
        return null
    }

    return { type, template, fallback }
}

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

export const getBotPresenceRotationIntervalMs = (): number => {
    const configuredInterval =
        process.env.BOT_PRESENCE_ROTATION_INTERVAL_MS?.trim()

    if (!configuredInterval) {
        return DEFAULT_PRESENCE_ROTATION_INTERVAL_MS
    }

    const parsedInterval = Number.parseInt(configuredInterval, 10)

    if (!Number.isInteger(parsedInterval) || parsedInterval <= 0) {
        return DEFAULT_PRESENCE_ROTATION_INTERVAL_MS
    }

    return Math.max(parsedInterval, MIN_PRESENCE_ROTATION_INTERVAL_MS)
}

export const getBotPresenceActivities = (): PresenceActivityTemplate[] => {
    const configuredActivities = process.env.BOT_PRESENCE_ACTIVITIES?.trim()

    if (!configuredActivities) {
        return DEFAULT_PRESENCE_ACTIVITY_TEMPLATES.map((activity) => ({
            ...activity,
        }))
    }

    const parsedActivities = configuredActivities
        .split('|')
        .flatMap((entry) => {
            const activity = parsePresenceActivityTemplate(entry)
            return activity ? [activity] : []
        })

    if (parsedActivities.length === 0) {
        return DEFAULT_PRESENCE_ACTIVITY_TEMPLATES.map((activity) => ({
            ...activity,
        }))
    }

    return parsedActivities
}
