import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { Client, Collection } from 'discord.js'
import { createClient, startClient } from './service'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/config', () => ({
    config: jest.fn().mockReturnValue({
        TOKEN: 'test-token',
        CLIENT_ID: 'test-client-id',
    }),
}))

jest.mock('./presence', () => ({
    startPresenceRotation: jest.fn().mockReturnValue({
        stop: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
    }),
}))

jest.mock('../../services/MusicPresenceService', () => ({
    initMusicPresence: jest.fn(),
}))

jest.mock('../../utils/moderation/modDigestScheduler', () => ({
    modDigestSchedulerService: {
        start: jest.fn(),
        stop: jest.fn(),
    },
}))

jest.mock('discord.js', () => {
    const originalModule =
        jest.requireActual<typeof import('discord.js')>('discord.js')
    return {
        ...originalModule,
        Client: jest.fn().mockImplementation(() => ({
            commands: new originalModule.Collection(),
            login: jest.fn().mockResolvedValue('client'),
            once: jest.fn(),
            guilds: {
                cache: {
                    values: jest.fn().mockReturnValue([]),
                },
            },
        })),
        REST: jest.fn().mockImplementation(() => ({
            setToken: jest.fn().mockReturnThis(),
            put: jest.fn().mockResolvedValue(undefined),
        })),
    }
})

import { debugLog, infoLog, errorLog } from '@lucky/shared/utils'
import { config } from '@lucky/shared/config'

describe('service', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(config as jest.Mock).mockReturnValue({
            TOKEN: 'test-token',
            CLIENT_ID: 'test-client-id',
        })
    })

    describe('createClient', () => {
        it('should create a Discord client successfully', async () => {
            const client = await createClient()

            expect(Client).toHaveBeenCalledWith({
                intents: expect.arrayContaining([expect.any(Number)]),
            })
            expect(client.commands).toBeInstanceOf(Collection)
            expect(debugLog).toHaveBeenCalledWith({
                message: 'Discord client created successfully',
            })
        })

        it('should throw when TOKEN is missing', async () => {
            ;(config as jest.Mock).mockReturnValue({
                TOKEN: '',
                CLIENT_ID: 'test-client-id',
            })

            await expect(createClient()).rejects.toThrow(
                'DISCORD_TOKEN or CLIENT_ID not configured',
            )
        })

        it('should throw when CLIENT_ID is missing', async () => {
            ;(config as jest.Mock).mockReturnValue({
                TOKEN: 'test-token',
                CLIENT_ID: '',
            })

            await expect(createClient()).rejects.toThrow(
                'DISCORD_TOKEN or CLIENT_ID not configured',
            )
        })

        it('should log error when client creation fails', async () => {
            const error = new Error('Creation failed')
            ;(Client as unknown as jest.Mock).mockImplementationOnce(() => {
                throw error
            })

            await expect(createClient()).rejects.toThrow('Creation failed')

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error creating Discord client:',
                error,
            })
        })

        it('should set player to null initially', async () => {
            const client = await createClient()

            expect(client.player).toBeNull()
        })
    })

    describe('startClient', () => {
        it('should throw when TOKEN is missing', async () => {
            ;(config as jest.Mock).mockReturnValue({
                TOKEN: '',
                CLIENT_ID: 'test-client-id',
            })

            const mockClient = {
                login: jest.fn(),
            }

            await expect(
                startClient({ client: mockClient as any }),
            ).rejects.toThrow('DISCORD_TOKEN or CLIENT_ID not configured')
        })

        it('should throw when CLIENT_ID is missing', async () => {
            ;(config as jest.Mock).mockReturnValue({
                TOKEN: 'test-token',
                CLIENT_ID: '',
            })

            const mockClient = {
                login: jest.fn(),
            }

            await expect(
                startClient({ client: mockClient as any }),
            ).rejects.toThrow('DISCORD_TOKEN or CLIENT_ID not configured')
        })

        it('should call login with token', async () => {
            const mockClient = {
                login: jest.fn().mockResolvedValue('client'),
                once: jest.fn((event, handler) => {
                    if (event === 'ready') {
                        Promise.resolve().then(() => handler())
                    }
                }),
                user: null,
                commands: {
                    map: jest.fn().mockReturnValue([]),
                },
                guilds: {
                    cache: {
                        values: jest.fn().mockReturnValue([]),
                    },
                },
            }

            const startPromise = startClient({ client: mockClient as any })

            await new Promise((resolve) => setImmediate(resolve))

            expect(mockClient.login).toHaveBeenCalledWith('test-token')

            await startPromise
        })

        it('should register ready event handler', async () => {
            const mockClient = {
                login: jest.fn().mockResolvedValue('client'),
                once: jest.fn((event, handler) => {
                    if (event === 'ready') {
                        Promise.resolve().then(() => handler())
                    }
                }),
                user: null,
                commands: {
                    map: jest.fn().mockReturnValue([]),
                },
                guilds: {
                    cache: {
                        values: jest.fn().mockReturnValue([]),
                    },
                },
            }

            const startPromise = startClient({ client: mockClient as any })

            await new Promise((resolve) => setImmediate(resolve))

            expect(mockClient.once).toHaveBeenCalledWith(
                'ready',
                expect.any(Function),
            )

            await startPromise
        })

        it('should skip presence setup when user is null', async () => {
            const { startPresenceRotation } = await import('./presence')

            const mockClient = {
                login: jest.fn().mockResolvedValue('client'),
                once: jest.fn((event, handler) => {
                    if (event === 'ready') {
                        Promise.resolve().then(() => handler())
                    }
                }),
                user: null,
                commands: {
                    map: jest.fn().mockReturnValue([]),
                },
                guilds: {
                    cache: {
                        values: jest.fn().mockReturnValue([]),
                    },
                },
            }

            ;(startPresenceRotation as jest.Mock).mockClear()

            const startPromise = startClient({ client: mockClient as any })
            await new Promise((resolve) => setImmediate(resolve))
            await startPromise

            expect(startPresenceRotation).not.toHaveBeenCalled()
        })

        it('should handle errors in ready handler gracefully', async () => {
            const mockClient = {
                login: jest.fn().mockResolvedValue('client'),
                once: jest.fn((event, handler) => {
                    if (event === 'ready') {
                        Promise.resolve().then(() => handler())
                    }
                }),
                user: null,
                commands: {
                    map: jest.fn().mockImplementation(() => {
                        throw new Error('Test error')
                    }),
                },
                guilds: {
                    cache: {
                        values: jest.fn().mockReturnValue([]),
                    },
                },
            }

            const startPromise = startClient({ client: mockClient as any })
            await new Promise((resolve) => setImmediate(resolve))
            await startPromise

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error in ready handler:',
                error: expect.any(Error),
            })
        })
    })
})
