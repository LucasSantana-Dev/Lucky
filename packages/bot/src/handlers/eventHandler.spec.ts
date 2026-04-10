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
const handleMusicButtonInteractionMock = jest.fn()
const handleButtonInteractionMock = jest.fn()
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const debugLogMock = jest.fn()
const captureExceptionMock = jest.fn()
const namedSessionListMock = jest.fn()

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

jest.mock('./musicButtonHandler', () => ({
    handleMusicButtonInteraction: (...args: unknown[]) =>
        handleMusicButtonInteractionMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    reactionRolesService: {
        handleButtonInteraction: (...args: unknown[]) =>
            handleButtonInteractionMock(...args),
    },
}))

jest.mock('../utils/music/namedSessions', () => ({
    namedSessionService: {
        list: (...args: unknown[]) => namedSessionListMock(...args),
    },
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

type AutocompleteMockOptions = {
    guildId?: string | null
    commandName?: string
    subcommand?: string | null
    focusedName?: string
    respondMock?: jest.Mock
}

function createAutocompleteInteraction(
    options: AutocompleteMockOptions = {},
): Interaction {
    const respondMock = options.respondMock ?? jest.fn()
    return {
        isAutocomplete: () => true,
        isChatInputCommand: () => false,
        guildId: options.guildId === undefined ? 'guild-1' : options.guildId,
        commandName: options.commandName ?? 'session',
        options: {
            getSubcommand: jest
                .fn()
                .mockReturnValue(options.subcommand ?? 'restore'),
            getFocused: jest.fn().mockReturnValue({
                name: options.focusedName ?? 'name',
                value: '',
            }),
        },
        respond: respondMock,
    } as unknown as Interaction
}

describe('eventHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createUserFriendlyErrorMock.mockReturnValue('Friendly error')
        namedSessionListMock.mockResolvedValue([])
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
            isAutocomplete: () => false,
            isButton: () => false,
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
            isAutocomplete: () => false,
            isButton: () => false,
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

    describe('handleAutocomplete', () => {
        async function dispatchAutocomplete(
            interaction: Interaction,
        ): Promise<void> {
            const { client, onMock } = createMockClient()
            handleEvents(client as unknown as never)
            const handler = getInteractionCreateHandler(onMock)
            handler?.(interaction)
            await flushAsyncHandlers()
        }

        it('responds with session name choices for restore subcommand', async () => {
            namedSessionListMock.mockResolvedValue([
                { name: 'chill-vibes' },
                { name: 'workout-mix' },
            ])
            const respondMock = jest.fn()
            const interaction = createAutocompleteInteraction({
                subcommand: 'restore',
                respondMock,
            })

            await dispatchAutocomplete(interaction)

            expect(namedSessionListMock).toHaveBeenCalledWith('guild-1')
            expect(respondMock).toHaveBeenCalledWith([
                { name: 'chill-vibes', value: 'chill-vibes' },
                { name: 'workout-mix', value: 'workout-mix' },
            ])
        })

        it('responds with session name choices for delete subcommand', async () => {
            namedSessionListMock.mockResolvedValue([{ name: 'party' }])
            const respondMock = jest.fn()
            const interaction = createAutocompleteInteraction({
                subcommand: 'delete',
                respondMock,
            })

            await dispatchAutocomplete(interaction)

            expect(respondMock).toHaveBeenCalledWith([
                { name: 'party', value: 'party' },
            ])
        })

        it('caps autocomplete response to the Discord limit of 25', async () => {
            namedSessionListMock.mockResolvedValue(
                Array.from({ length: 40 }, (_, i) => ({
                    name: `session-${i}`,
                })),
            )
            const respondMock = jest.fn()
            const interaction = createAutocompleteInteraction({
                respondMock,
            })

            await dispatchAutocomplete(interaction)

            const choices = respondMock.mock.calls[0]?.[0] as unknown[]
            expect(choices).toHaveLength(25)
        })

        it('responds with an empty list when guildId is missing', async () => {
            const respondMock = jest.fn()
            const interaction = createAutocompleteInteraction({
                guildId: null,
                respondMock,
            })

            await dispatchAutocomplete(interaction)

            expect(respondMock).toHaveBeenCalledWith([])
            expect(namedSessionListMock).not.toHaveBeenCalled()
        })

        it('responds with an empty list for unrelated commands', async () => {
            const respondMock = jest.fn()
            const interaction = createAutocompleteInteraction({
                commandName: 'play',
                subcommand: null,
                respondMock,
            })

            await dispatchAutocomplete(interaction)

            expect(respondMock).toHaveBeenCalledWith([])
            expect(namedSessionListMock).not.toHaveBeenCalled()
        })

        it('logs and swallows errors raised by the session service', async () => {
            namedSessionListMock.mockRejectedValue(new Error('redis down'))
            const respondMock = jest.fn()
            const interaction = createAutocompleteInteraction({
                respondMock,
            })

            await dispatchAutocomplete(interaction)

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error handling autocomplete:',
                    error: expect.any(Error),
                }),
            )
        })
    })

    describe('button interactions', () => {
        function createButtonInteraction(customId: string): Interaction {
            return {
                isAutocomplete: () => false,
                isChatInputCommand: () => false,
                isButton: () => true,
                customId,
            } as unknown as Interaction
        }

        async function dispatchButton(customId: string): Promise<void> {
            const { client, onMock } = createMockClient()
            handleEvents(client as unknown as never)
            const handler = getInteractionCreateHandler(onMock)
            handler?.(createButtonInteraction(customId))
            await flushAsyncHandlers()
        }

        beforeEach(() => {
            handleMusicButtonInteractionMock.mockResolvedValue(undefined)
            handleButtonInteractionMock.mockResolvedValue(undefined)
        })

        it('routes music_ buttons to handleMusicButtonInteraction', async () => {
            await dispatchButton('music_pause_resume')
            expect(handleMusicButtonInteractionMock).toHaveBeenCalledTimes(1)
            expect(handleButtonInteractionMock).not.toHaveBeenCalled()
        })

        it('routes queue_page buttons to handleMusicButtonInteraction', async () => {
            await dispatchButton('queue_page_2')
            expect(handleMusicButtonInteractionMock).toHaveBeenCalledTimes(1)
        })

        it('routes leaderboard_page buttons to handleMusicButtonInteraction', async () => {
            await dispatchButton('leaderboard_page_0')
            expect(handleMusicButtonInteractionMock).toHaveBeenCalledTimes(1)
        })

        it('routes other buttons to reactionRolesService', async () => {
            await dispatchButton('reaction_role_123')
            expect(handleButtonInteractionMock).toHaveBeenCalledTimes(1)
            expect(handleMusicButtonInteractionMock).not.toHaveBeenCalled()
        })
    })
})
