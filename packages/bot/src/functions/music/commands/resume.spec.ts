import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import resumeCommand from './resume'

const requireQueueMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const createWarningEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const setAuthorMock = jest.fn().mockReturnThis()
const buildTrackEmbedMock = jest.fn(() => ({ setAuthor: setAuthorMock }))
const trackToDataMock = jest.fn((track: unknown) => track)
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createWarningEmbed: (...args: unknown[]) => createWarningEmbedMock(...args),
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

function createQueue(isPaused = true, currentTrack: unknown = null) {
    return {
        node: {
            isPaused: jest.fn().mockReturnValue(isPaused),
            resume: jest.fn(),
        },
        currentTrack,
    } as any
}

describe('resume command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireQueueMock.mockResolvedValue(true)
        setAuthorMock.mockReturnThis()
        buildTrackEmbedMock.mockReturnValue({ setAuthor: setAuthorMock })
        trackToDataMock.mockImplementation((track: unknown) => track)
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await resumeCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(queue.node.resume).not.toHaveBeenCalled()
    })

    it('shows warning when already playing (not paused)', async () => {
        const queue = createQueue(false)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await resumeCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(queue.node.resume).not.toHaveBeenCalled()
        expect(createWarningEmbedMock).toHaveBeenCalledWith('Already playing', expect.any(String))
    })

    it('shows simple success embed when no current track', async () => {
        const queue = createQueue(true, null)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await resumeCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(queue.node.resume).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('▶️ Resumed', 'Music has been resumed.')
    })

    it('shows rich track embed when current track exists', async () => {
        const track = { title: 'Test Song', author: 'Artist', url: 'http://x', duration: '3:00' }
        const queue = createQueue(true, track)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await resumeCommand.execute({ client: {} as any, interaction: createInteraction() } as any)

        expect(queue.node.resume).toHaveBeenCalled()
        expect(trackToDataMock).toHaveBeenCalledWith(track)
        expect(buildTrackEmbedMock).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })
})
