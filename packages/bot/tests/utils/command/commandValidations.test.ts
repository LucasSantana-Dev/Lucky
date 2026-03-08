import {
    createMockInteraction,
    createMockMember,
} from '../../__mocks__/discord'

jest.mock('@nexus/shared/utils', () => ({
    handleError: jest.fn((err: Error) => ({
        message: err.message,
        code: 'TEST_ERROR',
    })),
    createUserErrorMessage: jest.fn((err: { message: string }) => err.message),
    errorEmbed: jest.fn((_title: string, desc: string) => ({
        description: desc,
    })),
}))

jest.mock('../../../src/utils/general/interactionReply', () => ({
    interactionReply: jest.fn().mockResolvedValue(undefined),
}))

import {
    requireGuild,
    requireVoiceChannel,
    requireQueue,
    requireCurrentTrack,
    requireIsPlaying,
} from '../../../src/utils/command/commandValidations'

describe('commandValidations', () => {
    describe('requireGuild', () => {
        it('returns true when guildId exists', async () => {
            const interaction = createMockInteraction()
            const result = await requireGuild(interaction)
            expect(result).toBe(true)
        })

        it('returns false and replies when no guildId', async () => {
            const interaction = createMockInteraction({
                guildId: null,
            })
            const result = await requireGuild(interaction)
            expect(result).toBe(false)
        })
    })

    describe('requireVoiceChannel', () => {
        it('returns true when member is in voice channel', async () => {
            const interaction = createMockInteraction()
            const result = await requireVoiceChannel(interaction)
            expect(result).toBe(true)
        })

        it('returns false when member has no voice channel', async () => {
            const member = createMockMember({
                voice: { channel: null, channelId: null },
            } as any)
            const interaction = createMockInteraction({
                member,
            })
            const result = await requireVoiceChannel(interaction)
            expect(result).toBe(false)
        })
    })

    describe('requireQueue', () => {
        it('returns true when queue exists', async () => {
            const interaction = createMockInteraction()
            const mockQueue = { guild: { id: '123' } } as any
            const result = await requireQueue(mockQueue, interaction)
            expect(result).toBe(true)
        })

        it('returns false when queue is null', async () => {
            const interaction = createMockInteraction()
            const result = await requireQueue(null, interaction)
            expect(result).toBe(false)
        })
    })

    describe('requireCurrentTrack', () => {
        it('returns true when current track exists', async () => {
            const interaction = createMockInteraction()
            const queue = { currentTrack: { title: 'Test' } } as any
            const result = await requireCurrentTrack(queue, interaction)
            expect(result).toBe(true)
        })

        it('returns false when no current track', async () => {
            const interaction = createMockInteraction()
            const queue = { currentTrack: null } as any
            const result = await requireCurrentTrack(queue, interaction)
            expect(result).toBe(false)
        })

        it('returns false when queue is null', async () => {
            const interaction = createMockInteraction()
            const result = await requireCurrentTrack(null, interaction)
            expect(result).toBe(false)
        })
    })

    describe('requireIsPlaying', () => {
        it('returns true when music is playing', async () => {
            const interaction = createMockInteraction()
            const queue = {
                isPlaying: jest.fn().mockReturnValue(true),
            } as any
            const result = await requireIsPlaying(queue, interaction)
            expect(result).toBe(true)
        })

        it('returns false when music is not playing', async () => {
            const interaction = createMockInteraction()
            const queue = {
                isPlaying: jest.fn().mockReturnValue(false),
            } as any
            const result = await requireIsPlaying(queue, interaction)
            expect(result).toBe(false)
        })

        it('returns false when queue is null', async () => {
            const interaction = createMockInteraction()
            const result = await requireIsPlaying(null, interaction)
            expect(result).toBe(false)
        })
    })
})
