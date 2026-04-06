import { ActivityType } from 'discord.js'
import type { CustomClient } from '../../types'
import {
    getBotPresenceActivities,
    getBotPresenceStatus,
} from '../../utils/presenceStatus'

type PresenceActivity = {
    type: ActivityType
    name: string
}

type PresenceRenderStats = {
    guildCount: number
    memberCount: number
    commandCount: number
    activeMusicSessions: number
}

const MAX_ACTIVITY_NAME_LENGTH = 128

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

const renderPresenceActivityName = (
    template: string,
    stats: PresenceRenderStats,
): string =>
    template
        .replaceAll('{guildCount}', String(stats.guildCount))
        .replaceAll('{memberCount}', String(stats.memberCount))
        .replaceAll('{commandCount}', String(stats.commandCount))
        .replaceAll('{activeMusicSessions}', String(stats.activeMusicSessions))

const truncatePresenceActivityName = (text: string): string => {
    if (text.length <= MAX_ACTIVITY_NAME_LENGTH) {
        return text
    }

    return text.slice(0, MAX_ACTIVITY_NAME_LENGTH - 1) + '…'
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
}): PresenceActivity[] =>
    getBotPresenceActivities().map((activity) => ({
        type: activity.type,
        name: truncatePresenceActivityName(
            activity.template.includes('{activeMusicSessions}') &&
                activity.fallback &&
                activeMusicSessions === 0
                ? renderPresenceActivityName(activity.fallback, {
                      guildCount,
                      memberCount,
                      commandCount,
                      activeMusicSessions,
                  })
                : renderPresenceActivityName(activity.template, {
                      guildCount,
                      memberCount,
                      commandCount,
                      activeMusicSessions,
                  }),
        ),
    }))

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

    const timer = setInterval(rotate, PRESENCE_ROTATION_INTERVAL_MS)
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
