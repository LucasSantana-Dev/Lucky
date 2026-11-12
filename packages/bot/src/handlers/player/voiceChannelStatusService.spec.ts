import { jest, describe, it, expect, beforeEach } from '@jest/globals'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

import {
    setTrackStatus,
    clearStatus,
    resetWarnedGuilds,
} from './voiceChannelStatusService'

type PutMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>

const makeChannel = (
    opts: { hasPermission?: boolean; put?: PutMock; me?: unknown } = {},
) => {
    const has = jest.fn().mockReturnValue(opts.hasPermission ?? true)
    const put: PutMock =
        opts.put ?? jest.fn<(...args: unknown[]) => Promise<unknown>>()
    if (!opts.put) put.mockResolvedValue(undefined)
    return {
        id: 'channel-1',
        guild: {
            members: { me: 'me' in opts ? opts.me : { id: 'bot' } },
        },
        permissionsFor: jest.fn().mockReturnValue({ has }),
        client: { rest: { put } },
    }
}

const makeQueue = (overrides: Record<string, unknown> = {}) => ({
    guild: { id: 'guild-1' },
    currentTrack: { title: 'My Song', author: 'Artist' },
    channel: makeChannel(),
    ...overrides,
})

const putOf = (queue: ReturnType<typeof makeQueue>) =>
    (queue.channel as ReturnType<typeof makeChannel>).client.rest.put

beforeEach(() => {
    debugLogMock.mockReset()
    errorLogMock.mockReset()
    warnLogMock.mockReset()
    resetWarnedGuilds()
})

describe('VoiceChannelStatusService', () => {
    describe('setTrackStatus', () => {
        it('PUTs the track to the voice-status REST route', async () => {
            const queue = makeQueue()
            await setTrackStatus(queue as never)

            expect(putOf(queue)).toHaveBeenCalledWith(
                '/channels/channel-1/voice-status',
                { body: { status: '▶ My Song - Artist' } },
            )
            expect(errorLogMock).not.toHaveBeenCalled()
        })

        it('omits the separator when the track has no author', async () => {
            const queue = makeQueue({
                currentTrack: { title: 'My Song', author: '' },
            })
            await setTrackStatus(queue as never)

            expect(putOf(queue)).toHaveBeenCalledWith(
                '/channels/channel-1/voice-status',
                { body: { status: '▶ My Song' } },
            )
        })

        it('does nothing without a voice channel', async () => {
            const queue = makeQueue({ channel: null })
            await expect(
                setTrackStatus(queue as never),
            ).resolves.toBeUndefined()
        })

        it('does nothing without a current track', async () => {
            const queue = makeQueue({ currentTrack: null })
            await setTrackStatus(queue as never)

            expect(putOf(queue)).not.toHaveBeenCalled()
        })

        it('truncates the status to 500 characters', async () => {
            const queue = makeQueue({
                currentTrack: {
                    title: 'T'.repeat(300),
                    author: 'A'.repeat(300),
                },
            })
            await setTrackStatus(queue as never)

            const [, options] = putOf(queue).mock.calls[0] as [
                string,
                { body: { status: string } },
            ]
            expect(options.body.status).toHaveLength(500)
            expect(options.body.status.endsWith('…')).toBe(true)
        })

        it('warns once per guild and skips the call when the permission is missing', async () => {
            const queue = makeQueue({
                channel: makeChannel({ hasPermission: false }),
            })
            await setTrackStatus(queue as never)
            await setTrackStatus(queue as never)
            await clearStatus(queue as never)

            expect(putOf(queue)).not.toHaveBeenCalled()
            expect(warnLogMock).toHaveBeenCalledTimes(1)
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Set Voice Channel Status',
                    ),
                    data: { guildId: 'guild-1', channelId: 'channel-1' },
                }),
            )
            expect(errorLogMock).not.toHaveBeenCalled()
        })

        it('warns separately for each guild missing the permission', async () => {
            const a = makeQueue({
                channel: makeChannel({ hasPermission: false }),
            })
            const b = makeQueue({
                guild: { id: 'guild-2' },
                channel: makeChannel({ hasPermission: false }),
            })
            await setTrackStatus(a as never)
            await setTrackStatus(b as never)

            expect(warnLogMock).toHaveBeenCalledTimes(2)
        })

        it('treats a 50013 API error as a missing permission, warning once', async () => {
            const put = jest.fn<(...args: unknown[]) => Promise<unknown>>()
            put.mockRejectedValue(
                Object.assign(new Error('Missing Permissions'), {
                    code: 50013,
                }),
            )
            const queue = makeQueue({ channel: makeChannel({ put }) })
            await setTrackStatus(queue as never)
            await setTrackStatus(queue as never)

            expect(put).toHaveBeenCalledTimes(2)
            expect(warnLogMock).toHaveBeenCalledTimes(1)
            expect(errorLogMock).not.toHaveBeenCalled()
        })

        it('lets the API decide when the bot member is not cached', async () => {
            const queue = makeQueue({ channel: makeChannel({ me: null }) })
            await setTrackStatus(queue as never)

            expect(putOf(queue)).toHaveBeenCalled()
        })

        it('logs other API errors without throwing', async () => {
            const put = jest.fn<(...args: unknown[]) => Promise<unknown>>()
            put.mockRejectedValue(new Error('API error'))
            const queue = makeQueue({ channel: makeChannel({ put }) })

            await expect(
                setTrackStatus(queue as never),
            ).resolves.toBeUndefined()
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to set voice channel status',
                }),
            )
            expect(warnLogMock).not.toHaveBeenCalled()
        })
    })

    describe('clearStatus', () => {
        it('PUTs an empty status', async () => {
            const queue = makeQueue()
            await clearStatus(queue as never)

            expect(putOf(queue)).toHaveBeenCalledWith(
                '/channels/channel-1/voice-status',
                { body: { status: '' } },
            )
        })

        it('clears even when no track is playing', async () => {
            const queue = makeQueue({ currentTrack: null })
            await clearStatus(queue as never)

            expect(putOf(queue)).toHaveBeenCalledTimes(1)
        })

        it('does nothing without a voice channel', async () => {
            const queue = makeQueue({ channel: null })
            await expect(clearStatus(queue as never)).resolves.toBeUndefined()
        })

        it('logs API errors without throwing', async () => {
            const put = jest.fn<(...args: unknown[]) => Promise<unknown>>()
            put.mockRejectedValue(new Error('fail'))
            const queue = makeQueue({ channel: makeChannel({ put }) })

            await expect(clearStatus(queue as never)).resolves.toBeUndefined()
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to clear voice channel status',
                }),
            )
        })
    })
})
