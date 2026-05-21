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
import { handleUpdateSettings } from './updateHandler'

function createMockInteraction(
	guildId: string | null,
	updates: Record<string, unknown>,
): ChatInputCommandInteraction {
	return {
		guildId,
		options: {
			getBoolean: jest.fn((key) => updates[key] ?? null),
			getInteger: jest.fn((key) => updates[key] ?? null),
			getNumber: jest.fn((key) => updates[key] ?? null),
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

describe('updateHandler', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockCreateErrorEmbed.mockReturnValue({ title: 'Error' })
		mockCreateSuccessEmbed.mockReturnValue({ title: 'Settings Updated' })
	})

	it('updates single boolean field successfully', async () => {
		const interaction = createMockInteraction('guild-1', { enabled: true })

		await handleUpdateSettings(interaction)

		expect(mockInteractionReply).toHaveBeenCalledWith(
			expect.objectContaining({ interaction }),
		)
		expect(mockCreateSuccessEmbed).toHaveBeenCalledWith(
			'Settings Updated',
			'Recommendation settings have been updated successfully.',
		)
		expect(mockErrorLog).not.toHaveBeenCalled()
	})

	it('updates multiple settings simultaneously', async () => {
		const interaction = createMockInteraction('guild-1', {
			enabled: true,
			max_recommendations: 5,
			similarity_threshold: 0.7,
		})

		await handleUpdateSettings(interaction)

		expect(mockInteractionReply).toHaveBeenCalledWith(
			expect.objectContaining({ interaction }),
		)
		expect(mockCreateSuccessEmbed).toHaveBeenCalled()
	})

	it('rejects when no settings provided to update', async () => {
		const interaction = createMockInteraction('guild-1', {})

		await handleUpdateSettings(interaction)

		expect(mockInteractionReply).toHaveBeenCalledWith(
			expect.objectContaining({ interaction }),
		)
		expect(mockCreateErrorEmbed).toHaveBeenCalledWith(
			'Error',
			'No settings provided to update.',
		)
	})

	it('rejects command when not in a guild', async () => {
		const interaction = createMockInteraction(null, { enabled: true })

		await handleUpdateSettings(interaction)

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
		const interaction = createMockInteraction('guild-1', {
			genre_weight: 0.5,
		})

		await handleUpdateSettings(interaction)

		expect(mockErrorLog).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Failed to update recommendation settings',
			}),
		)
		expect(mockInteractionReply).toHaveBeenCalled()
	})
})
