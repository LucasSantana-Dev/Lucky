import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireGuildMock = jest.fn()
const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const requireIsPlayingMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const createErrorEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const debugLogMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const getGuildSettingsMock = jest.fn()
const addVoteMock = jest.fn()
const clearVotesMock = jest.fn()
const getVotesMock = jest.fn()
const hasVotedMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) => requireCurrentTrackMock(...args),
    requireIsPlaying: (...args: unknown[]) => requireIsPlayingMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (...args: unknown[]) => getGuildSettingsMock(...args),
    },
}))

jest.mock('../../../utils/music/voteSkipStore', () => ({
    addVote: (...args: unknown[]) => addVoteMock(...args),
    clearVotes: (...args: unknown[]) => clearVotesMock(...args),
    getVotes: (...args: unknown[]) => getVotesMock(...args),
    hasVoted: (...args: unknown[]) => hasVotedMock(...args),
}))

import voteskipCommand from './voteskip'

function createInteraction(overrides: Record<string, unknown> = {}) {
    return {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        ...overrides,
    } as any
}

function createQueue(memberCount = 3) {
    const members = new Map()
    for (let i = 1; i <= memberCount; i++) {
        members.set(`user-${i}`, { user: { bot: false } })
    }
    return {
        guild: { id: 'guild-1' },
        isPlaying: jest.fn().mockReturnValue(true),
        node: { skip: jest.fn() },
        channel: { members },
    } as any
}

describe('voteskip command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
        requireIsPlayingMock.mockResolvedValue(true)
        hasVotedMock.mockReturnValue(false)
        getGuildSettingsMock.mockResolvedValue({ voteSkipThreshold: 50 })
    })

    it('has correct command name and category', () => {
        expect(voteskipCommand.data.name).toBe('voteskip')
        expect(voteskipCommand.category).toBe('music')
    })

    it('returns early when requireGuild fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const interaction = createInteraction()
        await voteskipCommand.execute({ client: {}, interaction } as any)
        expect(resolveGuildQueueMock).not.toHaveBeenCalled()
    })

    it('returns early when no voice channel', async () => {
        const queue = { ...createQueue(), channel: null }
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = createInteraction()
        await voteskipCommand.execute({ client: {}, interaction } as any)
        expect(createErrorEmbedMock).toHaveBeenCalledWith('Error', expect.stringContaining('voice channel'))
    })

    it('returns error when no eligible members in voice channel', async () => {
        const queue = createQueue(0)
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = createInteraction()
        await voteskipCommand.execute({ client: {}, interaction } as any)
        expect(createErrorEmbedMock).toHaveBeenCalledWith('Error', expect.stringContaining('eligible'))
    })

    it('returns error when user already voted', async () => {
        hasVotedMock.mockReturnValue(true)
        const queue = createQueue(3)
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = createInteraction()
        await voteskipCommand.execute({ client: {}, interaction } as any)
        expect(createErrorEmbedMock).toHaveBeenCalledWith('Already voted', expect.any(String))
        expect(addVoteMock).not.toHaveBeenCalled()
    })

    it('records vote and shows progress when threshold not met', async () => {
        const queue = createQueue(4)
        resolveGuildQueueMock.mockReturnValue({ queue })
        addVoteMock.mockReturnValue(new Set(['user-1']))
        const interaction = createInteraction()
        await voteskipCommand.execute({ client: {}, interaction } as any)
        expect(addVoteMock).toHaveBeenCalledWith('guild-1', 'user-1')
        expect(queue.node.skip).not.toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('🗳️ Vote recorded', expect.any(String))
    })

    it('skips when vote threshold is met', async () => {
        const queue = createQueue(2)
        resolveGuildQueueMock.mockReturnValue({ queue })
        addVoteMock.mockReturnValue(new Set(['user-1', 'user-2']))
        const interaction = createInteraction()
        await voteskipCommand.execute({ client: {}, interaction } as any)
        expect(queue.node.skip).toHaveBeenCalled()
        expect(clearVotesMock).toHaveBeenCalledWith('guild-1')
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('⏭️ Vote skip passed', expect.any(String))
    })

    it('uses default 50% threshold when settings are null', async () => {
        getGuildSettingsMock.mockResolvedValue(null)
        const queue = createQueue(2)
        resolveGuildQueueMock.mockReturnValue({ queue })
        addVoteMock.mockReturnValue(new Set(['user-1', 'user-2']))
        const interaction = createInteraction()
        await voteskipCommand.execute({ client: {}, interaction } as any)
        expect(queue.node.skip).toHaveBeenCalled()
    })
})
