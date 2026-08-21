import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const setExtractorDegradedMock = jest.fn()
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()

jest.mock('./extractorHealth', () => ({
    setExtractorDegraded: (...a: unknown[]) => setExtractorDegradedMock(...a),
    isExtractorDegraded: jest.fn(() => false),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...a: unknown[]) => errorLogMock(...a),
    infoLog: (...a: unknown[]) => infoLogMock(...a),
    warnLog: jest.fn(),
}))

jest.mock('discord-player-spotify', () => ({ SpotifyExtractor: class {} }))
jest.mock('@discord-player/extractor', () => ({
    SoundCloudExtractor: class {},
    AppleMusicExtractor: class {},
    VimeoExtractor: class {},
    AttachmentExtractor: class {},
}))
jest.mock('play-dl', () => ({
    getFreeClientID: jest.fn(),
    setToken: jest.fn(),
}))
jest.mock('discord-player', () => ({ Player: class {} }))
jest.mock('./streamBridge', () => ({
    createResilientStream: jest.fn(),
    streamViaYtDlp: jest.fn(),
    streamViaYtDlpSearch: jest.fn(),
}))
jest.mock('./soundcloudMatcher', () => ({
    streamViaSoundCloud: jest.fn(),
    findMatchingSoundCloudResult: jest.fn(),
    parseDurationString: jest.fn(),
}))

import { registerSpotifyExtractor } from './playerFactory'

const playerWith = (register: unknown) =>
    ({ extractors: { register } }) as never

describe('registerSpotifyExtractor health signal', () => {
    beforeEach(() => jest.clearAllMocks())

    it('clears the degraded flag on successful registration', async () => {
        await registerSpotifyExtractor(playerWith(async () => ({ id: 'x' })))

        expect(setExtractorDegradedMock).toHaveBeenCalledWith('spotify', false)
        expect(errorLogMock).not.toHaveBeenCalled()
    })

    it('flags degraded when registration resolves null', async () => {
        await registerSpotifyExtractor(playerWith(async () => null))

        expect(setExtractorDegradedMock).toHaveBeenCalledWith('spotify', true)
        // errorLog, not warnLog: only errorLog reaches Sentry (#2051).
        expect(errorLogMock).toHaveBeenCalled()
    })

    it('flags degraded and reports when registration throws', async () => {
        await registerSpotifyExtractor(
            playerWith(async () => {
                throw new Error('bad credentials')
            }),
        )

        expect(setExtractorDegradedMock).toHaveBeenCalledWith('spotify', true)
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.any(Error) }),
        )
    })

    it('never leaves the flag unset — every path reports health', async () => {
        for (const register of [
            async () => ({ id: 'x' }),
            async () => null,
            async () => {
                throw new Error('x')
            },
        ]) {
            setExtractorDegradedMock.mockClear()
            await registerSpotifyExtractor(playerWith(register))
            expect(setExtractorDegradedMock).toHaveBeenCalledTimes(1)
        }
    })
})
