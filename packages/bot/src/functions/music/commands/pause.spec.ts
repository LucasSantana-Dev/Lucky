import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import pauseCommand from './pause'

const requireQueueMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const createWarningEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const setAuthorMock = jest.fn().mockReturnThis()
const buildTrackEmbedMock = jest.fn(() => ({ setAuthor: setAuthorMock }))
const trackToDataMock = jest.fn((track: unknown) => track)
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireVoiceChannel: (...args: unknown[]) => requireVoiceChannelMock(...args),
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

function createQueue(isPaused = false, currentTrack: unknown = null) {
    return {
        node: {
            isPaused: jest.fn().mockReturnValue(isPaused),
            pause: jest.fn(),
        },
        currentTrack,
    } as any
}

function createClient() {
    return {} as any
}

describe('pause command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        setAuthorMock.mockReturnThis()
        buildTrackEmbedMock.mockReturnValue({ setAuthor: setAuthorMock })
        trackToDataMock.mockImplementation((track: unknown) => track)
    })

    it('returns early when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.pause).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.pause).not.toHaveBeenCalled()
    })

    it('shows warning when already paused', async () => {
        const queue = createQueue(true)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.pause).not.toHaveBeenCalled()
        expect(createWarningEmbedMock).toHaveBeenCalledWith('Already paused', expect.any(String))
    })

    it('shows simple success embed when no current track', async () => {
        const queue = createQueue(false, null)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.pause).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('⏸️ Paused', 'Music has been paused.')
    })

    it('shows rich track embed when current track exists', async () => {
        const track = { title: 'Test Song', author: 'Artist', url: 'http://x', duration: '3:00' }
        const queue = createQueue(false, track)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({ client: createClient(), interaction: createInteraction() } as any)

        expect(queue.node.pause).toHaveBeenCalled()
        expect(trackToDataMock).toHaveBeenCalledWith(track)
        expect(buildTrackEmbedMock).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })
})
