import { createMockInteraction } from '../__mocks__/discord'

const executeCommandMock = jest.fn()
const handleMusicButtonInteractionMock = jest.fn()
const monitorInteractionHandlingMock = jest.fn()
const errorLogMock = jest.fn()
const debugLogMock = jest.fn()
const createUserFriendlyErrorMock = jest.fn((err: unknown) =>
    err instanceof Error ? err.message : 'error',
)
const interactionReplyMock = jest.fn().mockResolvedValue(undefined)
const errorEmbedMock = jest.fn((_title: string, desc: string) => ({
    description: desc,
}))
const handleButtonInteractionMock = jest.fn()

jest.mock('../../src/handlers/commandsHandler', () => ({
    executeCommand: (...args: unknown[]) => executeCommandMock(...args),
}))

jest.mock('../../src/handlers/musicButtonHandler', () => ({
    handleMusicButtonInteraction: (...args: unknown[]) =>
        handleMusicButtonInteractionMock(...args),
}))

jest.mock('../../src/utils/monitoring', () => ({
    monitorInteractionHandling: (...args: unknown[]) =>
        monitorInteractionHandlingMock(...args),
}))

jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
    createUserFriendlyError: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    createUserFriendlyError: (...args: unknown[]) =>
        createUserFriendlyErrorMock(...args),
}))

jest.mock('../../src/utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../src/utils/general/embeds', () => ({
    errorEmbed: (...args: unknown[]) => errorEmbedMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    reactionRolesService: {
        handleButtonInteraction: (...args: unknown[]) =>
            handleButtonInteractionMock(...args),
    },
}))

import { handleInteraction } from '../../src/handlers/interactionHandler'

function createClient() {
    return {} as any
}

function createChatInteraction(overrides: Record<string, unknown> = {}) {
    const base = createMockInteraction(overrides)
    return {
        ...base,
        type: 2,
        commandName: (overrides.commandName as string) ?? 'test',
        isButton: () => false,
    } as any
}

function createButtonInteraction(customId: string) {
    return {
        type: 3,
        user: { id: 'user-1' },
        guild: { id: 'guild-1' },
        customId,
        replied: false,
        deferred: false,
        isChatInputCommand: () => false,
        isButton: () => true,
    } as any
}

function createUnknownInteraction() {
    return {
        type: 5,
        user: { id: 'user-1' },
        guild: { id: 'guild-1' },
        replied: false,
        deferred: false,
        isChatInputCommand: () => false,
        isButton: () => false,
    } as any
}

describe('handleInteraction', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        executeCommandMock.mockResolvedValue(undefined)
        handleMusicButtonInteractionMock.mockResolvedValue(undefined)
        handleButtonInteractionMock.mockResolvedValue(undefined)
    })

    it('calls executeCommand for chat input commands', async () => {
        const interaction = createChatInteraction()
        const client = createClient()

        await handleInteraction(interaction, client)

        expect(executeCommandMock).toHaveBeenCalledWith({ interaction, client })
        expect(monitorInteractionHandlingMock).toHaveBeenCalled()
    })

    it('calls handleMusicButtonInteraction for music_ prefixed buttons', async () => {
        const interaction = createButtonInteraction('music_play')
        const client = createClient()

        await handleInteraction(interaction, client)

        expect(handleMusicButtonInteractionMock).toHaveBeenCalledWith(
            interaction,
        )
        expect(handleButtonInteractionMock).not.toHaveBeenCalled()
    })

    it('calls handleMusicButtonInteraction for queue_page prefixed buttons', async () => {
        const interaction = createButtonInteraction('queue_page_2')
        const client = createClient()

        await handleInteraction(interaction, client)

        expect(handleMusicButtonInteractionMock).toHaveBeenCalledWith(
            interaction,
        )
    })

    it('calls handleMusicButtonInteraction for leaderboard_page prefixed buttons', async () => {
        const interaction = createButtonInteraction('leaderboard_page_1')
        const client = createClient()

        await handleInteraction(interaction, client)

        expect(handleMusicButtonInteractionMock).toHaveBeenCalledWith(
            interaction,
        )
        expect(handleButtonInteractionMock).not.toHaveBeenCalled()
    })

    it('calls reactionRolesService for non-music buttons', async () => {
        const interaction = createButtonInteraction('role_123')
        const client = createClient()

        await handleInteraction(interaction, client)

        expect(handleButtonInteractionMock).toHaveBeenCalledWith(interaction)
        expect(handleMusicButtonInteractionMock).not.toHaveBeenCalled()
    })

    it('does nothing special for non-command non-button interactions', async () => {
        const interaction = createUnknownInteraction()
        const client = createClient()

        await handleInteraction(interaction, client)

        expect(executeCommandMock).not.toHaveBeenCalled()
        expect(handleMusicButtonInteractionMock).not.toHaveBeenCalled()
        expect(handleButtonInteractionMock).not.toHaveBeenCalled()
    })

    it('logs error with commandName when chat command throws', async () => {
        const interaction = createChatInteraction({ commandName: 'play' })
        const client = createClient()
        const err = new Error('command failed')
        executeCommandMock.mockRejectedValue(err)

        await handleInteraction(interaction, client)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error handling interaction:',
                error: err,
                data: expect.objectContaining({ commandName: 'play' }),
            }),
        )
    })

    it('logs error with customId when button interaction throws', async () => {
        const interaction = createButtonInteraction('role_abc')
        const client = createClient()
        const err = new Error('button failed')
        handleButtonInteractionMock.mockRejectedValue(err)

        await handleInteraction(interaction, client)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ commandName: 'role_abc' }),
            }),
        )
    })

    it('logs error with unknown commandName for other interaction types', async () => {
        const interaction = createUnknownInteraction()
        const client = createClient()

        Object.defineProperty(interaction, 'isChatInputCommand', {
            value: () => {
                throw new Error('unexpected')
            },
        })

        // Since isChatInputCommand throws, monitorInteractionHandling fires first
        // then catch block runs with interaction methods that return false
        const safeInteraction = {
            ...interaction,
            isChatInputCommand: () => false,
            isButton: () => false,
        }

        // Wrap to simulate error inside the try block
        const throwingInteraction = {
            ...safeInteraction,
            isButton: jest.fn().mockImplementationOnce(() => {
                throw new Error('unexpected')
            }),
        }

        await handleInteraction(throwingInteraction as any, client)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error handling interaction:',
            }),
        )
    })

    it('sends error reply for unhandled chat command errors when not replied', async () => {
        const interaction = createChatInteraction({ commandName: 'queue' })
        const client = createClient()
        const err = new Error('queue failed')
        executeCommandMock.mockRejectedValue(err)
        createUserFriendlyErrorMock.mockReturnValue('Queue failed')

        await handleInteraction(interaction, client)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({ ephemeral: true }),
            }),
        )
    })

    it('does not send error reply when chat command already replied', async () => {
        const interaction = {
            ...createChatInteraction({ commandName: 'play' }),
            replied: true,
            deferred: false,
        }
        const client = createClient()
        executeCommandMock.mockRejectedValue(new Error('fail'))

        await handleInteraction(interaction, client)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('does not send error reply when chat command already deferred', async () => {
        const interaction = {
            ...createChatInteraction({ commandName: 'play' }),
            replied: false,
            deferred: true,
        }
        const client = createClient()
        executeCommandMock.mockRejectedValue(new Error('fail'))

        await handleInteraction(interaction, client)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('logs replyError when error reply itself throws', async () => {
        const interaction = createChatInteraction({ commandName: 'play' })
        const client = createClient()
        executeCommandMock.mockRejectedValue(new Error('cmd fail'))
        const replyErr = new Error('reply also failed')
        interactionReplyMock.mockRejectedValue(replyErr)

        await handleInteraction(interaction, client)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error sending error message:',
                error: replyErr,
            }),
        )
    })

    it('includes userId and guildId in error log', async () => {
        const interaction = createChatInteraction({ commandName: 'skip' })
        const client = createClient()
        executeCommandMock.mockRejectedValue(new Error('skip failed'))

        await handleInteraction(interaction, client)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    userId: '123456789',
                    guildId: '987654321',
                }),
            }),
        )
    })
})
