import { ActivityType } from 'discord.js'
import type { CustomClient } from '../../types'
import {
    getBotPresenceRotationIntervalMs,
    getBotPresenceStatus,
} from '../../utils/presenceStatus'

type PresenceActivity = {
    type: ActivityType
    name: string
}

export const PRESENCE_ROTATION_INTERVAL_MS = 45_000

export const nextPresenceIndex = (
    currentIndex: number,
    totalActivities: number,
): number => (currentIndex + 1) % totalActivities

export const getTotalMemberCount = (client: CustomClient): number => {
    let total = 0

    for (const guild of client.guilds.cache.values()) {
        total += guild.memberCount ?? 0
    }

    return total
}

export const getActiveMusicSessions = (client: CustomClient): number => {
    const nodes = (
        client.player as {
            nodes?: { cache?: { values: () => Iterable<unknown> } }
        }
    )?.nodes?.cache

    if (!nodes?.values) {
        return 0
    }

    let count = 0
    for (const node of nodes.values()) {
        const currentTrack = (node as { currentTrack?: unknown })?.currentTrack
        if (currentTrack) {
            count += 1
        }
    }

    return count
}

export const buildPresenceActivities = ({
    guildCount,
    memberCount,
    commandCount,
    activeMusicSessions,
}: {
    guildCount: number
    memberCount: number
    commandCount: number
    activeMusicSessions: number
}): PresenceActivity[] => [
    { type: ActivityType.Listening, name: '/play • High-fidelity music' },
    { type: ActivityType.Watching, name: `${guildCount} servers managed` },
    { type: ActivityType.Watching, name: `${memberCount} members protected` },
    {
        type: ActivityType.Competing,
        name:
            activeMusicSessions > 0
                ? `${activeMusicSessions} active music sessions`
                : 'Fast and safe moderation',
    },
    { type: ActivityType.Playing, name: `/help • ${commandCount} commands` },
]

export const setPresenceActivity = (
    client: CustomClient,
    index: number,
): number => {
    if (!client.user) {
        return index
    }

    const activities = buildPresenceActivities({
        guildCount: client.guilds.cache.size,
        memberCount: getTotalMemberCount(client),
        commandCount: client.commands.size,
        activeMusicSessions: getActiveMusicSessions(client),
    })

    const safeIndex =
        ((index % activities.length) + activities.length) % activities.length
    client.user.setPresence({
        status: getBotPresenceStatus(),
        activities: [activities[safeIndex]],
    })

    return nextPresenceIndex(safeIndex, activities.length)
}

export const startPresenceRotation = (
    client: CustomClient,
): { stop: () => void; pause: () => void; resume: () => void } => {
    let currentIndex = 0
    let paused = false

    const rotate = (): void => {
        if (paused) return
        currentIndex = setPresenceActivity(client, currentIndex)
    }

    rotate()

    const timer = setInterval(rotate, getBotPresenceRotationIntervalMs())
    return {
        stop: () => clearInterval(timer),
        pause: () => {
            paused = true
        },
        resume: () => {
            paused = false
            rotate()
        },
    }
}
