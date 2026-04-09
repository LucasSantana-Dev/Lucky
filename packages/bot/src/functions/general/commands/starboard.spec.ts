import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import starboardCommand from './starboard'

const interactionReplyMock = jest.fn()
const successEmbedMock = jest.fn((title: string, description: string) => ({ type: 'success', title, description }))
const errorEmbedMock = jest.fn((title: string, description: string) => ({ type: 'error', title, description }))
const infoEmbedMock = jest.fn((title: string, description: string) => ({ type: 'info', title, description }))
const buildListPageEmbedMock = jest.fn((items, page, config) => ({ type: 'listpage', items, page, config }))
const requireGuildMock = jest.fn()
const getConfigMock = jest.fn()
const upsertConfigMock = jest.fn()
const deleteConfigMock = jest.fn()
const getTopEntriesMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    successEmbed: (...args: unknown[]) => successEmbedMock(...args),
    errorEmbed: (...args: unknown[]) => errorEmbedMock(...args),
    infoEmbed: (...args: unknown[]) => infoEmbedMock(...args),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildListPageEmbed: (...args: unknown[]) => buildListPageEmbedMock(...args),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    starboardService: {
        getConfig: (...args: unknown[]) => getConfigMock(...args),
        upsertConfig: (...args: unknown[]) => upsertConfigMock(...args),
        deleteConfig: (...args: unknown[]) => deleteConfigMock(...args),
        getTopEntries: (...args: unknown[]) => getTopEntriesMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    debugLog: jest.fn(),
}))

function createInteraction(subcommand: string, opts: Record<string, unknown> = {}) {
    return {
        guild: { id: 'guild-1' },
        options: {
            getSubcommand: jest.fn(() => subcommand),
            getSubcommandGroup: jest.fn(() => null),
            getChannel: jest.fn((name: string) => opts[name] ?? null),
            getString: jest.fn((name: string) => opts[name] ?? null),
            getInteger: jest.fn((name: string) => opts[name] ?? null),
            getBoolean: jest.fn((name: string) => opts[name] ?? null),
        },
    } as any
}

describe('starboard command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
    })

    it('setup creates starboard config with defaults', async () => {
        const channel = { id: 'ch-1' }
        upsertConfigMock.mockResolvedValue({})
        await starboardCommand.execute({
            interaction: createInteraction('setup', { channel }),
        } as any)
        expect(upsertConfigMock).toHaveBeenCalledWith('guild-1', {
            channelId: 'ch-1',
            emoji: '⭐',
            threshold: 3,
            selfStar: false,
        })
        expect(successEmbedMock).toHaveBeenCalledWith('Starboard Configured', expect.any(String))
    })

    it('setup accepts custom emoji and threshold', async () => {
        const channel = { id: 'ch-2' }
        upsertConfigMock.mockResolvedValue({})
        await starboardCommand.execute({
            interaction: createInteraction('setup', { channel, emoji: '🌟', threshold: 5, 'self-star': true }),
        } as any)
        expect(upsertConfigMock).toHaveBeenCalledWith('guild-1', {
            channelId: 'ch-2',
            emoji: '🌟',
            threshold: 5,
            selfStar: true,
        })
    })

    it('disable calls deleteConfig', async () => {
        deleteConfigMock.mockResolvedValue(undefined)
        await starboardCommand.execute({ interaction: createInteraction('disable') } as any)
        expect(deleteConfigMock).toHaveBeenCalledWith('guild-1')
        expect(successEmbedMock).toHaveBeenCalledWith('Starboard Disabled', expect.any(String))
    })

    it('top shows entries when they exist', async () => {
        getTopEntriesMock.mockResolvedValue([
            { guildId: 'guild-1', channelId: 'ch-1', messageId: 'msg-1', starCount: 10 },
        ])
        await starboardCommand.execute({ interaction: createInteraction('top') } as any)
        expect(buildListPageEmbedMock).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    value: expect.stringContaining('Jump to message'),
                }),
            ]),
            1,
            expect.objectContaining({ title: 'Top Starred Messages' }),
        )
    })

    it('top shows empty state when no entries', async () => {
        getTopEntriesMock.mockResolvedValue([])
        await starboardCommand.execute({ interaction: createInteraction('top') } as any)
        expect(buildListPageEmbedMock).toHaveBeenCalledWith(
            [],
            1,
            expect.objectContaining({
                title: 'Top Starred Messages',
                emptyMessage: 'No starred messages yet.',
            }),
        )
    })

    it('status shows config when set', async () => {
        getConfigMock.mockResolvedValue({
            channelId: 'ch-99',
            emoji: '⭐',
            threshold: 3,
            selfStar: false,
        })
        await starboardCommand.execute({ interaction: createInteraction('status') } as any)
        expect(infoEmbedMock).toHaveBeenCalledWith('Starboard Status', expect.stringContaining('ch-99'))
    })

    it('status shows not configured when no config', async () => {
        getConfigMock.mockResolvedValue(null)
        await starboardCommand.execute({ interaction: createInteraction('status') } as any)
        expect(infoEmbedMock).toHaveBeenCalledWith('Starboard Status', expect.stringContaining('not configured'))
    })

    it('returns early without guild', async () => {
        requireGuildMock.mockResolvedValue(false)
        await starboardCommand.execute({
            interaction: { ...createInteraction('setup'), guild: null },
        } as any)
        expect(upsertConfigMock).not.toHaveBeenCalled()
    })

    it('shows error embed on service failure', async () => {
        upsertConfigMock.mockRejectedValue(new Error('DB error'))
        const channel = { id: 'ch-1' }
        await starboardCommand.execute({
            interaction: createInteraction('setup', { channel }),
        } as any)
        expect(errorEmbedMock).toHaveBeenCalledWith('Error', 'DB error')
    })
})
