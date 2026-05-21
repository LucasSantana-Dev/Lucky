import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const mockInteractionReply = jest.fn()
const mockErrorLog = jest.fn()
const mockCreateErrorEmbed = jest.fn()
const mockCreateSuccessEmbed = jest.fn()

jest.mock('../../../../../utils/general/interactionReply', () => ({
	interactionReply: mockInteractionReply,
}))

jest.mock('../../../../../utils/general/embeds', () => ({
	createErrorEmbed: mockCreateErrorEmbed,
	createSuccessEmbed: mockCreateSuccessEmbed,
}))

jest.mock('@lucky/shared/utils', () => ({
	errorLog: mockErrorLog,
}))

// Import after mocks are set up
import { handleResetSettings } from './resetHandler'

function createMockInteraction(
	guildId: string | null,
	confirm: boolean,
): ChatInputCommandInteraction {
	return {
		guildId,
		options: {
			getBoolean: jest.fn((key) => {
				if (key === 'confirm') return confirm
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

describe('resetHandler', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockCreateErrorEmbed.mockReturnValue({ title: 'Error' })
		mockCreateSuccessEmbed.mockReturnValue({ title: 'Settings Reset' })
	})

	it('resets settings successfully when confirmed', async () => {
		const interaction = createMockInteraction('guild-1', true)

		await handleResetSettings(interaction)

		expect(mockInteractionReply).toHaveBeenCalledWith(
			expect.objectContaining({ interaction }),
		)
		expect(mockCreateSuccessEmbed).toHaveBeenCalledWith(
			'Settings Reset',
			'All recommendation settings have been reset to their default values.',
		)
		expect(mockErrorLog).not.toHaveBeenCalled()
	})

	it('cancels reset when not confirmed', async () => {
		const interaction = createMockInteraction('guild-1', false)

		await handleResetSettings(interaction)

		expect(mockInteractionReply).toHaveBeenCalledWith(
			expect.objectContaining({ interaction }),
		)
		expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
			'Error',
			'Reset cancelled. You must confirm the reset.',
		)
	})

	it('rejects command when not in a guild', async () => {
		const interaction = createMockInteraction(null, true)

		await handleResetSettings(interaction)

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
		const interaction = createMockInteraction('guild-1', true)

		await handleResetSettings(interaction)

		expect(mockErrorLog).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Failed to reset recommendation settings',
			}),
		)
		expect(mockInteractionReply).toHaveBeenCalled()
	})
})
