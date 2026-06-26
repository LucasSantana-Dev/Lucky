import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    Events,
    ChannelType,
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
const executeContextMenuMock = jest.fn()
const handleMoveMessageSelectMock = jest.fn()
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const debugLogMock = jest.fn()
const captureExceptionMock = jest.fn()
const namedSessionListMock = jest.fn()
const cleanupGuildStateMock = jest.fn()
const aiDevToolkitStartMock = jest.fn()
const handleReactionRolesMock = jest.fn()
const recordGuildJoinMock = jest.fn(async () => undefined)
const recordGuildLeaveMock = jest.fn(async () => undefined)
const syncGuildsOnReadyMock = jest.fn(async () => undefined)
const guildJoinsTotalIncMock = jest.fn()
const guildLeavesTotalIncMock = jest.fn()

jest.mock('../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
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

jest.mock('./commandsHandler', () => ({
    executeContextMenu: (...args: unknown[]) => executeContextMenuMock(...args),
}))

jest.mock('./moveMessageHandler', () => ({
    handleMoveMessageSelect: (...args: unknown[]) =>
        handleMoveMessageSelectMock(...args),
    MOVE_MESSAGE_SELECT_PREFIX: 'movemsg:',
}))

// Mock the batch worker — its real module pulls in BatchJobService → prismaClient
// (which uses import.meta) and is irrelevant to event routing.
jest.mock('../workers/batchJobWorker', () => ({
    // Plain functions (not jest.fn) so resetMocks doesn't wipe the Promise return.
    startBatchJobWorker: () => Promise.resolve(),
    stopBatchJobWorker: () => Promise.resolve(),
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

jest.mock('./player/trackNowPlaying', () => ({
    cleanupGuildState: (...args: unknown[]) => cleanupGuildStateMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    captureException: (...args: unknown[]) => captureExceptionMock(...args),
}))

jest.mock('../services/AiDevToolkitService', () => ({
    aiDevToolkitService: {
        start: (...args: unknown[]) => aiDevToolkitStartMock(...args),
    },
}))

jest.mock('../services/guildMembershipService', () => ({
    recordGuildJoin: async (...args: unknown[]) => recordGuildJoinMock(...args),
    recordGuildLeave: async (...args: unknown[]) =>
        recordGuildLeaveMock(...args),
    syncGuildsOnReady: async (...args: unknown[]) =>
        syncGuildsOnReadyMock(...args),
}))

jest.mock('../utils/monitoring/prometheus', () => ({
    guildJoinsTotal: {
        inc: (...args: unknown[]) => guildJoinsTotalIncMock(...args),
    },
    guildLeavesTotal: {
        inc: (...args: unknown[]) => guildLeavesTotalIncMock(...args),
    },
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
        guilds: {
            cache: { size: 0 },
        },
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
            isMessageContextMenuCommand: () => false,
            isChannelSelectMenu: () => false,
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

    it('routes a message context-menu interaction to executeContextMenu', async () => {
        const { client, onMock } = createMockClient()
        handleEvents(client as unknown as never)
        const interactionHandler = getInteractionCreateHandler(onMock)

        const interaction = {
            isAutocomplete: () => false,
            isButton: () => false,
            isMessageContextMenuCommand: () => true,
            isChannelSelectMenu: () => false,
            isChatInputCommand: () => false,
        } as unknown as Interaction

        interactionHandler?.(interaction)
        await flushAsyncHandlers()

        expect(executeContextMenuMock).toHaveBeenCalledWith({
            interaction,
            client,
        })
    })

    it('routes the move-message channel select to handleMoveMessageSelect', async () => {
        const { client, onMock } = createMockClient()
        handleEvents(client as unknown as never)
        const interactionHandler = getInteractionCreateHandler(onMock)

        const interaction = {
            isAutocomplete: () => false,
            isButton: () => false,
            isMessageContextMenuCommand: () => false,
            isChannelSelectMenu: () => true,
            isChatInputCommand: () => false,
            customId: 'movemsg:src:msg',
        } as unknown as Interaction

        interactionHandler?.(interaction)
        await flushAsyncHandlers()

        expect(handleMoveMessageSelectMock).toHaveBeenCalledWith(
            interaction,
            client,
        )
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
            isMessageContextMenuCommand: () => false,
            isChannelSelectMenu: () => false,
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

    it('captures command error to Sentry and attempts to reply', async () => {
        const { client, onMock } = createMockClient()
        const originalError = new Error('original command failure')
        client.commands.set('broken', {
            execute: jest.fn().mockRejectedValue(originalError),
        })
        const replyError = new Error('Discord API unavailable')
        interactionReplyMock.mockRejectedValueOnce(replyError)

        handleEvents(client as unknown as never)

        const interactionHandler = getInteractionCreateHandler(onMock)
        expect(interactionHandler).toBeDefined()

        interactionHandler?.({
            isAutocomplete: () => false,
            isButton: () => false,
            isMessageContextMenuCommand: () => false,
            isChannelSelectMenu: () => false,
            isChatInputCommand: () => true,
            commandName: 'broken',
            guildId: 'guild-123',
            user: { id: 'user-456' },
            replied: true,
            deferred: false,
        } as unknown as ChatInputCommandInteraction)

        await flushAsyncHandlers()

        // Original command error is captured in handleInteractionError
        expect(captureExceptionMock).toHaveBeenCalledWith(originalError, {
            command: 'broken',
            guildId: 'guild-123',
            userId: 'user-456',
        })
        // interactionReply is called to send user-friendly error
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction: expect.objectContaining({
                commandName: 'broken',
                guildId: 'guild-123',
            }),
            content: {
                content: 'Friendly error',
                ephemeral: true,
            },
        })
        // Note: reply failure is now captured inside interactionReply(),
        // not in the eventHandler
    })

    it('does not crash when createUserFriendlyError throws', async () => {
        const { client, onMock } = createMockClient()
        const originalError = new Error('original command failure')
        client.commands.set('broken', {
            execute: jest.fn().mockRejectedValue(originalError),
        })
        // Make createUserFriendlyError throw
        createUserFriendlyErrorMock.mockImplementation(() => {
            throw new Error('Failed to sanitize error')
        })

        handleEvents(client as unknown as never)

        const interactionHandler = getInteractionCreateHandler(onMock)
        expect(interactionHandler).toBeDefined()

        interactionHandler?.({
            isAutocomplete: () => false,
            isButton: () => false,
            isMessageContextMenuCommand: () => false,
            isChannelSelectMenu: () => false,
            isChatInputCommand: () => true,
            commandName: 'broken',
            guildId: 'guild-123',
            user: { id: 'user-456' },
            replied: true,
            deferred: false,
        } as unknown as ChatInputCommandInteraction)

        await flushAsyncHandlers()

        // Original error is still captured
        expect(captureExceptionMock).toHaveBeenCalledWith(originalError, {
            command: 'broken',
            guildId: 'guild-123',
            userId: 'user-456',
        })
        // Fallback reply is sent despite createUserFriendlyError throwing
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction: expect.objectContaining({
                commandName: 'broken',
                guildId: 'guild-123',
            }),
            content: {
                content:
                    'An unexpected error occurred. Please try again later.',
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

    describe('guild and channel cleanup', () => {
        function getGuildDeleteHandler(
            onMock: jest.Mock,
        ): ((guild: unknown) => Promise<void>) | undefined {
            const call = onMock.mock.calls.find(
                (args) => args[0] === Events.GuildDelete,
            )
            return call?.[1] as ((guild: unknown) => Promise<void>) | undefined
        }

        function getChannelDeleteHandler(
            onMock: jest.Mock,
        ): ((channel: unknown) => void) | undefined {
            const call = onMock.mock.calls.find(
                (args) => args[0] === Events.ChannelDelete,
            )
            return call?.[1] as ((channel: unknown) => void) | undefined
        }

        describe('handleGuildDelete', () => {
            it('calls cleanupGuildState when guild is deleted', async () => {
                const { client, onMock } = createMockClient()
                handleEvents(client as unknown as never)

                const handler = getGuildDeleteHandler(onMock)
                expect(handler).toBeDefined()

                const mockGuild = { id: 'guild-delete-123' }
                await handler?.(mockGuild)

                expect(cleanupGuildStateMock).toHaveBeenCalledWith(
                    'guild-delete-123',
                )
            })

            it('handles errors during guild cleanup gracefully', async () => {
                const { client, onMock } = createMockClient()
                cleanupGuildStateMock.mockImplementation(() => {
                    throw new Error('Cleanup failed')
                })

                handleEvents(client as unknown as never)

                const handler = getGuildDeleteHandler(onMock)
                const mockGuild = { id: 'guild-789' }

                await handler?.(mockGuild)

                expect(errorLogMock).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: expect.stringContaining(
                            'Error clearing history on guild delete',
                        ),
                    }),
                )
            })
        })

        describe('handleChannelDelete', () => {
            it('calls cleanupGuildState when text channel is deleted', () => {
                const { client, onMock } = createMockClient()
                handleEvents(client as unknown as never)

                const handler = getChannelDeleteHandler(onMock)
                expect(handler).toBeDefined()

                const mockChannel = {
                    guildId: 'guild-ch-123',
                    isDMBased: () => false,
                }

                handler?.(mockChannel)

                expect(cleanupGuildStateMock).toHaveBeenCalledWith(
                    'guild-ch-123',
                )
            })

            it('skips cleanup when channel is DM-based', () => {
                const { client, onMock } = createMockClient()
                handleEvents(client as unknown as never)

                const handler = getChannelDeleteHandler(onMock)
                const mockChannel = {
                    guildId: 'guild-unused',
                    isDMBased: () => true,
                }

                handler?.(mockChannel)

                expect(cleanupGuildStateMock).not.toHaveBeenCalled()
            })
        })
    })

    describe('client ready', () => {
        function getClientReadyHandler(
            onceMock: jest.Mock,
        ): ((client: unknown) => void) | undefined {
            const call = onceMock.mock.calls.find(
                (args) => args[0] === 'clientReady',
            )
            return call?.[1] as ((client: unknown) => void) | undefined
        }

        it('starts ai dev toolkit service when enabled', async () => {
            process.env.AI_DEV_TOOLKIT_BOARD_ENABLED = 'true'
            aiDevToolkitStartMock.mockResolvedValue(undefined)

            const { client, onceMock } = createMockClient()
            const mockClient = {
                ...client,
                user: { tag: 'TestBot#0001' },
            }

            handleEvents(mockClient as unknown as never)

            const handler = getClientReadyHandler(onceMock)
            handler?.(mockClient)

            await new Promise<void>((resolve) => setImmediate(resolve))

            expect(aiDevToolkitStartMock).toHaveBeenCalled()

            delete process.env.AI_DEV_TOOLKIT_BOARD_ENABLED
        })
    })

    describe('guild telemetry', () => {
        function getGuildCreateHandler(
            onMock: jest.Mock,
        ): ((guild: unknown) => void) | undefined {
            const call = onMock.mock.calls.find(
                (args) => args[0] === Events.GuildCreate,
            )
            return call?.[1] as ((guild: unknown) => void) | undefined
        }

        function getGuildDeleteHandler(
            onMock: jest.Mock,
        ): ((guild: unknown) => Promise<void>) | undefined {
            const call = onMock.mock.calls.find(
                (args) => args[0] === Events.GuildDelete,
            )
            return call?.[1] as ((guild: unknown) => Promise<void>) | undefined
        }

        describe('handleGuildCreate', () => {
            it('logs guild join with telemetry data', () => {
                const { client, onMock } = createMockClient()
                client.guilds = {
                    cache: { size: 42 },
                } as any

                handleEvents(client as unknown as never)

                const handler = getGuildCreateHandler(onMock)
                expect(handler).toBeDefined()

                handler?.({
                    id: 'guild-123',
                    name: 'Test Guild',
                    memberCount: 500,
                })

                expect(infoLogMock).toHaveBeenCalledWith({
                    message: 'Guild joined',
                    data: {
                        guildId: 'guild-123',
                        guildName: 'Test Guild',
                        memberCount: 500,
                        totalGuilds: 42,
                    },
                })
            })

            it('increments guild joins counter', () => {
                const { client, onMock } = createMockClient()
                client.guilds = {
                    cache: { size: 10 },
                } as any

                handleEvents(client as unknown as never)

                const handler = getGuildCreateHandler(onMock)
                handler?.({
                    id: 'new-guild',
                    name: 'New Guild',
                    memberCount: 100,
                })

                expect(guildJoinsTotalIncMock).toHaveBeenCalledTimes(1)
            })

            it('records guild join in the database', async () => {
                const { client, onMock } = createMockClient()
                client.guilds = {
                    cache: { size: 1 },
                } as any
                recordGuildJoinMock.mockResolvedValue(undefined)

                handleEvents(client as unknown as never)

                const handler = getGuildCreateHandler(onMock)
                handler?.({
                    id: 'db-test-guild',
                    name: 'DB Test Guild',
                    memberCount: 250,
                })

                await new Promise<void>((resolve) => setImmediate(resolve))

                expect(recordGuildJoinMock).toHaveBeenCalledWith({
                    id: 'db-test-guild',
                    name: 'DB Test Guild',
                    memberCount: 250,
                })
            })

            it('logs error if recording guild join fails', async () => {
                const { client, onMock } = createMockClient()
                client.guilds = {
                    cache: { size: 1 },
                } as any
                const dbError = new Error('Database error')
                recordGuildJoinMock.mockRejectedValueOnce(dbError)

                handleEvents(client as unknown as never)

                const handler = getGuildCreateHandler(onMock)
                handler?.({
                    id: 'error-guild',
                    name: 'Error Guild',
                    memberCount: 50,
                })

                await new Promise<void>((resolve) => setImmediate(resolve))

                expect(errorLogMock).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Error recording guild join',
                        error: dbError,
                    }),
                )
            })

            it('posts a utility onboarding message to a postable channel', async () => {
                const { client, onMock } = createMockClient()
                client.guilds = { cache: { size: 5 } } as any
                const sendMock = jest
                    .fn<() => Promise<void>>()
                    .mockResolvedValue(undefined)
                const systemChannel = {
                    type: ChannelType.GuildText,
                    send: sendMock,
                    permissionsFor: jest.fn(() => ({ has: () => true })),
                }

                handleEvents(client as unknown as never)
                getGuildCreateHandler(onMock)?.({
                    id: 'g-onboard',
                    name: 'Onboard Guild',
                    memberCount: 9,
                    members: { me: { id: 'bot' } },
                    systemChannel,
                    channels: { cache: { find: () => undefined } },
                })

                await new Promise<void>((resolve) => setImmediate(resolve))

                expect(sendMock).toHaveBeenCalledTimes(1)
                const embed = (
                    sendMock.mock.calls[0][0] as { embeds: { toJSON(): any }[] }
                ).embeds[0].toJSON()
                // verification-safety: pure utility, no invite/vote CTA
                expect(String(embed.description).toLowerCase()).not.toMatch(
                    /invite|vote/,
                )
            })

            it('skips onboarding when the bot cannot post (no throw)', async () => {
                const { client, onMock } = createMockClient()
                client.guilds = { cache: { size: 5 } } as any
                const sendMock = jest.fn()
                const systemChannel = {
                    type: ChannelType.GuildText,
                    send: sendMock,
                    permissionsFor: jest.fn(() => ({ has: () => false })),
                }

                handleEvents(client as unknown as never)
                getGuildCreateHandler(onMock)?.({
                    id: 'g-nopost',
                    name: 'No Post Guild',
                    memberCount: 9,
                    members: { me: { id: 'bot' } },
                    systemChannel,
                    channels: { cache: { find: () => undefined } },
                })

                await new Promise<void>((resolve) => setImmediate(resolve))

                expect(sendMock).not.toHaveBeenCalled()
            })
        })

        describe('handleGuildDelete', () => {
            it('logs guild leave with telemetry data', async () => {
                const { client, onMock } = createMockClient()
                client.guilds = {
                    cache: { size: 41 },
                } as any

                handleEvents(client as unknown as never)

                const handler = getGuildDeleteHandler(onMock)
                expect(handler).toBeDefined()

                await handler?.({
                    id: 'guild-456',
                    name: 'Departing Guild',
                    memberCount: 300,
                })

                expect(infoLogMock).toHaveBeenCalledWith({
                    message: 'Guild left',
                    data: {
                        guildId: 'guild-456',
                        guildName: 'Departing Guild',
                        memberCount: 300,
                        totalGuilds: 41,
                    },
                })
            })

            it('increments guild leaves counter', async () => {
                const { client, onMock } = createMockClient()
                client.guilds = {
                    cache: { size: 5 },
                } as any

                handleEvents(client as unknown as never)

                const handler = getGuildDeleteHandler(onMock)
                await handler?.({
                    id: 'remove-guild',
                    name: 'Remove Guild',
                    memberCount: 100,
                })

                expect(guildLeavesTotalIncMock).toHaveBeenCalledTimes(1)
            })

            it('records guild leave in the database', async () => {
                const { client, onMock } = createMockClient()
                client.guilds = {
                    cache: { size: 0 },
                } as any
                recordGuildLeaveMock.mockResolvedValue(undefined)

                handleEvents(client as unknown as never)

                const handler = getGuildDeleteHandler(onMock)
                await handler?.({
                    id: 'db-leave-guild',
                    name: 'DB Leave Guild',
                    memberCount: 75,
                })

                expect(recordGuildLeaveMock).toHaveBeenCalledWith(
                    'db-leave-guild',
                    'DB Leave Guild',
                )
            })

            it('logs error if recording guild leave fails', async () => {
                const { client, onMock } = createMockClient()
                client.guilds = {
                    cache: { size: 1 },
                } as any
                const dbError = new Error('Database connection lost')
                recordGuildLeaveMock.mockRejectedValueOnce(dbError)

                handleEvents(client as unknown as never)

                const handler = getGuildDeleteHandler(onMock)
                await handler?.({
                    id: 'error-leave-guild',
                    name: 'Error Leave Guild',
                    memberCount: 25,
                })

                expect(errorLogMock).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Error recording guild leave',
                        error: dbError,
                    }),
                )
            })
        })
    })
})
