import { ActivityType } from 'discord.js'
import {
    buildPresenceActivities,
    getActiveMusicSessions,
    getTotalMemberCount,
    nextPresenceIndex,
    PRESENCE_ROTATION_INTERVAL_MS,
    setPresenceActivity,
    startPresenceRotation,
} from '../../../src/handlers/clientHandler/presence'

describe('bot presence', () => {
    it('builds premium rotation with runtime stats', () => {
        const activities = buildPresenceActivities({
            guildCount: 12,
            memberCount: 430,
            commandCount: 24,
            activeMusicSessions: 3,
        })

        expect(activities).toEqual([
            {
                type: ActivityType.Listening,
                name: '/play • High-fidelity music',
            },
            { type: ActivityType.Watching, name: '12 servers managed' },
            { type: ActivityType.Watching, name: '430 members protected' },
            { type: ActivityType.Competing, name: '3 active music sessions' },
            { type: ActivityType.Playing, name: '/help • 24 commands' },
        ])
    })

    it('falls back when no active sessions', () => {
        const activities = buildPresenceActivities({
            guildCount: 1,
            memberCount: 7,
            commandCount: 8,
            activeMusicSessions: 0,
        })

        expect(activities[3]).toEqual({
            type: ActivityType.Competing,
            name: 'Fast and safe moderation',
        })
    })

    it('calculates total member count defensively', () => {
        const client = {
            guilds: {
                cache: {
                    values: () => [{ memberCount: 2 }, {}, { memberCount: 3 }],
                },
            },
        }

        expect(getTotalMemberCount(client as never)).toBe(5)
    })

    it('calculates active music sessions defensively', () => {
        const client = {
            player: {
                nodes: {
                    cache: {
                        values: () => [
                            { currentTrack: { id: '1' } },
                            { currentTrack: null },
                            { currentTrack: { id: '2' } },
                        ],
                    },
                },
            },
        }

        expect(getActiveMusicSessions(client as never)).toBe(2)
    })

    it('applies and rotates presence', () => {
        const setPresence = jest.fn()
        const client = {
            user: { setPresence },
            commands: { size: 10 },
            guilds: {
                cache: {
                    size: 2,
                    values: () => [{ memberCount: 5 }, { memberCount: 7 }],
                },
            },
            player: {
                nodes: {
                    cache: {
                        values: () => [{ currentTrack: { id: 'x' } }],
                    },
                },
            },
        }

        const next = setPresenceActivity(client as never, 0)

        expect(next).toBe(nextPresenceIndex(0, 5))
        expect(setPresence).toHaveBeenCalledWith({
            status: 'online',
            activities: [
                {
                    type: ActivityType.Listening,
                    name: '/play • High-fidelity music',
                },
            ],
        })
    })

    it('starts rotation and returns stop function', () => {
        jest.useFakeTimers()
        const setPresence = jest.fn()
        const client = {
            user: { setPresence },
            commands: { size: 10 },
            guilds: {
                cache: {
                    size: 1,
                    values: () => [{ memberCount: 4 }],
                },
            },
            player: {
                nodes: {
                    cache: {
                        values: () => [],
                    },
                },
            },
        }

        const controls = startPresenceRotation(client as never)

        expect(setPresence).toHaveBeenCalledTimes(1)
        jest.advanceTimersByTime(PRESENCE_ROTATION_INTERVAL_MS)
        expect(setPresence).toHaveBeenCalledTimes(2)

        controls.stop()
        jest.advanceTimersByTime(PRESENCE_ROTATION_INTERVAL_MS)
        expect(setPresence).toHaveBeenCalledTimes(2)
        jest.useRealTimers()
    })
})
