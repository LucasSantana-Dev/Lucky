import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const mockInteractionReply = jest.fn()
const mockErrorLog = jest.fn()
const mockCreateErrorEmbed = jest.fn()
const mockCreateEmbed = jest.fn()
const mockGetAutoplayStats = jest.fn()

jest.mock('../../../../../utils/general/interactionReply', () => ({
    interactionReply: mockInteractionReply,
}))

jest.mock('../../../../../utils/general/embeds', () => ({
    createErrorEmbed: mockCreateErrorEmbed,
    createEmbed: mockCreateEmbed,
    EMBED_COLORS: { INFO: 0x0099ff },
    EMOJIS: { SETTINGS: '⚙️' },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: mockErrorLog,
}))

jest.mock('../../../../../utils/music/autoplayManager', () => ({
    getAutoplayStats: mockGetAutoplayStats,
}))

// Import after mocks are set up
import { handleShowSettings } from './settingsHandler'

function createMockInteraction(
    guildId: string | null,
): ChatInputCommandInteraction {
    return {
        guildId,
        options: {},
        isChatInputCommand: jest.fn(() => true),
        isButton: jest.fn(() => false),
        isModalSubmit: jest.fn(() => false),
        isStringSelectMenu: jest.fn(() => false),
        isUserSelectMenu: jest.fn(() => false),
        isChannelSelectMenu: jest.fn(() => false),
        isRoleSelectMenu: jest.fn(() => false),
        isMentionableSelectMenu: jest.fn(() => false),
    } as unknown as ChatInputCommandInteraction
}

describe('settingsHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockCreateErrorEmbed.mockReturnValue({ title: 'Error' })
        mockCreateEmbed.mockReturnValue({ title: 'Recommendation Settings' })
        mockGetAutoplayStats.mockResolvedValue({
            total: 100,
            thisWeek: 20,
            thisMonth: 50,
            averagePerDay: 3.33,
        })
    })

    it('displays current settings successfully', async () => {
        const interaction = createMockInteraction('guild-1')

        await handleShowSettings(interaction)

        expect(mockInteractionReply).toHaveBeenCalledWith(
            expect.objectContaining({ interaction }),
        )
        expect(mockGetAutoplayStats).toHaveBeenCalledWith('guild-1')
        expect(mockCreateEmbed).toHaveBeenCalled()
        expect(mockErrorLog).not.toHaveBeenCalled()
    })

    it('shows default settings when no custom settings exist and replies with embed', async () => {
        const interaction = createMockInteraction('guild-1')

        await handleShowSettings(interaction)

        expect(mockCreateEmbed).toHaveBeenCalled()
        expect(mockInteractionReply).toHaveBeenCalledWith(
            expect.objectContaining({ interaction }),
        )
        expect(mockErrorLog).not.toHaveBeenCalled()
    })

    it('rejects command when not in a guild', async () => {
        const interaction = createMockInteraction(null)

        await handleShowSettings(interaction)

        expect(mockInteractionReply).toHaveBeenCalledWith(
            expect.objectContaining({ interaction }),
        )
        expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
            'Error',
            'This command can only be used in a server!',
        )
    })

    it('handles autoplay stats retrieval errors gracefully', async () => {
        mockGetAutoplayStats.mockRejectedValueOnce(new Error('Stats error'))
        const interaction = createMockInteraction('guild-1')

        await handleShowSettings(interaction)

        expect(mockErrorLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to retrieve recommendation settings',
            }),
        )
        expect(mockInteractionReply).toHaveBeenCalled()
    })
})
