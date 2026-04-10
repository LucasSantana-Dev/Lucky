import {
    createMockInteraction,
    createMockMember,
} from '../../__mocks__/discord'

const getGuildSettingsMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (...args: unknown[]) => getGuildSettingsMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    handleError: jest.fn((err: Error) => ({
        message: err.message,
        code: 'TEST_ERROR',
    })),
    createUserErrorMessage: jest.fn((err: { message: string }) => err.message),
    warnLog: jest.fn(),
    errorEmbed: jest.fn((_title: string, desc: string) => ({
        description: desc,
    })),
}))

jest.mock('../../../src/utils/general/interactionReply', () => ({
    interactionReply: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../src/utils/general/embeds', () => ({
    errorEmbed: jest.fn((_title: string, description: string) => ({
        title: _title,
        description,
    })),
    createErrorEmbed: jest.fn((_title: string, description: string) => ({
        title: _title,
        description,
    })),
}))

import {
    requireGuild,
    requireVoiceChannel,
    requireQueue,
    requireCurrentTrack,
    requireIsPlaying,
    requireDJRole,
} from '../../../src/utils/command/commandValidations'
import { interactionReply } from '../../../src/utils/general/interactionReply'
import { handleError, warnLog } from '@lucky/shared/utils'
import { errorEmbed } from '../../../src/utils/general/embeds'

const interactionReplyMock = jest.mocked(interactionReply)
const handleErrorMock = jest.mocked(handleError)
const warnLogMock = jest.mocked(warnLog)
const errorEmbedMock = jest.mocked(errorEmbed)

function createInteraction(overrides: Record<string, unknown> = {}) {
    return createMockInteraction({
        commandName: 'test-command',
        ...overrides,
    })
}

describe('commandValidations', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getGuildSettingsMock.mockResolvedValue({})
        errorEmbedMock.mockImplementation(
            (_title: string, description: string) => ({
                title: _title,
                description,
            }),
        )
        interactionReplyMock.mockResolvedValue(undefined)
        handleErrorMock.mockImplementation((err: Error) => ({
            message: err.message,
            code: 'TEST_ERROR',
        }))
    })

    describe('requireGuild', () => {
        it('returns true and does not reply when guildId exists', async () => {
            const interaction = createInteraction()
            const result = await requireGuild(interaction)
            expect(result).toBe(true)
            expect(interactionReplyMock).not.toHaveBeenCalled()
        })

        it('returns false, calls handleError and replies with error embed when no guildId', async () => {
            const interaction = createInteraction({ guildId: null })
            const result = await requireGuild(interaction)

            expect(result).toBe(false)
            expect(handleErrorMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Command can only be used in a guild/server',
                }),
                expect.objectContaining({ userId: '123456789' }),
            )
            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        embeds: expect.arrayContaining([
                            expect.objectContaining({ title: 'Error' }),
                        ]),
                    }),
                }),
            )
        })
    })

    describe('requireVoiceChannel', () => {
        it('returns true and does not warn or reply when member is in voice channel', async () => {
            const interaction = createInteraction()
            const result = await requireVoiceChannel(interaction)

            expect(result).toBe(true)
            expect(warnLogMock).not.toHaveBeenCalled()
            expect(interactionReplyMock).not.toHaveBeenCalled()
        })

        it('returns false, logs warning with context, and replies ephemerally when not in voice channel', async () => {
            const member = createMockMember({
                voice: { channel: null, channelId: null },
            } as any)
            const interaction = createInteraction({ member })
            const result = await requireVoiceChannel(interaction)

            expect(result).toBe(false)
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'requireVoiceChannel: user not in voice channel',
                    data: expect.objectContaining({
                        commandName: 'test-command',
                        userId: '123456789',
                        guildId: '987654321',
                    }),
                }),
            )
            expect(errorEmbedMock).toHaveBeenCalledWith(
                'Not in Voice',
                'Join a voice channel first.',
            )
            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        ephemeral: true,
                        embeds: expect.arrayContaining([
                            expect.objectContaining({ title: 'Not in Voice' }),
                        ]),
                    }),
                }),
            )
        })
    })

    describe('requireQueue', () => {
        it('returns true and does not warn or reply when queue exists', async () => {
            const interaction = createInteraction()
            const mockQueue = { guild: { id: '123' } } as any
            const result = await requireQueue(mockQueue, interaction)

            expect(result).toBe(true)
            expect(warnLogMock).not.toHaveBeenCalled()
            expect(interactionReplyMock).not.toHaveBeenCalled()
        })

        it('returns false, logs warning with context, and replies when queue is null', async () => {
            const interaction = createInteraction()
            const result = await requireQueue(null, interaction)

            expect(result).toBe(false)
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'requireQueue: no active queue',
                    data: expect.objectContaining({
                        commandName: 'test-command',
                        userId: '123456789',
                        guildId: '987654321',
                    }),
                }),
            )
            expect(errorEmbedMock).toHaveBeenCalledWith(
                'No Queue',
                'No music is playing. Use /play to start.',
            )
            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.not.objectContaining({ ephemeral: true }),
                }),
            )
        })
    })

    describe('requireCurrentTrack', () => {
        it('returns true and does not warn or reply when current track exists', async () => {
            const interaction = createInteraction()
            const queue = { currentTrack: { title: 'Test' } } as any
            const result = await requireCurrentTrack(queue, interaction)

            expect(result).toBe(true)
            expect(warnLogMock).not.toHaveBeenCalled()
            expect(interactionReplyMock).not.toHaveBeenCalled()
        })

        it('returns false, logs warning with context, and replies ephemerally when no current track', async () => {
            const interaction = createInteraction()
            const queue = { currentTrack: null } as any
            const result = await requireCurrentTrack(queue, interaction)

            expect(result).toBe(false)
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'requireCurrentTrack: no current track',
                    data: expect.objectContaining({
                        commandName: 'test-command',
                        userId: '123456789',
                    }),
                }),
            )
            expect(errorEmbedMock).toHaveBeenCalledWith(
                'Not Playing',
                'No track is currently playing.',
            )
            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({ ephemeral: true }),
                }),
            )
        })

        it('returns false when queue is null (treats as no current track)', async () => {
            const interaction = createInteraction()
            const result = await requireCurrentTrack(null, interaction)

            expect(result).toBe(false)
            expect(warnLogMock).toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })

    describe('requireIsPlaying', () => {
        it('returns true and does not warn or reply when music is playing', async () => {
            const interaction = createInteraction()
            const queue = { isPlaying: jest.fn().mockReturnValue(true) } as any
            const result = await requireIsPlaying(queue, interaction)

            expect(result).toBe(true)
            expect(warnLogMock).not.toHaveBeenCalled()
            expect(interactionReplyMock).not.toHaveBeenCalled()
        })

        it('returns false, logs warning with context, and replies ephemerally when not playing', async () => {
            const interaction = createInteraction()
            const queue = {
                isPlaying: jest.fn().mockReturnValue(false),
            } as any
            const result = await requireIsPlaying(queue, interaction)

            expect(result).toBe(false)
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'requireIsPlaying: not playing',
                    data: expect.objectContaining({
                        commandName: 'test-command',
                        userId: '123456789',
                    }),
                }),
            )
            expect(errorEmbedMock).toHaveBeenCalledWith(
                'Not Playing',
                'No music is currently playing.',
            )
            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({ ephemeral: true }),
                }),
            )
        })

        it('returns false when queue is null (treats as not playing)', async () => {
            const interaction = createInteraction()
            const result = await requireIsPlaying(null, interaction)

            expect(result).toBe(false)
            expect(warnLogMock).toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })

    describe('requireDJRole', () => {
        it('returns true when member is null (no member context)', async () => {
            const interaction = createInteraction({ member: null })
            const result = await requireDJRole(interaction, 'guild-1')
            expect(result).toBe(true)
            expect(interactionReplyMock).not.toHaveBeenCalled()
        })

        it('returns true when no djRoleId is configured (open to all)', async () => {
            getGuildSettingsMock.mockResolvedValue({ djRoleId: undefined })
            const member = createMockMember()
            const interaction = createInteraction({ member })
            const result = await requireDJRole(interaction, 'guild-1')
            expect(result).toBe(true)
        })

        it('returns true when settings are null', async () => {
            getGuildSettingsMock.mockResolvedValue(null)
            const member = createMockMember()
            const interaction = createInteraction({ member })
            const result = await requireDJRole(interaction, 'guild-1')
            expect(result).toBe(true)
        })

        it('returns false and replies when member lacks DJ role', async () => {
            getGuildSettingsMock.mockResolvedValue({ djRoleId: 'role-dj' })
            const member = createMockMember({ roles: { cache: { has: jest.fn().mockReturnValue(false) } } })
            const interaction = createInteraction({ member })
            const result = await requireDJRole(interaction, 'guild-1')
            expect(result).toBe(false)
            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({ content: expect.objectContaining({ ephemeral: true }) }),
            )
        })
    })
})
