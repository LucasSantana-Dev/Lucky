import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { ActivityType } from 'discord.js'
import type { CustomClient } from '../../types'

const mockGetBotPresenceStatus = jest.fn().mockReturnValue('online')

jest.mock('../../utils/presenceStatus', () => ({
    getBotPresenceStatus: mockGetBotPresenceStatus,
}))

import {
    PRESENCE_ROTATION_INTERVAL_MS,
    nextPresenceIndex,
    getTotalMemberCount,
    getActiveMusicSessions,
    buildPresenceActivities,
    setPresenceActivity,
    startPresenceRotation,
} from './presence'

function createMockGuild(memberCount: number) {
    return {
        memberCount,
    }
}

function createMockClient(overrides?: Partial<CustomClient>): CustomClient {
    const defaultClient = {
        guilds: {
            cache: {
                size: 0,
                values: () => [],
            },
        },
        commands: {
            size: 0,
        },
        user: null,
        player: null,
    }

    return {
        ...defaultClient,
        ...overrides,
    } as any
}

describe('presence', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('PRESENCE_ROTATION_INTERVAL_MS', () => {
        it('should be 45 seconds', () => {
            expect(PRESENCE_ROTATION_INTERVAL_MS).toBe(45_000)
        })
    })

    describe('nextPresenceIndex', () => {
        it('should increment index', () => {
            expect(nextPresenceIndex(0, 5)).toBe(1)
            expect(nextPresenceIndex(1, 5)).toBe(2)
        })

        it('should wrap around at end', () => {
            expect(nextPresenceIndex(4, 5)).toBe(0)
        })

        it('should handle single activity', () => {
            expect(nextPresenceIndex(0, 1)).toBe(0)
        })
    })

    describe('getTotalMemberCount', () => {
        it('should return 0 for no guilds', () => {
            const client = createMockClient()
            expect(getTotalMemberCount(client)).toBe(0)
        })

        it('should sum member counts across guilds', () => {
            const client = createMockClient({
                guilds: {
                    cache: {
                        values: jest
                            .fn()
                            .mockReturnValue([
                                createMockGuild(100),
                                createMockGuild(200),
                                createMockGuild(50),
                            ]),
                    },
                },
            } as any)

            expect(getTotalMemberCount(client)).toBe(350)
        })

        it('should handle guilds with undefined memberCount', () => {
            const client = createMockClient({
                guilds: {
                    cache: {
                        values: jest
                            .fn()
                            .mockReturnValue([
                                { memberCount: 100 },
                                { memberCount: undefined },
                                { memberCount: 50 },
                            ]),
                    },
                },
            } as any)

            expect(getTotalMemberCount(client)).toBe(150)
        })
    })

    describe('getActiveMusicSessions', () => {
        it('should return 0 when player nodes are undefined', () => {
            const client = createMockClient({ player: null } as any)
            expect(getActiveMusicSessions(client)).toBe(0)
        })

        it('should return 0 when cache is undefined', () => {
            const client = createMockClient({
                player: { nodes: {} },
            } as any)
            expect(getActiveMusicSessions(client)).toBe(0)
        })

        it('should count nodes with currentTrack', () => {
            const client = createMockClient({
                player: {
                    nodes: {
                        cache: {
                            values: jest
                                .fn()
                                .mockReturnValue([
                                    { currentTrack: { title: 'Song 1' } },
                                    { currentTrack: null },
                                    { currentTrack: { title: 'Song 2' } },
                                ]),
                        },
                    },
                },
            } as any)

            expect(getActiveMusicSessions(client)).toBe(2)
        })

        it('should return 0 when no nodes have currentTrack', () => {
            const client = createMockClient({
                player: {
                    nodes: {
                        cache: {
                            values: jest
                                .fn()
                                .mockReturnValue([
                                    { currentTrack: null },
                                    { currentTrack: undefined },
                                ]),
                        },
                    },
                },
            } as any)

            expect(getActiveMusicSessions(client)).toBe(0)
        })
    })

    describe('buildPresenceActivities', () => {
        it('should build 5 activities', () => {
            const activities = buildPresenceActivities({
                guildCount: 10,
                memberCount: 500,
                commandCount: 50,
                activeMusicSessions: 3,
            })

            expect(activities).toHaveLength(5)
        })

        it('should include guild count in activities', () => {
            const activities = buildPresenceActivities({
                guildCount: 42,
                memberCount: 500,
                commandCount: 50,
                activeMusicSessions: 0,
            })

            expect(activities[1].name).toBe('42 servers managed')
        })

        it('should include member count in activities', () => {
            const activities = buildPresenceActivities({
                guildCount: 10,
                memberCount: 1234,
                commandCount: 50,
                activeMusicSessions: 0,
            })

            expect(activities[2].name).toBe('1234 members protected')
        })

        it('should show active music sessions when > 0', () => {
            const activities = buildPresenceActivities({
                guildCount: 10,
                memberCount: 500,
                commandCount: 50,
                activeMusicSessions: 7,
            })

            expect(activities[3].name).toBe('7 active music sessions')
        })

        it('should show moderation message when no music sessions', () => {
            const activities = buildPresenceActivities({
                guildCount: 10,
                memberCount: 500,
                commandCount: 50,
                activeMusicSessions: 0,
            })

            expect(activities[3].name).toBe('Fast and safe moderation')
        })

        it('should include command count', () => {
            const activities = buildPresenceActivities({
                guildCount: 10,
                memberCount: 500,
                commandCount: 75,
                activeMusicSessions: 0,
            })

            expect(activities[4].name).toBe('/help • 75 commands')
        })

        it('should set correct activity types', () => {
            const activities = buildPresenceActivities({
                guildCount: 10,
                memberCount: 500,
                commandCount: 50,
                activeMusicSessions: 0,
            })

            expect(activities[0].type).toBe(ActivityType.Listening)
            expect(activities[1].type).toBe(ActivityType.Watching)
            expect(activities[2].type).toBe(ActivityType.Watching)
            expect(activities[3].type).toBe(ActivityType.Competing)
            expect(activities[4].type).toBe(ActivityType.Playing)
        })
    })

    describe('setPresenceActivity', () => {
        it('should return index when client.user is null', () => {
            const client = createMockClient({ user: null })
            const result = setPresenceActivity(client, 2)
            expect(result).toBe(2)
        })

        it('should set presence and return next index', () => {
            const setPresence = jest.fn()
            const client = createMockClient({
                user: { setPresence },
                guilds: { cache: { size: 5, values: () => [] } },
                commands: { size: 30 },
            } as any)

            const result = setPresenceActivity(client, 0)

            expect(setPresence).toHaveBeenCalled()
            expect(result).toBe(1)
        })

        it('should handle negative index', () => {
            const setPresence = jest.fn()
            const client = createMockClient({
                user: { setPresence },
                guilds: { cache: { size: 5, values: () => [] } },
                commands: { size: 30 },
            } as any)

            const result = setPresenceActivity(client, -1)

            expect(setPresence).toHaveBeenCalled()
            expect(result).toBeGreaterThanOrEqual(0)
        })

        it('should handle index beyond array length', () => {
            const setPresence = jest.fn()
            const client = createMockClient({
                user: { setPresence },
                guilds: { cache: { size: 5, values: () => [] } },
                commands: { size: 30 },
            } as any)

            const result = setPresenceActivity(client, 100)

            expect(setPresence).toHaveBeenCalled()
            expect(result).toBeLessThan(5)
        })

        it('should use getBotPresenceStatus', () => {
            const setPresence = jest.fn()
            const client = createMockClient({
                user: { setPresence },
                guilds: { cache: { size: 5, values: () => [] } },
                commands: { size: 30 },
            } as any)

            setPresenceActivity(client, 0)

            expect(mockGetBotPresenceStatus).toHaveBeenCalled()
        })
    })

    describe('startPresenceRotation', () => {
        beforeEach(() => {
            jest.useFakeTimers()
        })

        afterEach(() => {
            jest.useRealTimers()
        })

        it('should return controls object', () => {
            const client = createMockClient({
                user: { setPresence: jest.fn() },
                guilds: { cache: { size: 5, values: () => [] } },
                commands: { size: 30 },
            } as any)

            const controls = startPresenceRotation(client)

            expect(controls).toHaveProperty('stop')
            expect(controls).toHaveProperty('pause')
            expect(controls).toHaveProperty('resume')
            expect(typeof controls.stop).toBe('function')
            expect(typeof controls.pause).toBe('function')
            expect(typeof controls.resume).toBe('function')

            controls.stop()
        })

        it('should set presence immediately', () => {
            const setPresence = jest.fn()
            const client = createMockClient({
                user: { setPresence },
                guilds: { cache: { size: 5, values: () => [] } },
                commands: { size: 30 },
            } as any)

            const controls = startPresenceRotation(client)

            expect(setPresence).toHaveBeenCalled()

            controls.stop()
        })

        it('should rotate presence on interval', () => {
            const setPresence = jest.fn()
            const client = createMockClient({
                user: { setPresence },
                guilds: { cache: { size: 5, values: () => [] } },
                commands: { size: 30 },
            } as any)

            const controls = startPresenceRotation(client)

            setPresence.mockClear()

            jest.advanceTimersByTime(PRESENCE_ROTATION_INTERVAL_MS)
            expect(setPresence).toHaveBeenCalledTimes(1)

            jest.advanceTimersByTime(PRESENCE_ROTATION_INTERVAL_MS)
            expect(setPresence).toHaveBeenCalledTimes(2)

            controls.stop()
        })

        it('should pause rotation', () => {
            const setPresence = jest.fn()
            const client = createMockClient({
                user: { setPresence },
                guilds: { cache: { size: 5, values: () => [] } },
                commands: { size: 30 },
            } as any)

            const controls = startPresenceRotation(client)
            setPresence.mockClear()

            controls.pause()

            jest.advanceTimersByTime(PRESENCE_ROTATION_INTERVAL_MS * 3)
            expect(setPresence).not.toHaveBeenCalled()

            controls.stop()
        })

        it('should resume rotation after pause', () => {
            const setPresence = jest.fn()
            const client = createMockClient({
                user: { setPresence },
                guilds: { cache: { size: 5, values: () => [] } },
                commands: { size: 30 },
            } as any)

            const controls = startPresenceRotation(client)
            setPresence.mockClear()

            controls.pause()
            jest.advanceTimersByTime(PRESENCE_ROTATION_INTERVAL_MS)
            expect(setPresence).not.toHaveBeenCalled()

            controls.resume()
            expect(setPresence).toHaveBeenCalledTimes(1)

            controls.stop()
        })

        it('should stop rotation', () => {
            const setPresence = jest.fn()
            const client = createMockClient({
                user: { setPresence },
                guilds: { cache: { size: 5, values: () => [] } },
                commands: { size: 30 },
            } as any)

            const controls = startPresenceRotation(client)
            setPresence.mockClear()

            controls.stop()

            jest.advanceTimersByTime(PRESENCE_ROTATION_INTERVAL_MS * 3)
            expect(setPresence).not.toHaveBeenCalled()
        })
    })
})
