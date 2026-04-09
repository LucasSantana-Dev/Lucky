import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import playlistCommand from './playlist'

const interactionReplyMock = jest.fn()
const requireGuildMock = jest.fn()
const getStateMock = jest.fn()
const resetContributionsMock = jest.fn()
const setModeMock = jest.fn()
const createInfoEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'info',
    title,
    message,
}))
const createSuccessEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'success',
    title,
    message,
}))
const createWarningEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'warning',
    title,
    message,
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('../../../utils/music/collaborativePlaylist', () => ({
    collaborativePlaylistService: {
        getState: (...args: unknown[]) => getStateMock(...args),
        resetContributions: (...args: unknown[]) =>
            resetContributionsMock(...args),
        setMode: (...args: unknown[]) => setModeMock(...args),
    },
}))

jest.mock('../../../utils/general/embeds', () => ({
    createInfoEmbed: (...args: unknown[]) => createInfoEmbedMock(...args),
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createWarningEmbed: (...args: unknown[]) => createWarningEmbedMock(...args),
}))

function createInteraction(action: string, guildId = 'guild-1', limit?: number) {
    return {
        guildId,
        options: {
            getString: jest.fn(() => action),
            getInteger: jest.fn(() => limit ?? null),
        },
    } as any
}

describe('playlist command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        getStateMock.mockReturnValue({
            enabled: true,
            perUserLimit: 3,
            contributions: { userA: 2 },
        })
        setModeMock.mockReturnValue({ perUserLimit: 4 })
    })

    it('returns early when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await playlistCommand.execute({ interaction: createInteraction('status') } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns status with contribution list', async () => {
        await playlistCommand.execute({ interaction: createInteraction('status') } as any)

        expect(getStateMock).toHaveBeenCalledWith('guild-1')
        expect(createInfoEmbedMock).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({ ephemeral: true }),
            }),
        )
    })

    it('resets contributions', async () => {
        await playlistCommand.execute({ interaction: createInteraction('reset') } as any)

        expect(resetContributionsMock).toHaveBeenCalledWith('guild-1')
        expect(createWarningEmbedMock).toHaveBeenCalled()
    })

    it('enables collaborative mode with provided limit', async () => {
        await playlistCommand.execute({
            interaction: createInteraction('enable', 'guild-1', 4),
        } as any)

        expect(setModeMock).toHaveBeenCalledWith('guild-1', true, 4)
        expect(createSuccessEmbedMock).toHaveBeenCalled()
    })

    it('disables collaborative mode', async () => {
        await playlistCommand.execute({
            interaction: createInteraction('disable'),
        } as any)

        expect(setModeMock).toHaveBeenCalledWith('guild-1', false)
        expect(createWarningEmbedMock).toHaveBeenCalled()
    })
})
