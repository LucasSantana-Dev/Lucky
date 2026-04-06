import { ActivityType } from 'discord.js'
import type { CustomClient } from '../../types'
import {
    getBotPresenceActivities,
    getBotPresenceRotationIntervalMs,
    getBotPresenceStatus,
} from '../../utils/presenceStatus'

type PresenceActivity = {
    type: ActivityType
    name: string
}

type PresenceActivityContext = {
    guildCount: number
    memberCount: number
    commandCount: number
    activeMusicSessions: number
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
}: PresenceActivityContext): PresenceActivity[] =>
    getBotPresenceActivities().map((activity) => ({
        type: activity.type,
        name: renderPresenceActivityName(activity, {
            guildCount,
            memberCount,
            commandCount,
            activeMusicSessions,
        }),
    }))

const renderPresenceActivityName = (
    activity: { template: string; fallback?: string },
    context: PresenceActivityContext,
): string => {
    const templateText =
        context.activeMusicSessions === 0 && activity.fallback
            ? activity.fallback
            : activity.template

    return truncateActivityName(renderPresenceTokens(templateText, context))
}

const renderPresenceTokens = (
    text: string,
    context: PresenceActivityContext,
): string =>
    text
        .replaceAll('{guildCount}', String(context.guildCount))
        .replaceAll('{memberCount}', String(context.memberCount))
        .replaceAll('{commandCount}', String(context.commandCount))
        .replaceAll(
            '{activeMusicSessions}',
            String(context.activeMusicSessions),
        )

const truncateActivityName = (text: string): string => {
    const MAX_LENGTH = 128

    if (text.length <= MAX_LENGTH) {
        return text
    }

    return text.slice(0, MAX_LENGTH - 1) + '…'
}

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
