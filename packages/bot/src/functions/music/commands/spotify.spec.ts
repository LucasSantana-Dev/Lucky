import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import spotifyCommand from './spotify'

const interactionReplyMock = jest.fn()
const createErrorEmbedMock = jest.fn((title: string, description: string) => ({
    type: 'error',
    title,
    description,
}))
const buildPlatformAttribEmbedMock = jest.fn((platform: string, body: unknown) => ({
    type: 'platform',
    platform,
    ...body,
}))
const isSpotifyConfiguredMock = jest.fn()
const getByDiscordIdMock = jest.fn()
const unlinkMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildPlatformAttribEmbed: (...args: unknown[]) => buildPlatformAttribEmbedMock(...args),
}))

jest.mock('../../../spotify', () => ({
    isSpotifyConfigured: (...args: unknown[]) => isSpotifyConfiguredMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: {
        getByDiscordId: (...args: unknown[]) => getByDiscordIdMock(...args),
        unlink: (...args: unknown[]) => unlinkMock(...args),
    },
}))

function createInteraction(subcommand = 'link') {
    return {
        user: { id: '123' },
        options: {
            getSubcommand: jest.fn(() => subcommand),
        },
    } as any
}

function getConnectUrlFromEmbed(): string {
    const lastCall = buildPlatformAttribEmbedMock.mock.calls.at(-1)
    if (!lastCall) {
        throw new Error('buildPlatformAttribEmbed was not called')
    }
    const [platform, body] = lastCall
    const description = String((body as any)?.description ?? '')
    const match = description.match(/\[Click here to connect\]\(([^)]+)\)/)
    if (!match) {
        throw new Error(`Expected connect link in embed description: ${description}`)
    }
    return match[1]
}

describe('spotify command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        isSpotifyConfiguredMock.mockReturnValue(true)
        getByDiscordIdMock.mockResolvedValue(null)
        process.env.SPOTIFY_LINK_SECRET = 'test-secret'
        delete process.env.WEBAPP_BACKEND_URL
        delete process.env.WEBAPP_REDIRECT_URI
    })

    describe('link subcommand', () => {
        it('generates connect link with WEBAPP_BACKEND_URL', async () => {
            process.env.WEBAPP_BACKEND_URL = 'https://api.lucassantana.tech/'

            await spotifyCommand.execute({
                interaction: createInteraction('link'),
            } as any)

            const url = getConnectUrlFromEmbed()
            expect(url).toContain('https://api.lucassantana.tech/api/spotify/connect')
        })

        it('shows error when not configured', async () => {
            isSpotifyConfiguredMock.mockReturnValue(false)

            await spotifyCommand.execute({
                interaction: createInteraction('link'),
            } as any)

            const callArgs = interactionReplyMock.mock.calls[0][0]
            expect(callArgs.content.embeds[0].type).toBe('error')
            expect(callArgs.content.embeds[0].title).toContain('not configured')
        })

        it('shows error when cannot generate link', async () => {
            delete process.env.WEBAPP_BACKEND_URL
            delete process.env.WEBAPP_REDIRECT_URI

            await spotifyCommand.execute({
                interaction: createInteraction('link'),
            } as any)

            const callArgs = interactionReplyMock.mock.calls[0][0]
            expect(callArgs.content.embeds[0].type).toBe('error')
        })
    })

    describe('unlink subcommand', () => {
        it('unlinks account when linked', async () => {
            getByDiscordIdMock.mockResolvedValue({
                spotifyId: 'spotify-123',
                accessToken: 'token',
                refreshToken: 'refresh',
                tokenExpiresAt: new Date(),
                spotifyUsername: 'test-user',
            })
            unlinkMock.mockResolvedValue(true)

            await spotifyCommand.execute({
                interaction: createInteraction('unlink'),
            } as any)

            expect(unlinkMock).toHaveBeenCalledWith('123')
            const callArgs = interactionReplyMock.mock.calls[0][0]
            expect(callArgs.content.embeds[0].title).toContain('Disconnected')
        })

        it('shows error when not linked', async () => {
            getByDiscordIdMock.mockResolvedValue(null)

            await spotifyCommand.execute({
                interaction: createInteraction('unlink'),
            } as any)

            const callArgs = interactionReplyMock.mock.calls[0][0]
            expect(callArgs.content.embeds[0].type).toBe('error')
            expect(callArgs.content.embeds[0].title).toContain('not linked')
        })

        it('shows error when unlink fails', async () => {
            getByDiscordIdMock.mockResolvedValue({
                spotifyId: 'spotify-123',
                accessToken: 'token',
                refreshToken: 'refresh',
                tokenExpiresAt: new Date(),
                spotifyUsername: 'test-user',
            })
            unlinkMock.mockResolvedValue(false)

            await spotifyCommand.execute({
                interaction: createInteraction('unlink'),
            } as any)

            const callArgs = interactionReplyMock.mock.calls[0][0]
            expect(callArgs.content.embeds[0].type).toBe('error')
            expect(callArgs.content.embeds[0].title).toContain('Error')
        })
    })

    describe('status subcommand', () => {
        it('shows linked status with username', async () => {
            getByDiscordIdMock.mockResolvedValue({
                spotifyId: 'spotify-123',
                accessToken: 'token',
                refreshToken: 'refresh',
                tokenExpiresAt: new Date(),
                spotifyUsername: 'test-user',
            })

            await spotifyCommand.execute({
                interaction: createInteraction('status'),
            } as any)

            const callArgs = interactionReplyMock.mock.calls[0][0]
            expect(callArgs.content.embeds[0].title).toContain('linked')
            expect(callArgs.content.embeds[0].description).toContain('test-user')
        })

        it('shows not linked when no link exists', async () => {
            getByDiscordIdMock.mockResolvedValue(null)

            await spotifyCommand.execute({
                interaction: createInteraction('status'),
            } as any)

            const callArgs = interactionReplyMock.mock.calls[0][0]
            expect(callArgs.content.embeds[0].type).toBe('error')
            expect(callArgs.content.embeds[0].title).toContain('not linked')
        })
    })
})
