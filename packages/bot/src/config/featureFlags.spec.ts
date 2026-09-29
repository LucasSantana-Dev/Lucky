import {
    beforeEach,
    afterEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

import {
    isHostedYoutubeEnabled,
    __resetHostedYoutubeWarnStateForTests,
} from './featureFlags'

describe('isHostedYoutubeEnabled', () => {
    const originalEnv = process.env.HOSTED_YOUTUBE_ENABLED

    beforeEach(() => {
        warnLogMock.mockClear()
        __resetHostedYoutubeWarnStateForTests()
    })

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.HOSTED_YOUTUBE_ENABLED
        } else {
            process.env.HOSTED_YOUTUBE_ENABLED = originalEnv
        }
    })

    it('defaults to enabled when unset', () => {
        delete process.env.HOSTED_YOUTUBE_ENABLED
        expect(isHostedYoutubeEnabled()).toBe(true)
        expect(warnLogMock).not.toHaveBeenCalled()
    })

    it.each(['true', '1'])('is enabled for recognized value %p', (value) => {
        process.env.HOSTED_YOUTUBE_ENABLED = value
        expect(isHostedYoutubeEnabled()).toBe(true)
        expect(warnLogMock).not.toHaveBeenCalled()
    })

    it.each(['false', 'FALSE', 'False', ' false ', '0'])(
        'is disabled for %p',
        (value) => {
            process.env.HOSTED_YOUTUBE_ENABLED = value
            expect(isHostedYoutubeEnabled()).toBe(false)
            expect(warnLogMock).not.toHaveBeenCalled()
        },
    )

    it('treats an unrecognized value as enabled and warns once', () => {
        process.env.HOSTED_YOUTUBE_ENABLED = 'nope'
        expect(isHostedYoutubeEnabled()).toBe(true)
        expect(isHostedYoutubeEnabled()).toBe(true)
        expect(warnLogMock).toHaveBeenCalledTimes(1)
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('unrecognized value'),
                data: { value: 'nope' },
            }),
        )
    })
})
