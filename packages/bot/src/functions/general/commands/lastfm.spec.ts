import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import lastfmCommand from './lastfm'

const interactionReplyMock = jest.fn()
const successEmbedMock = jest.fn((title: string, description: string) => ({
    type: 'success',
    title,
    description,
}))
const errorEmbedMock = jest.fn((title: string, description: string) => ({
    type: 'error',
    title,
    description,
}))
const isLastFmConfiguredMock = jest.fn()
const getByDiscordIdMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    successEmbed: (...args: unknown[]) => successEmbedMock(...args),
    errorEmbed: (...args: unknown[]) => errorEmbedMock(...args),
}))

jest.mock('../../../lastfm', () => ({
    isLastFmConfigured: (...args: unknown[]) => isLastFmConfiguredMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    lastFmLinkService: {
        getByDiscordId: (...args: unknown[]) => getByDiscordIdMock(...args),
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
    const description = String(successEmbedMock.mock.calls.at(-1)?.[1] ?? '')
    const match = description.match(/\[Click here to connect\]\(([^)]+)\)/)
    if (!match) {
        throw new Error(`Expected connect link in embed description: ${description}`)
    }
    return match[1]
}

describe('lastfm command link generation', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        isLastFmConfiguredMock.mockReturnValue(true)
        getByDiscordIdMock.mockResolvedValue(null)
        process.env.LASTFM_LINK_SECRET = 'test-secret'
        delete process.env.WEBAPP_BACKEND_URL
        delete process.env.WEBAPP_REDIRECT_URI
    })

    it('prefers WEBAPP_BACKEND_URL over stale WEBAPP_REDIRECT_URI host', async () => {
        process.env.WEBAPP_BACKEND_URL = 'https://lucky-api.lucassantana.tech/'
        process.env.WEBAPP_REDIRECT_URI =
            'https://nexus.lucassantana.tech/api/auth/callback'

        await lastfmCommand.execute({
            interaction: createInteraction('link'),
        } as any)

        const url = getConnectUrlFromEmbed()
        expect(url).toContain('https://lucky-api.lucassantana.tech/api/lastfm/connect')
        expect(url).not.toContain('nexus.lucassantana.tech')
    })

    it('normalizes trailing slash from WEBAPP_BACKEND_URL', async () => {
        process.env.WEBAPP_BACKEND_URL = 'https://lucky-api.lucassantana.tech/'

        await lastfmCommand.execute({
            interaction: createInteraction('link'),
        } as any)

        const url = getConnectUrlFromEmbed()
        expect(url).toContain('https://lucky-api.lucassantana.tech/api/lastfm/connect')
        expect(url).not.toContain('//api/lastfm/connect')
    })

    it('falls back to WEBAPP_REDIRECT_URI and normalizes /api/auth/callback', async () => {
        process.env.WEBAPP_REDIRECT_URI =
            'https://lucky.lucassantana.tech/api/auth/callback'

        await lastfmCommand.execute({
            interaction: createInteraction('link'),
        } as any)

        const url = getConnectUrlFromEmbed()
        expect(url).toContain('https://lucky.lucassantana.tech/api/lastfm/connect')
    })

    it('falls back to WEBAPP_REDIRECT_URI and normalizes legacy /auth/callback', async () => {
        process.env.WEBAPP_REDIRECT_URI =
            'https://lucky.lucassantana.tech/auth/callback'

        await lastfmCommand.execute({
            interaction: createInteraction('link'),
        } as any)

        const url = getConnectUrlFromEmbed()
        expect(url).toContain('https://lucky.lucassantana.tech/api/lastfm/connect')
    })

    it('returns configuration error when no valid base url is available', async () => {
        await lastfmCommand.execute({
            interaction: createInteraction('link'),
        } as any)

        expect(errorEmbedMock).toHaveBeenCalledWith(
            'Cannot generate link',
            expect.stringContaining('WEBAPP_BACKEND_URL'),
        )
    })

    it('returns configuration error when signing secret is missing', async () => {
        process.env.WEBAPP_BACKEND_URL = 'https://lucky-api.lucassantana.tech'
        delete process.env.LASTFM_LINK_SECRET
        delete process.env.WEBAPP_SESSION_SECRET

        await lastfmCommand.execute({
            interaction: createInteraction('link'),
        } as any)

        expect(errorEmbedMock).toHaveBeenCalledWith(
            'Cannot generate link',
            expect.stringContaining('WEBAPP_BACKEND_URL'),
        )
    })
})
