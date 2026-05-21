import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const mockInteractionReply = jest.fn()
const mockErrorLog = jest.fn()
const mockCreateErrorEmbed = jest.fn()
const mockCreateEmbed = jest.fn()

jest.mock('../../../../../utils/general/interactionReply', () => ({
	interactionReply: mockInteractionReply,
}))

jest.mock('../../../../../utils/general/embeds', () => ({
	createErrorEmbed: mockCreateErrorEmbed,
	createEmbed: mockCreateEmbed,
	EMBED_COLORS: { SUCCESS: 0x00aa00, ERROR: 0xff0000 },
	EMOJIS: { SUCCESS: '✓' },
}))

jest.mock('@lucky/shared/utils', () => ({
	errorLog: mockErrorLog,
}))

// Import after mocks are set up
import { handleApplyPreset } from './presetHandler'

function createMockInteraction(
	guildId: string | null,
	preset: string,
): ChatInputCommandInteraction {
	return {
		guildId,
		options: {
			getString: jest.fn((key) => {
				if (key === 'preset') return preset
				return null
			}),
		},
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

describe('presetHandler', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockCreateErrorEmbed.mockReturnValue({ title: 'Error' })
		mockCreateEmbed.mockReturnValue({ title: 'Success' })
	})

	it('applies balanced preset successfully', async () => {
		const interaction = createMockInteraction('guild-1', 'balanced')

		await handleApplyPreset(interaction)

		expect(mockInteractionReply).toHaveBeenCalledWith(
			expect.objectContaining({ interaction }),
		)
		expect(mockCreateEmbed).toHaveBeenCalled()
		expect(mockErrorLog).not.toHaveBeenCalled()
	})

	it('applies conservative preset successfully', async () => {
		const interaction = createMockInteraction('guild-1', 'conservative')

		await handleApplyPreset(interaction)

		expect(mockInteractionReply).toHaveBeenCalledWith(
			expect.objectContaining({ interaction }),
		)
		expect(mockCreateEmbed).toHaveBeenCalled()
	})

	it('rejects unknown preset name', async () => {
		const interaction = createMockInteraction('guild-1', 'unknown-preset')

		await handleApplyPreset(interaction)

		expect(mockInteractionReply).toHaveBeenCalledWith(
			expect.objectContaining({ interaction }),
		)
		expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
			'Error',
			'Invalid preset selected.',
		)
	})

	it('rejects command when not in a guild', async () => {
		const interaction = createMockInteraction(null, 'balanced')

		await handleApplyPreset(interaction)

		expect(mockInteractionReply).toHaveBeenCalledWith(
			expect.objectContaining({ interaction }),
		)
		expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
			'Error',
			'This command can only be used in a server!',
		)
	})

	it('handles service errors gracefully', async () => {
		mockInteractionReply.mockRejectedValueOnce(new Error('Service error'))
		const interaction = createMockInteraction('guild-1', 'balanced')

		await handleApplyPreset(interaction)

		expect(mockErrorLog).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Failed to apply preset',
			}),
		)
	})
})
