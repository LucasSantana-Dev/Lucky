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
}))

jest.mock('discord-player-youtubei', () => ({
    YoutubeiExtractor: class MockYoutubeiExtractor {},
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    debugLog: jest.fn(),
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

    describe('YoutubeiExtractor registration', () => {
        it('registers YoutubeiExtractor with IOS client', async () => {
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

            const [, options] = player.extractors.register.mock.calls[0]
            expect(options.streamOptions.useClient).toBe('IOS')
            expect(options.streamOptions.highWaterMark).toBe(1 << 25)
            expect(options.generateWithPoToken).toBe(true)
        })

        it('does not set a custom createStream override', async () => {
            const { createPlayer } =
                await import('../../../src/handlers/player/playerFactory')

            const player = createPlayer({
                client: { user: { id: '123' } } as any,
            }) as unknown as { extractors: { register: jest.Mock } }

            for (let i = 0; i < 50; i++) {
                if (player.extractors.register.mock.calls.length > 0) break
                await new Promise((resolve) => setTimeout(resolve, 10))
            }

            const [, options] = player.extractors.register.mock.calls[0]
            expect(options.createStream).toBeUndefined()
        })
    })
})
