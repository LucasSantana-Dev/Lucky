import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { ActivityType } from 'discord.js'

const debugLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

import {
    initMusicPresence,
    setNowPlaying,
    clearMusicPresence,
} from './MusicPresenceService'

const makeClient = () => ({
    user: { setPresence: jest.fn() },
})

beforeEach(() => {
    debugLogMock.mockReset()
    jest.resetModules()
})

describe('MusicPresenceService', () => {
    describe('setNowPlaying', () => {
        it('sets Listening presence with track title and author', () => {
            const client = makeClient()
            const pause = jest.fn()
            const resume = jest.fn()
            initMusicPresence(client as never, pause, resume)

            setNowPlaying('guild-1', { title: 'Song', author: 'Artist' } as never)

            expect(pause).toHaveBeenCalledTimes(1)
            expect(client.user.setPresence).toHaveBeenCalledWith({
                status: 'online',
                activities: [
                    { type: ActivityType.Listening, name: 'Song — Artist' },
                ],
            })
        })

        it('truncates track name to 128 characters', () => {
            const client = makeClient()
            const pause = jest.fn()
            const resume = jest.fn()
            initMusicPresence(client as never, pause, resume)

            const longTitle = 'T'.repeat(100)
            const longAuthor = 'A'.repeat(100)
            setNowPlaying('guild-1', { title: longTitle, author: longAuthor } as never)

            const call = client.user.setPresence.mock.calls[0] as Array<{ activities: Array<{ name: string }> }>
            const name: string = call[0].activities[0].name
            expect(name.length).toBeLessThanOrEqual(128)
            expect(name.endsWith('…')).toBe(true)
        })

        it('does nothing when client is not initialised', () => {
            // Reset module-level state by calling initMusicPresence with null-ish client
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            initMusicPresence(null as any, jest.fn(), jest.fn())

            // Should not throw
            expect(() =>
                setNowPlaying('guild-x', { title: 'X', author: 'Y' } as never),
            ).not.toThrow()
        })
    })

    describe('clearMusicPresence', () => {
        it('resumes rotation when last guild clears', () => {
            const client = makeClient()
            const pause = jest.fn()
            const resume = jest.fn()
            initMusicPresence(client as never, pause, resume)

            setNowPlaying('guild-1', { title: 'A', author: 'B' } as never)
            pause.mockClear()

            clearMusicPresence('guild-1')

            expect(resume).toHaveBeenCalledTimes(1)
        })

        it('does not resume when other guilds are still active', () => {
            const client = makeClient()
            const pause = jest.fn()
            const resume = jest.fn()
            initMusicPresence(client as never, pause, resume)

            setNowPlaying('guild-1', { title: 'A', author: 'B' } as never)
            setNowPlaying('guild-2', { title: 'C', author: 'D' } as never)
            resume.mockClear()

            clearMusicPresence('guild-1')

            expect(resume).not.toHaveBeenCalled()
        })

        it('resumes after all guilds clear', () => {
            const client = makeClient()
            const pause = jest.fn()
            const resume = jest.fn()
            initMusicPresence(client as never, pause, resume)

            setNowPlaying('guild-1', { title: 'A', author: 'B' } as never)
            setNowPlaying('guild-2', { title: 'C', author: 'D' } as never)
            resume.mockClear()

            clearMusicPresence('guild-1')
            expect(resume).not.toHaveBeenCalled()

            clearMusicPresence('guild-2')
            expect(resume).toHaveBeenCalledTimes(1)
        })
    })
})
