import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import songinfoCommand from './songinfo'

const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const interactionReplyMock = jest.fn()
const buildTrackEmbedMock = jest.fn(() => ({}))
const trackToDataMock = jest.fn((track: unknown) => track)
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) => requireCurrentTrackMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildTrackEmbed: (...args: unknown[]) => buildTrackEmbedMock(...args),
    trackToData: (...args: unknown[]) => trackToDataMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createInteraction(guildId = 'guild-1') {
    return {
        guildId,
        user: { username: 'tester', displayAvatarURL: jest.fn().mockReturnValue('http://avatar') },
    } as any
}

describe('songinfo command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = { currentTrack: null }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await songinfoCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when current track validation fails', async () => {
        requireCurrentTrackMock.mockResolvedValue(false)
        const queue = { currentTrack: null }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await songinfoCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('shows rich track embed for current song', async () => {
        const track = { title: 'Test Song', author: 'Artist', url: 'http://x', duration: '3:00' }
        const queue = { currentTrack: track }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await songinfoCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(trackToDataMock).toHaveBeenCalledWith(track)
        expect(buildTrackEmbedMock).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({ embeds: expect.any(Array) }),
            }),
        )
    })
})
