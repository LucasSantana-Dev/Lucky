import { ActivityType } from 'discord.js'
import type { CustomClient } from '../../types'

type PresenceActivity = {
    type: ActivityType
    name: string
}

export const PRESENCE_ROTATION_INTERVAL_MS = 45_000

const pluralize = (value: number, noun: string): string =>
    `${value} ${noun}${value === 1 ? '' : 's'}`

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

export const buildPresenceActivities = ({
    guildCount,
    memberCount,
}: {
    guildCount: number
    memberCount: number
}): PresenceActivity[] => [
    { type: ActivityType.Listening, name: '/play • Music nonstop' },
    {
        type: ActivityType.Watching,
        name: `${pluralize(guildCount, 'server')} protected`,
    },
    {
        type: ActivityType.Watching,
        name: `${pluralize(memberCount, 'member')} connected`,
    },
    { type: ActivityType.Playing, name: '/help • lucky dashboard' },
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
    })

    const safeIndex = ((index % activities.length) + activities.length) % activities.length
    const activity = activities[safeIndex]

    client.user.setPresence({
        status: 'online',
        activities: [activity],
    })

    return nextPresenceIndex(safeIndex, activities.length)
}

export const startPresenceRotation = (client: CustomClient): (() => void) => {
    let currentIndex = 0

    const rotate = (): void => {
        currentIndex = setPresenceActivity(client, currentIndex)
    }

    rotate()

    const timer = setInterval(rotate, PRESENCE_ROTATION_INTERVAL_MS)
    return (): void => clearInterval(timer)
}
