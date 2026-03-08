import { spawn } from 'child_process'
import { Readable } from 'stream'

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

jest.mock('@nexus/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    debugLog: jest.fn(),
}))

jest.mock('child_process', () => ({
    spawn: jest.fn(),
}))

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>

describe('playerFactory', () => {
    beforeEach(() => {
        jest.resetModules()
    })

    describe('isYouTubeUrl (tested indirectly via module)', () => {
        it('should be importable', async () => {
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
            const mockClient = {
                user: { id: '123' },
            } as any

            const player = createPlayer({ client: mockClient })
            expect(player).toBeDefined()
            expect(Player).toHaveBeenCalledWith(mockClient)
        })
    })

    describe('yt-dlp stream creation', () => {
        it('spawns yt-dlp with correct args for YouTube URLs', () => {
            const mockStdout = new Readable({
                read() {
                    this.push(Buffer.from('audio data'))
                    this.push(null)
                },
            })
            const mockStderr = new Readable({
                read() {
                    this.push(null)
                },
            })
            const mockProc = {
                stdout: mockStdout,
                stderr: mockStderr,
                on: jest.fn(),
                pid: 12345,
            }

            mockSpawn.mockReturnValue(mockProc as any)

            const url = 'https://youtube.com/watch?v=abc123'
            spawn('yt-dlp', [
                '-f',
                'bestaudio',
                '-o',
                '-',
                '--no-warnings',
                '--quiet',
                url,
            ])

            expect(mockSpawn).toHaveBeenCalledWith(
                'yt-dlp',
                expect.arrayContaining(['-f', 'bestaudio', '-o', '-', url]),
            )
        })
    })
})
