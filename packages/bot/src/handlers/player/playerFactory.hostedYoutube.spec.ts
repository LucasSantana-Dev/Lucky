import {
    describe,
    it,
    expect,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'

// #2475: HOSTED_YOUTUBE_ENABLED kill switch. Verifies registerExtractorsInOrder
// skips the YouTube extractor entirely when disabled (default bot state), and
// still registers it when enabled (self-hosters / current hosted behavior).
const registerMock = jest.fn()
const infoLogMock = jest.fn()
const warnLogMock = jest.fn()
const errorLogMock = jest.fn()
const setExtractorDegradedMock = jest.fn()
const refreshSoundCloudClientIdMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('./extractorHealth', () => ({
    setExtractorDegraded: (...args: unknown[]) =>
        setExtractorDegradedMock(...args),
}))

jest.mock('./soundcloudMatcher', () => ({
    refreshSoundCloudClientId: () => refreshSoundCloudClientIdMock(),
}))

jest.mock('./resilientStreamBridge', () => ({
    createResilientStream: jest.fn(),
}))

class FakeSpotifyExtractor {}
jest.mock('discord-player-spotify', () => ({
    SpotifyExtractor: FakeSpotifyExtractor,
}))

class FakeSoundCloudExtractor {}
class FakeAppleMusicExtractor {}
class FakeVimeoExtractor {}
class FakeAttachmentExtractor {}
jest.mock('@discord-player/extractor', () => ({
    SoundCloudExtractor: FakeSoundCloudExtractor,
    AppleMusicExtractor: FakeAppleMusicExtractor,
    VimeoExtractor: FakeVimeoExtractor,
    AttachmentExtractor: FakeAttachmentExtractor,
}))

class FakeYoutubeExtractor {}
jest.mock('discord-player-youtubei', () => ({
    YoutubeExtractor: FakeYoutubeExtractor,
}))

import { registerExtractorsInOrder } from './playerFactory'

function makeMockPlayer() {
    return {
        extractors: { register: registerMock },
    } as never
}

describe('registerExtractorsInOrder — HOSTED_YOUTUBE_ENABLED', () => {
    const originalEnv = process.env.HOSTED_YOUTUBE_ENABLED

    beforeEach(() => {
        jest.clearAllMocks()
        registerMock.mockResolvedValue(true)
        refreshSoundCloudClientIdMock.mockResolvedValue(undefined)
    })

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.HOSTED_YOUTUBE_ENABLED
        } else {
            process.env.HOSTED_YOUTUBE_ENABLED = originalEnv
        }
    })

    it('does not register the YouTube extractor when the flag is off', async () => {
        process.env.HOSTED_YOUTUBE_ENABLED = 'false'

        await registerExtractorsInOrder(makeMockPlayer())

        const registeredCtors = registerMock.mock.calls.map((call) => call[0])
        expect(registeredCtors).not.toContain(FakeYoutubeExtractor)
        // Everything else still registers — flag is YouTube-only.
        expect(registeredCtors).toContain(FakeSpotifyExtractor)
        expect(registeredCtors).toContain(FakeSoundCloudExtractor)
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining(
                    'HOSTED_YOUTUBE_ENABLED=false',
                ),
            }),
        )
    })

    it('registers the YouTube extractor when the flag is on (default/unset)', async () => {
        delete process.env.HOSTED_YOUTUBE_ENABLED

        await registerExtractorsInOrder(makeMockPlayer())

        const registeredCtors = registerMock.mock.calls.map((call) => call[0])
        expect(registeredCtors).toContain(FakeYoutubeExtractor)
    })

    it('registers the YouTube extractor when the flag is explicitly "true"', async () => {
        process.env.HOSTED_YOUTUBE_ENABLED = 'true'

        await registerExtractorsInOrder(makeMockPlayer())

        const registeredCtors = registerMock.mock.calls.map((call) => call[0])
        expect(registeredCtors).toContain(FakeYoutubeExtractor)
    })
})
