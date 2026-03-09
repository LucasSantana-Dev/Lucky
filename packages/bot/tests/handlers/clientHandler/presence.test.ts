import { ActivityType } from 'discord.js'
import {
    buildPresenceActivities,
    getTotalMemberCount,
    nextPresenceIndex,
    PRESENCE_ROTATION_INTERVAL_MS,
    setPresenceActivity,
    startPresenceRotation,
} from '../../../src/handlers/clientHandler/presence'

describe('client presence rotation', () => {
    it('builds branded activities with guild and member totals', () => {
        const activities = buildPresenceActivities({ guildCount: 5, memberCount: 128 })

        expect(activities).toEqual([
            {
                type: ActivityType.Listening,
                name: '/play • Music nonstop',
            },
            {
                type: ActivityType.Watching,
                name: '5 servers protected',
            },
            {
                type: ActivityType.Watching,
                name: '128 members connected',
            },
            {
                type: ActivityType.Playing,
                name: '/help • lucky dashboard',
            },
        ])
    })

    it('sums guild member counts safely', () => {
        const client = {
            guilds: {
                cache: {
                    values: () => [
                        { memberCount: 12 },
                        { memberCount: 0 },
                        {},
                        { memberCount: 7 },
                    ],
                },
            },
        }

        expect(getTotalMemberCount(client as never)).toBe(19)
    })

    it('rotates and applies presence with online status', () => {
        const setPresence = jest.fn()
        const client = {
            user: { setPresence },
            guilds: {
                cache: {
                    size: 2,
                    values: () => [{ memberCount: 10 }, { memberCount: 5 }],
                },
            },
        }

        const next = setPresenceActivity(client as never, 3)

        expect(next).toBe(nextPresenceIndex(3, 4))
        expect(setPresence).toHaveBeenCalledWith({
            status: 'online',
            activities: [
                {
                    type: ActivityType.Playing,
                    name: '/help • lucky dashboard',
                },
            ],
        })
    })

    it('keeps index unchanged when user is unavailable', () => {
        const client = {
            user: null,
            guilds: {
                cache: {
                    size: 1,
                    values: () => [{ memberCount: 4 }],
                },
            },
        }

        expect(setPresenceActivity(client as never, 2)).toBe(2)
    })

    it('normalizes negative rotation indexes', () => {
        const setPresence = jest.fn()
        const client = {
            user: { setPresence },
            guilds: {
                cache: {
                    size: 1,
                    values: () => [{ memberCount: 4 }],
                },
            },
        }

        const next = setPresenceActivity(client as never, -1)

        expect(next).toBe(0)
        expect(setPresence).toHaveBeenCalledWith({
            status: 'online',
            activities: [
                {
                    type: ActivityType.Playing,
                    name: '/help • lucky dashboard',
                },
            ],
        })
    })

    it('starts interval rotation and exposes stop handler', () => {
        jest.useFakeTimers()
        const setPresence = jest.fn()
        const client = {
            user: { setPresence },
            guilds: {
                cache: {
                    size: 1,
                    values: () => [{ memberCount: 3 }],
                },
            },
        }

        const stop = startPresenceRotation(client as never)

        expect(setPresence).toHaveBeenCalledTimes(1)

        jest.advanceTimersByTime(PRESENCE_ROTATION_INTERVAL_MS)
        expect(setPresence).toHaveBeenCalledTimes(2)

        stop()
        jest.advanceTimersByTime(PRESENCE_ROTATION_INTERVAL_MS * 2)
        expect(setPresence).toHaveBeenCalledTimes(2)
        jest.useRealTimers()
    })
})
