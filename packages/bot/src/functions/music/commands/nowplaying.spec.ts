import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import nowplayingCommand from './nowplaying'

const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const interactionReplyMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const trackToDataMock = jest.fn((track: unknown) => ({ title: (track as { title: string }).title }))
const buildTrackEmbedMock = jest.fn(() => ({ embed: 'nowplaying' }))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) => requireCurrentTrackMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    trackToData: (...args: unknown[]) => trackToDataMock(...args),
    buildTrackEmbed: (...args: unknown[]) => buildTrackEmbedMock(...args),
}))

function makeInteraction() {
    return {
        guildId: 'guild-1',
        user: { username: 'TestUser', displayAvatarURL: jest.fn(() => 'http://avatar') },
    } as any
}

describe('nowplaying command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
    })

    it('has correct command name and description', () => {
        expect(nowplayingCommand.data.name).toBe('nowplaying')
        expect(nowplayingCommand.data.description).toContain('currently playing')
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        await nowplayingCommand.execute({ client: {} as any, interaction: makeInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when no current track', async () => {
        requireCurrentTrackMock.mockResolvedValue(false)
        const queue = { currentTrack: null }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await nowplayingCommand.execute({ client: {} as any, interaction: makeInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('replies with track embed when track is playing', async () => {
        const track = { title: 'Bohemian Rhapsody', author: 'Queen' }
        const queue = { currentTrack: track }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await nowplayingCommand.execute({ client: {} as any, interaction: makeInteraction() } as any)

        expect(trackToDataMock).toHaveBeenCalledWith(track)
        const [, status, user] = buildTrackEmbedMock.mock.calls[0] as [unknown, string, unknown]
        expect(status).toBe('playing')
        expect(user).toMatchObject({ tag: 'TestUser' })
        expect(interactionReplyMock).toHaveBeenCalled()
    })
})
