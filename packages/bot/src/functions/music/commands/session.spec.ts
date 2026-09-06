import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createInfoEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
    createSuccessEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
    createWarningEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
    createErrorEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: jest.fn(async () => true),
    requireVoiceChannel: jest.fn(async () => true),
}))

jest.mock('../../../services/musicManagement/namedSessions', () => ({
    namedSessionService: {
        save: jest.fn(),
        list: jest.fn(),
        delete: jest.fn(),
        restore: jest.fn(),
    },
}))

jest.mock('../../../handlers/queueHandler', () => ({
    createQueue: jest.fn(),
    queueConnect: jest.fn(async () => undefined),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

import sessionCommand from './session'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    requireGuild,
    requireVoiceChannel,
} from '../../../utils/command/commandValidations'
import { namedSessionService } from '../../../services/musicManagement/namedSessions'
import { createQueue, queueConnect } from '../../../handlers/queueHandler'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'

const createInteraction = (
    subcommand: string,
    options: { name?: string | null } = {},
) => ({
    guildId: 'guild-1',
    user: { id: 'user-1' },
    options: {
        getSubcommand: jest.fn(() => subcommand),
        getString: jest.fn(() => options.name ?? null),
    },
})

const execute = sessionCommand.execute as (params: {
    client: unknown
    interaction: ReturnType<typeof createInteraction>
}) => Promise<void>

describe('session command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(requireGuild as jest.Mock).mockResolvedValue(true)
        ;(requireVoiceChannel as jest.Mock).mockResolvedValue(true)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue: null })
        ;(queueConnect as jest.Mock).mockResolvedValue(undefined)
    })

    it('stops before doing anything when not in a guild', async () => {
        ;(requireGuild as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction('list') as any,
        })

        expect(namedSessionService.list).not.toHaveBeenCalled()
    })

    describe('save', () => {
        it('warns when there is no active queue', async () => {
            ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue: null })

            await execute({
                client: {},
                interaction: createInteraction('save', {
                    name: 'Party-Mix',
                }) as any,
            })

            expect(namedSessionService.save).not.toHaveBeenCalled()
            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'No active queue',
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        it('lowercases the session name before saving', async () => {
            const queue = { id: 'queue-1' }
            ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })
            ;(namedSessionService.save as jest.Mock).mockResolvedValue({
                name: 'party-mix',
                trackCount: 5,
            })

            await execute({
                client: {},
                interaction: createInteraction('save', {
                    name: 'Party-Mix',
                }) as any,
            })

            expect(namedSessionService.save).toHaveBeenCalledWith(
                queue,
                'party-mix',
                'user-1',
            )
        })

        it('warns when the service refuses to save (duplicate/invalid/limit)', async () => {
            ;(resolveGuildQueue as jest.Mock).mockReturnValue({
                queue: { id: 'queue-1' },
            })
            ;(namedSessionService.save as jest.Mock).mockResolvedValue(null)

            await execute({
                client: {},
                interaction: createInteraction('save', {
                    name: 'party-mix',
                }) as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Could not save session',
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        it('reports success with the saved track count', async () => {
            ;(resolveGuildQueue as jest.Mock).mockReturnValue({
                queue: { id: 'queue-1' },
            })
            ;(namedSessionService.save as jest.Mock).mockResolvedValue({
                name: 'party-mix',
                trackCount: 7,
            })

            await execute({
                client: {},
                interaction: createInteraction('save', {
                    name: 'party-mix',
                }) as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Session saved',
                            description: '**party-mix** — 7 tracks',
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })
    })

    describe('list', () => {
        it('shows an empty-state message when there are no sessions', async () => {
            ;(namedSessionService.list as jest.Mock).mockResolvedValue([])

            await execute({
                client: {},
                interaction: createInteraction('list') as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'No saved sessions',
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        it('lists each saved session with name, track count, owner, and age', async () => {
            const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000
            ;(namedSessionService.list as jest.Mock).mockResolvedValue([
                {
                    name: 'party-mix',
                    trackCount: 3,
                    savedBy: 'user-1',
                    savedAt: fifteenMinutesAgo,
                },
            ])

            await execute({
                client: {},
                interaction: createInteraction('list') as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Saved Sessions',
                            description: expect.stringContaining(
                                '**party-mix** — 3 tracks, saved by <@user-1> 15m ago',
                            ),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })
    })

    describe('delete', () => {
        it('reports success when the session existed', async () => {
            ;(namedSessionService.delete as jest.Mock).mockResolvedValue(true)

            await execute({
                client: {},
                interaction: createInteraction('delete', {
                    name: 'party-mix',
                }) as any,
            })

            expect(namedSessionService.delete).toHaveBeenCalledWith(
                'guild-1',
                'party-mix',
            )
            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Session deleted',
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        it('reports not-found when the session did not exist', async () => {
            ;(namedSessionService.delete as jest.Mock).mockResolvedValue(false)

            await execute({
                client: {},
                interaction: createInteraction('delete', {
                    name: 'missing',
                }) as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Session not found',
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        it('does not require a voice channel to delete', async () => {
            ;(namedSessionService.delete as jest.Mock).mockResolvedValue(true)

            await execute({
                client: {},
                interaction: createInteraction('delete', {
                    name: 'party-mix',
                }) as any,
            })

            expect(requireVoiceChannel).not.toHaveBeenCalled()
        })
    })

    describe('restore', () => {
        it('stops when the caller is not in a voice channel', async () => {
            ;(requireVoiceChannel as jest.Mock).mockResolvedValue(false)

            await execute({
                client: {},
                interaction: createInteraction('restore', {
                    name: 'party-mix',
                }) as any,
            })

            expect(namedSessionService.restore).not.toHaveBeenCalled()
        })

        it('creates a queue when none exists yet', async () => {
            ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue: null })
            const createdQueue = { id: 'new-queue' }
            ;(createQueue as jest.Mock).mockResolvedValue(createdQueue)
            ;(namedSessionService.restore as jest.Mock).mockResolvedValue({
                restoredCount: 2,
            })

            await execute({
                client: {},
                interaction: createInteraction('restore', {
                    name: 'party-mix',
                }) as any,
            })

            expect(createQueue).toHaveBeenCalled()
            expect(queueConnect).toHaveBeenCalledWith({
                queue: createdQueue,
                interaction: expect.anything(),
            })
        })

        it('reuses an existing queue instead of creating a new one', async () => {
            const existingQueue = { id: 'existing-queue' }
            ;(resolveGuildQueue as jest.Mock).mockReturnValue({
                queue: existingQueue,
            })
            ;(namedSessionService.restore as jest.Mock).mockResolvedValue({
                restoredCount: 2,
            })

            await execute({
                client: {},
                interaction: createInteraction('restore', {
                    name: 'party-mix',
                }) as any,
            })

            expect(createQueue).not.toHaveBeenCalled()
            expect(queueConnect).toHaveBeenCalledWith({
                queue: existingQueue,
                interaction: expect.anything(),
            })
        })

        it('reports a connection error when queueConnect rejects', async () => {
            ;(resolveGuildQueue as jest.Mock).mockReturnValue({
                queue: { id: 'queue-1' },
            })
            ;(queueConnect as jest.Mock).mockRejectedValueOnce(
                new Error('voice connect timeout'),
            )

            await execute({
                client: {},
                interaction: createInteraction('restore', {
                    name: 'party-mix',
                }) as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Connection error',
                        }),
                    ],
                    ephemeral: true,
                },
            })
            expect(namedSessionService.restore).not.toHaveBeenCalled()
        })

        it('reports not-found when the service restores zero tracks', async () => {
            ;(resolveGuildQueue as jest.Mock).mockReturnValue({
                queue: { id: 'queue-1' },
            })
            ;(namedSessionService.restore as jest.Mock).mockResolvedValue({
                restoredCount: 0,
            })

            await execute({
                client: {},
                interaction: createInteraction('restore', {
                    name: 'missing',
                }) as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Session not found',
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        it('reports success with the restored track count', async () => {
            ;(resolveGuildQueue as jest.Mock).mockReturnValue({
                queue: { id: 'queue-1' },
            })
            ;(namedSessionService.restore as jest.Mock).mockResolvedValue({
                restoredCount: 4,
            })

            await execute({
                client: {},
                interaction: createInteraction('restore', {
                    name: 'party-mix',
                }) as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Session restored',
                            description:
                                'Restored 4 tracks from **party-mix**.',
                        }),
                    ],
                },
            })
        })
    })
})
