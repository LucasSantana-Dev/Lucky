import { jest, describe, it, expect, beforeEach } from '@jest/globals'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

import { setTrackStatus, clearStatus } from './VoiceChannelStatusService'

const makeQueue = (overrides: Record<string, unknown> = {}) => ({
    guild: { id: 'guild-1' },
    currentTrack: { title: 'My Song', author: 'Artist' },
    channel: {
        setStatus: jest.fn().mockResolvedValue(undefined as never),
    },
    ...overrides,
})

beforeEach(() => {
    debugLogMock.mockReset()
    errorLogMock.mockReset()
})

describe('VoiceChannelStatusService', () => {
    describe('setTrackStatus', () => {
        it('sets voice channel status with track info', async () => {
            const queue = makeQueue()
            await setTrackStatus(queue as never)

            expect(queue.channel.setStatus).toHaveBeenCalledWith(
                '🎵 My Song — Artist',
            )
        })

        it('handles null channel gracefully', async () => {
            const queue = makeQueue({ channel: null })
            await expect(setTrackStatus(queue as never)).resolves.not.toThrow()
        })

        it('handles channel without setStatus method', async () => {
            const queue = makeQueue({ channel: { noSetStatus: true } })
            await expect(setTrackStatus(queue as never)).resolves.not.toThrow()
        })

        it('handles missing currentTrack', async () => {
            const queue = makeQueue({ currentTrack: null })
            await setTrackStatus(queue as never)

            expect(queue.channel.setStatus).not.toHaveBeenCalled()
        })

        it('truncates status text to 500 characters', async () => {
            const longTitle = 'T'.repeat(300)
            const longAuthor = 'A'.repeat(300)
            const queue = makeQueue({
                currentTrack: { title: longTitle, author: longAuthor },
            })
            await setTrackStatus(queue as never)

            const call = (queue.channel.setStatus as ReturnType<typeof jest.fn>).mock.calls[0] as string[]
            const status = call[0]
            expect(status.length).toBeLessThanOrEqual(500)
            expect(status.endsWith('…')).toBe(true)
        })

        it('logs error and does not throw when setStatus rejects', async () => {
            const queue = makeQueue({
                channel: {
                    setStatus: jest.fn().mockRejectedValue(new Error('API error') as never),
                },
            })
            await expect(setTrackStatus(queue as never)).resolves.not.toThrow()
            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('clearStatus', () => {
        it('clears voice channel status', async () => {
            const queue = makeQueue()
            await clearStatus(queue as never)

            expect(queue.channel.setStatus).toHaveBeenCalledWith('')
        })

        it('handles null channel gracefully', async () => {
            const queue = makeQueue({ channel: null })
            await expect(clearStatus(queue as never)).resolves.not.toThrow()
        })

        it('logs error and does not throw when clearStatus rejects', async () => {
            const queue = makeQueue({
                channel: {
                    setStatus: jest.fn().mockRejectedValue(new Error('fail') as never),
                },
            })
            await expect(clearStatus(queue as never)).resolves.not.toThrow()
            expect(errorLogMock).toHaveBeenCalled()
        })
    })
})
