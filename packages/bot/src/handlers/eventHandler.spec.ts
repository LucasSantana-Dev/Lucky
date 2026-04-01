import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    Events,
    type ChatInputCommandInteraction,
    type Interaction,
} from 'discord.js'
import handleEvents from './eventHandler'

const interactionReplyMock = jest.fn()
const createUserFriendlyErrorMock = jest.fn()
const handleMessageCreateMock = jest.fn()
const handleMemberEventsMock = jest.fn()
const handleAuditEventsMock = jest.fn()
const handleExternalScrobblerMock = jest.fn()
const handleReactionEventsMock = jest.fn()
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const debugLogMock = jest.fn()
const captureExceptionMock = jest.fn()

jest.mock('../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../utils/general/errorSanitizer', () => ({
    createUserFriendlyError: (...args: unknown[]) =>
        createUserFriendlyErrorMock(...args),
}))

jest.mock('./messageHandler', () => ({
    handleMessageCreate: (...args: unknown[]) =>
        handleMessageCreateMock(...args),
}))

jest.mock('./memberHandler', () => ({
    handleMemberEvents: (...args: unknown[]) => handleMemberEventsMock(...args),
}))

jest.mock('./auditHandler', () => ({
    handleAuditEvents: (...args: unknown[]) => handleAuditEventsMock(...args),
}))

jest.mock('./externalScrobbler', () => ({
    handleExternalScrobbler: (...args: unknown[]) =>
        handleExternalScrobblerMock(...args),
}))

jest.mock('./reactionHandler', () => ({
    handleReactionEvents: (...args: unknown[]) =>
        handleReactionEventsMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    captureException: (...args: unknown[]) => captureExceptionMock(...args),
}))

function createMockClient() {
    const onMock = jest.fn()
    const onceMock = jest.fn()
    const client = {
        on: onMock,
        once: onceMock,
        commands: new Map<
            string,
            { execute: (...args: unknown[]) => Promise<void> }
        >(),
    }

    return { client, onMock, onceMock }
}

function getInteractionCreateHandler(
    onMock: jest.Mock,
): ((interaction: Interaction) => void) | undefined {
    const call = onMock.mock.calls.find(
        (args) => args[0] === Events.InteractionCreate,
    )
    return call?.[1] as ((interaction: Interaction) => void) | undefined
}

describe('eventHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createUserFriendlyErrorMock.mockReturnValue('Friendly error')
    })

    // Drain all pending microtasks so fire-and-forget async handlers
    // (the .catch() wrapper in handleEvents) fully settle before assertions.
    const flushAsyncHandlers = () =>
        new Promise<void>((resolve) => setImmediate(resolve))

    it('replies with command-not-found message when command is missing', async () => {
        const { client, onMock } = createMockClient()
        handleEvents(client as unknown as never)

        const interactionHandler = getInteractionCreateHandler(onMock)
        expect(interactionHandler).toBeDefined()

        interactionHandler?.({
            isChatInputCommand: () => true,
            commandName: 'unknown',
            replied: false,
            deferred: false,
        } as unknown as Interaction)

        await flushAsyncHandlers()

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction: expect.objectContaining({ commandName: 'unknown' }),
            content: {
                content: 'This command is not available.',
                ephemeral: true,
            },
        })
    })

    it('sends user-friendly error reply when command execution fails', async () => {
        const { client, onMock } = createMockClient()
        client.commands.set('broken', {
            execute: jest.fn().mockRejectedValue(new Error('raw failure')),
        })
        handleEvents(client as unknown as never)

        const interactionHandler = getInteractionCreateHandler(onMock)
        expect(interactionHandler).toBeDefined()

        interactionHandler?.({
            isChatInputCommand: () => true,
            commandName: 'broken',
            replied: true,
            deferred: false,
        } as unknown as ChatInputCommandInteraction)

        await flushAsyncHandlers()

        expect(createUserFriendlyErrorMock).toHaveBeenCalledWith(
            expect.any(Error),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction: expect.objectContaining({ commandName: 'broken' }),
            content: {
                content: 'Friendly error',
                ephemeral: true,
            },
        })
    })
})
