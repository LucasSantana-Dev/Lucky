jest.mock('discord-player', () => {
    const loadMulti = jest.fn().mockResolvedValue(undefined)
    const register = jest.fn().mockResolvedValue(undefined)
    const MockPlayer = jest.fn().mockImplementation(function (this: any) {
        this.extractors = { loadMulti, register }
        this.setMaxListeners = jest.fn()
        this.events = {
            on: jest.fn(),
            removeAllListeners: jest.fn(),
        }
    })
    return { Player: MockPlayer }
})

jest.mock('@discord-player/extractor', () => ({
    DefaultExtractors: [],
    SpotifyExtractor: class MockSpotifyExtractor {},
    SoundCloudExtractor: class MockSoundCloudExtractor {},
    AppleMusicExtractor: class MockAppleMusicExtractor {},
    VimeoExtractor: class MockVimeoExtractor {},
    AttachmentExtractor: class MockAttachmentExtractor {},
}))

jest.mock('discord-player-youtubei', () => ({
    YoutubeExtractor: class MockYoutubeExtractor {},
}))

jest.mock('play-dl', () => ({
    getFreeClientID: jest.fn().mockResolvedValue('mock-client-id'),
    setToken: jest.fn().mockResolvedValue(undefined),
    search: jest.fn().mockResolvedValue([]),
    stream: jest.fn().mockResolvedValue({ stream: null }),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    debugLog: jest.fn(),
}))

jest.mock('../../../src/utils/music/search/providerHealth', () => ({
    providerHealthService: {
        isAvailable: jest.fn(() => true),
    },
}))

describe('playerFactory', () => {
    beforeEach(() => {
        jest.resetModules()
    })

    describe('module exports', () => {
        it('exports createPlayer function', async () => {
            const mod =
                await import('../../../src/handlers/player/playerFactory')
            expect(mod.createPlayer).toBeDefined()
        })
    })

    describe('createPlayer', () => {
        it('creates a Player instance', async () => {
            const { Player } = await import('discord-player')
            const { createPlayer } =
                await import('../../../src/handlers/player/playerFactory')
            const mockClient = { user: { id: '123' } } as any

            const player = createPlayer({ client: mockClient })
            expect(player).toBeDefined()
            expect(Player).toHaveBeenCalledWith(mockClient)
        })
    })

    describe('YoutubeExtractor registration', () => {
        it('registers YoutubeExtractor with createStream bridge', async () => {
            const { createPlayer } =
                await import('../../../src/handlers/player/playerFactory')

            const player = createPlayer({
                client: { user: { id: '123' } } as any,
            }) as unknown as { extractors: { register: jest.Mock } }

            for (let i = 0; i < 50; i++) {
                const hasYoutube = player.extractors.register.mock.calls.some(
                    ([, opts]: [unknown, Record<string, unknown>]) =>
                        typeof opts?.createStream === 'function',
                )
                if (hasYoutube) break
                await new Promise((resolve) => setTimeout(resolve, 10))
            }

            expect(player.extractors.register).toHaveBeenCalled()

            const youtubeCall = player.extractors.register.mock.calls.find(
                ([, opts]: [unknown, Record<string, unknown>]) =>
                    typeof opts?.createStream === 'function',
            )
            expect(youtubeCall).toBeDefined()
            const [, options] = youtubeCall!
            expect(typeof options.createStream).toBe('function')
            // v3 API: streamOptions/generateWithPoToken removed
            expect(options.streamOptions).toBeUndefined()
            expect(options.generateWithPoToken).toBeUndefined()
        })

        it('sets a createStream override to route audio via SoundCloud', async () => {
            const { createPlayer } =
                await import('../../../src/handlers/player/playerFactory')

            const player = createPlayer({
                client: { user: { id: '123' } } as any,
            }) as unknown as { extractors: { register: jest.Mock } }

            for (let i = 0; i < 50; i++) {
                const hasYoutube = player.extractors.register.mock.calls.some(
                    ([, opts]: [unknown, Record<string, unknown>]) =>
                        typeof opts?.createStream === 'function',
                )
                if (hasYoutube) break
                await new Promise((resolve) => setTimeout(resolve, 10))
            }

            const youtubeCall = player.extractors.register.mock.calls.find(
                ([, opts]: [unknown, Record<string, unknown>]) =>
                    typeof opts?.createStream === 'function',
            )
            expect(youtubeCall).toBeDefined()
            const [, options] = youtubeCall!
            expect(typeof options.createStream).toBe('function')
        })

        it('falls back to YoutubeiExtractor when YoutubeExtractor is absent (v2 compat)', async () => {
            jest.resetModules()
            jest.doMock('discord-player-youtubei', () => ({
                YoutubeiExtractor: class MockYoutubeiExtractorV2 {},
            }))

            const { createPlayer } =
                await import('../../../src/handlers/player/playerFactory')
            const player = createPlayer({
                client: { user: { id: '123' } } as any,
            }) as unknown as { extractors: { register: jest.Mock } }

            for (let i = 0; i < 50; i++) {
                if (player.extractors.register.mock.calls.length > 0) break
                await new Promise((resolve) => setTimeout(resolve, 10))
            }

            expect(player.extractors.register).toHaveBeenCalled()
        })

        it('logs warn and skips registration when no extractor export is found', async () => {
            jest.resetModules()
            jest.doMock('discord-player-youtubei', () => ({}))
            jest.doMock('@lucky/shared/utils', () => ({
                errorLog: jest.fn(),
                infoLog: jest.fn(),
                warnLog: jest.fn(),
                debugLog: jest.fn(),
            }))

            const { createPlayer } =
                await import('../../../src/handlers/player/playerFactory')
            const { warnLog } = await import('@lucky/shared/utils')

            const player = createPlayer({
                client: { user: { id: '123' } } as any,
            }) as unknown as { extractors: { register: jest.Mock } }

            await new Promise((resolve) => setTimeout(resolve, 200))

            expect(
                (warnLog as jest.Mock).mock.calls.some((call) =>
                    (call[0]?.message as string)?.includes(
                        'no extractor export found',
                    ),
                ),
            ).toBe(true)
            // YouTube extractor specifically should NOT have been registered
            // (identified by the createStream option it carries)
            const youtubeCall = player.extractors.register.mock.calls.find(
                ([, opts]: [unknown, Record<string, unknown>]) =>
                    typeof opts?.createStream === 'function',
            )
            expect(youtubeCall).toBeUndefined()
        })
    })
})
