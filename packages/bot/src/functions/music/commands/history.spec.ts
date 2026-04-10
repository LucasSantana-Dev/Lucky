import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireGuildMock = jest.fn()
const getTrackHistoryMock = jest.fn()
const musicEmbedMock = jest.fn()
const createErrorEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const createWarningEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    musicEmbed: (...args: unknown[]) =>
        musicEmbedMock(...args) ?? {
            setFooter: jest.fn().mockReturnThis(),
        },
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createWarningEmbed: (...args: unknown[]) => createWarningEmbedMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTrackHistory: (...args: unknown[]) => getTrackHistoryMock(...args),
    },
}))

import historyCommand from './history'

const fakeEmbed = { setFooter: jest.fn().mockReturnThis() }

function makeEntry(i: number, isAutoplay = false) {
    return {
        trackId: `id-${i}`,
        title: `Track ${i}`,
        author: `Artist ${i}`,
        duration: '3:30',
        url: `https://youtube.com/watch?v=${i}`,
        timestamp: 1700000000000 + i * 1000,
        guildId: 'guild-1',
        isAutoplay,
    }
}

function makeInteraction(overrides: Record<string, unknown> = {}) {
    return {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        options: {
            getInteger: jest.fn().mockReturnValue(null),
        },
        ...overrides,
    } as unknown as Parameters<typeof historyCommand.execute>[0]['interaction']
}

describe('history command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        musicEmbedMock.mockReturnValue(fakeEmbed)
        fakeEmbed.setFooter.mockReturnValue(fakeEmbed)
        createErrorEmbedMock.mockImplementation((title: string, desc?: string) => ({ title, description: desc }))
        createWarningEmbedMock.mockImplementation((title: string, desc?: string) => ({ title, description: desc }))
    })

    it('has correct name and category', () => {
        expect(historyCommand.data.name).toBe('history')
        expect(historyCommand.category).toBe('music')
    })

    it('returns early when requireGuild fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const interaction = makeInteraction()
        await historyCommand.execute({ interaction } as never)
        expect(interaction.deferReply).not.toHaveBeenCalled()
    })

    it('shows warning embed when history is empty', async () => {
        getTrackHistoryMock.mockResolvedValue([])
        const interaction = makeInteraction()
        await historyCommand.execute({ interaction } as never)
        expect(createWarningEmbedMock).toHaveBeenCalledWith('No history', expect.stringContaining('No tracks'))
        expect(interaction.editReply).toHaveBeenCalledWith({ embeds: [expect.objectContaining({ title: 'No history' })] })
    })

    it('shows page 1 of history', async () => {
        const entries = Array.from({ length: 5 }, (_, i) => makeEntry(i + 1))
        getTrackHistoryMock.mockResolvedValue(entries)
        const interaction = makeInteraction()
        await historyCommand.execute({ interaction } as never)
        expect(musicEmbedMock).toHaveBeenCalledWith('Recently Played', expect.stringContaining('Track 1'))
        expect(fakeEmbed.setFooter).toHaveBeenCalled()
    })

    it('shows autoplay tag for autoplay tracks', async () => {
        const entries = [makeEntry(1, true)]
        getTrackHistoryMock.mockResolvedValue(entries)
        const interaction = makeInteraction()
        await historyCommand.execute({ interaction } as never)
        const description = musicEmbedMock.mock.calls[0][1] as string
        expect(description).toContain('🤖')
    })

    it('shows error embed when requested page exceeds available history', async () => {
        getTrackHistoryMock.mockResolvedValue(Array.from({ length: 3 }, (_, i) => makeEntry(i + 1)))
        const interaction = makeInteraction({
            options: { getInteger: jest.fn().mockReturnValue(2) },
        })
        await historyCommand.execute({ interaction } as never)
        expect(createErrorEmbedMock).toHaveBeenCalledWith('Page not found', expect.any(String))
    })

    it('passes guildId and correct limit to getTrackHistory', async () => {
        getTrackHistoryMock.mockResolvedValue(Array.from({ length: 10 }, (_, i) => makeEntry(i + 1)))
        const interaction = makeInteraction()
        await historyCommand.execute({ interaction } as never)
        expect(getTrackHistoryMock).toHaveBeenCalledWith('guild-1', 10)
    })

    it('fetches page*PAGE_SIZE entries for page 2', async () => {
        const entries = Array.from({ length: 20 }, (_, i) => makeEntry(i + 1))
        getTrackHistoryMock.mockResolvedValue(entries)
        const interaction = makeInteraction({
            options: { getInteger: jest.fn().mockReturnValue(2) },
        })
        await historyCommand.execute({ interaction } as never)
        expect(getTrackHistoryMock).toHaveBeenCalledWith('guild-1', 20)
        const description = musicEmbedMock.mock.calls[0][1] as string
        expect(description).toContain('Track 11')
    })
})
