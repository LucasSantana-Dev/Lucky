import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

const getTopTracks = jest.fn() as jest.MockedFunction<
    (guildId: string, limit: number) => Promise<unknown>
>
const getTopArtists = jest.fn() as jest.MockedFunction<
    (guildId: string, limit: number) => Promise<unknown>
>
jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTopTracks,
        getTopArtists,
    },
}))

const interactionReply = jest.fn() as jest.MockedFunction<
    (args: { interaction: unknown; content: unknown }) => Promise<void>
>
jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply,
}))

import leaderboardCommand from './leaderboard.js'

function makeInteraction(
    subcommand: string,
    limit?: number,
    withGuild = true,
) {
    return {
        guild: withGuild ? { id: 'guild-1', name: 'TestGuild' } : null,
        user: { id: 'u1', tag: 'alice#0' },
        options: {
            getSubcommand: () => subcommand,
            getInteger: () => limit ?? null,
        },
    }
}

beforeEach(() => {
    getTopTracks.mockReset()
    getTopArtists.mockReset()
    interactionReply.mockClear().mockResolvedValue(undefined)
})

describe('/leaderboard', () => {
    test('rejects when not in a guild', async () => {
        await leaderboardCommand.execute({
            interaction: makeInteraction('tracks', undefined, false) as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('server')
    })

    test('shows empty-state message when tracks list is empty', async () => {
        getTopTracks.mockResolvedValue([])
        await leaderboardCommand.execute({
            interaction: makeInteraction('tracks') as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content?: string; embeds?: unknown[] }
        }
        expect(args.content.content).toContain('No track history')
        expect(args.content.embeds).toBeUndefined()
    })

    test('shows top tracks embed with medals for top 3', async () => {
        getTopTracks.mockResolvedValue([
            { trackId: 't1', title: 'Song One', plays: 12 },
            { trackId: 't2', title: 'Song Two', plays: 8 },
            { trackId: 't3', title: 'Song Three', plays: 3 },
        ])
        await leaderboardCommand.execute({
            interaction: makeInteraction('tracks') as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ title: string; description: string }> }
        }
        const embed = args.content.embeds[0]
        expect(embed.title).toContain('Top Tracks')
        expect(embed.description).toContain('🥇')
        expect(embed.description).toContain('🥈')
        expect(embed.description).toContain('🥉')
        expect(embed.description).toContain('Song One')
        expect(embed.description).toContain('12 plays')
        expect(embed.description).toContain('Song Two')
    })

    test('shows top artists embed', async () => {
        getTopArtists.mockResolvedValue([
            { artist: 'Artist One', plays: 20 },
        ])
        await leaderboardCommand.execute({
            interaction: makeInteraction('artists') as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ title: string; description: string }> }
        }
        expect(args.content.embeds[0].title).toContain('Top Artists')
        expect(args.content.embeds[0].description).toContain('Artist One')
        expect(args.content.embeds[0].description).toContain('20 plays')
    })

    test('clamps limit to MAX_LIMIT=10', async () => {
        getTopTracks.mockResolvedValue([])
        await leaderboardCommand.execute({
            interaction: makeInteraction('tracks', 999) as never,
        })
        expect(getTopTracks).toHaveBeenCalledWith('guild-1', 10)
    })

    test('handles getTopTracks throwing gracefully', async () => {
        getTopTracks.mockRejectedValueOnce(new Error('db down'))
        await leaderboardCommand.execute({
            interaction: makeInteraction('tracks') as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('Failed')
    })

    test('handles singular play count correctly', async () => {
        getTopTracks.mockResolvedValue([
            { trackId: 't1', title: 'Single', plays: 1 },
        ])
        await leaderboardCommand.execute({
            interaction: makeInteraction('tracks') as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ description: string }> }
        }
        expect(args.content.embeds[0].description).toContain('1 play')
        expect(args.content.embeds[0].description).not.toContain('1 plays')
    })
})
