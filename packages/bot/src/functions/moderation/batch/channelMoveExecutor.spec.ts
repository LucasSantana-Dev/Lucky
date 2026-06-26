import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { GuildPremiumTier, PermissionFlagsBits } from 'discord.js'

// Mock declarations first
const getClientMock = jest.fn()
const matchesScopeMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const buildMoveEmbedMock = jest.fn()
const fetchAttachmentsMock = jest.fn()
const partitionAttachmentsMock = jest.fn()
const getUploadLimitMock = jest.fn()
const batchJobServiceMock = {
    getById: jest.fn(),
}

jest.mock('../../../bot/clientStore', () => ({
    getStoredClient: () => getClientMock(),
    setClient: jest.fn(),
}))

jest.mock('@lucky/shared/services/batch', () => ({
    batchJobService: batchJobServiceMock,
    matchesScope: (...args: any[]) => matchesScopeMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: any[]) => debugLogMock(...args),
    errorLog: (...args: any[]) => errorLogMock(...args),
}))

jest.mock('../../../handlers/moveMessageHandler', () => ({
    buildMoveEmbed: (...args: any[]) => buildMoveEmbedMock(...args),
    fetchAttachments: (...args: any[]) => fetchAttachmentsMock(...args),
    partitionAttachments: (...args: any[]) => partitionAttachmentsMock(...args),
    getUploadLimit: (...args: any[]) => getUploadLimitMock(...args),
}))

import { ChannelMoveBatchExecutor } from './channelMoveExecutor'

describe('ChannelMoveBatchExecutor', () => {
    let executor: ChannelMoveBatchExecutor

    beforeEach(() => {
        jest.clearAllMocks()
        executor = new ChannelMoveBatchExecutor()
        buildMoveEmbedMock.mockReturnValue({ title: 'Moved' })
        fetchAttachmentsMock.mockResolvedValue([])
        partitionAttachmentsMock.mockReturnValue({ toUpload: [], tooLarge: [] })
        getUploadLimitMock.mockReturnValue(26214400)
    })

    describe('estimateMinutes', () => {
        test('estimates time based on message count', () => {
            const estimate = executor.estimateMinutes({ totalItems: 100 })
            expect(estimate).toBe(20)
        })

        test('clamps to minimum 1 minute', () => {
            const estimate = executor.estimateMinutes({ totalItems: 1 })
            expect(estimate).toBeGreaterThanOrEqual(1)
        })

        test('clamps to maximum 5000 minutes', () => {
            const estimate = executor.estimateMinutes({ totalItems: 100000 })
            expect(estimate).toBeLessThanOrEqual(5000)
        })
    })

    describe('execute', () => {
        test('throws when client unavailable', async () => {
            getClientMock.mockReturnValue(null)
            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }
            await expect(executor.execute(job, jest.fn())).rejects.toThrow(
                'client',
            )
        })

        test('throws when missing channel IDs', async () => {
            getClientMock.mockReturnValue({})
            const job = { id: 'j1', guildId: 'g1', totalItems: 1 }
            await expect(executor.execute(job, jest.fn())).rejects.toThrow(
                'required',
            )
        })

        test('throws when guild not found', async () => {
            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockRejectedValue(new Error('not found')),
                },
            })
            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }
            await expect(executor.execute(job, jest.fn())).rejects.toThrow(
                'Guild not found',
            )
        })

        test('throws when channels not text-based', async () => {
            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockResolvedValue({
                        channels: {
                            fetch: jest.fn().mockResolvedValue({
                                isTextBased: () => false,
                            }),
                        },
                    }),
                },
            })
            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }
            await expect(executor.execute(job, jest.fn())).rejects.toThrow(
                'not a text channel',
            )
        })

        test('throws when bot member not found', async () => {
            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockResolvedValue({
                        channels: {
                            fetch: jest.fn().mockResolvedValue({
                                isTextBased: () => true,
                            }),
                        },
                        members: { me: null },
                    }),
                },
            })
            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }
            await expect(executor.execute(job, jest.fn())).rejects.toThrow(
                'Bot member',
            )
        })

        test('throws when missing ManageMessages permission', async () => {
            const perms = {
                has: jest.fn(() => false),
            }
            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockResolvedValue({
                        channels: {
                            fetch: jest.fn().mockResolvedValue({
                                isTextBased: () => true,
                                permissionsFor: jest
                                    .fn()
                                    .mockReturnValue(perms),
                            }),
                        },
                        members: { me: { user: { tag: 'Bot#0' } } },
                    }),
                },
            })
            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }
            await expect(executor.execute(job, jest.fn())).rejects.toThrow(
                'Manage Messages',
            )
        })

        test('throws when missing dest permissions', async () => {
            const srcPerms = {
                has: (p: any) => p === PermissionFlagsBits.ManageMessages,
            }
            const dstPerms = { has: () => false }
            let callCount = 0
            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockResolvedValue({
                        channels: {
                            fetch: jest.fn().mockImplementation(() => {
                                callCount++
                                return Promise.resolve({
                                    isTextBased: () => true,
                                    permissionsFor: jest
                                        .fn()
                                        .mockReturnValue(
                                            callCount === 1
                                                ? srcPerms
                                                : dstPerms,
                                        ),
                                })
                            }),
                        },
                        members: { me: { user: { tag: 'Bot#0' } } },
                    }),
                },
            })
            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }
            await expect(executor.execute(job, jest.fn())).rejects.toThrow(
                'Send Messages',
            )
        })

        test('throws when batch job not found in db', async () => {
            batchJobServiceMock.getById.mockResolvedValue(null)
            const srcPerms = {
                has: () => true,
            }
            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockResolvedValue({
                        channels: {
                            fetch: jest.fn().mockResolvedValue({
                                isTextBased: () => true,
                                permissionsFor: jest
                                    .fn()
                                    .mockReturnValue(srcPerms),
                            }),
                        },
                        members: { me: { user: { tag: 'Bot#0' } } },
                    }),
                },
            })
            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }
            await expect(executor.execute(job, jest.fn())).rejects.toThrow(
                'not found',
            )
        })

        test('skips non-matching messages without deletion', async () => {
            matchesScopeMock.mockReturnValue(false)
            batchJobServiceMock.getById.mockResolvedValue({
                id: 'j1',
                scope: {},
            })

            const msg = {
                id: 'msg1',
                author: { id: 'u1' },
                content: 'test',
                createdAt: new Date(),
                attachments: new Map(),
                delete: jest.fn(),
            }

            const perms = { has: () => true }
            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockResolvedValue({
                        channels: {
                            fetch: jest.fn().mockResolvedValue({
                                isTextBased: () => true,
                                permissionsFor: jest
                                    .fn()
                                    .mockReturnValue(perms),
                                messages: {
                                    fetch: jest
                                        .fn()
                                        .mockResolvedValueOnce(
                                            new Map([['msg1', msg]]),
                                        )
                                        .mockResolvedValue(new Map()),
                                },
                            }),
                        },
                        premiumTier: GuildPremiumTier.None,
                        members: { me: { user: { tag: 'Bot#0' } } },
                    }),
                },
            })

            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }

            const result = await executor.execute(job, jest.fn())
            expect(msg.delete).not.toHaveBeenCalled()
            expect(result.skipped).toBe(1)
        })

        test('checkpoint BEFORE delete via callOrder', async () => {
            matchesScopeMock.mockReturnValue(true)
            batchJobServiceMock.getById.mockResolvedValue({
                id: 'j1',
                scope: {},
            })

            const callOrder: string[] = []
            const msg = {
                id: 'msg1',
                author: { id: 'u1' },
                content: 'test',
                createdAt: new Date(),
                attachments: new Map(),
                delete: jest.fn().mockImplementation(async () => {
                    callOrder.push('delete')
                }),
            }

            const perms = { has: () => true }
            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockResolvedValue({
                        channels: {
                            fetch: jest.fn().mockResolvedValue({
                                isTextBased: () => true,
                                permissionsFor: jest
                                    .fn()
                                    .mockReturnValue(perms),
                                messages: {
                                    fetch: jest
                                        .fn()
                                        .mockResolvedValueOnce(
                                            new Map([['msg1', msg]]),
                                        )
                                        .mockResolvedValue(new Map()),
                                },
                                send: jest.fn().mockResolvedValue({
                                    url: 'https://example.com',
                                }),
                            }),
                        },
                        premiumTier: GuildPremiumTier.None,
                        members: { me: { user: { tag: 'Bot#0' } } },
                    }),
                },
            })

            const onProgress = jest.fn().mockImplementation(async () => {
                callOrder.push('onProgress')
            })

            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }

            await executor.execute(job, onProgress)
            expect(callOrder[0]).toBe('onProgress')
            expect(callOrder[1]).toBe('delete')
        })

        test('failed send marks failed and continues', async () => {
            matchesScopeMock.mockReturnValue(true)
            batchJobServiceMock.getById.mockResolvedValue({
                id: 'j1',
                scope: {},
            })

            const msg = {
                id: 'msg1',
                author: { id: 'u1' },
                content: 'test',
                createdAt: new Date(),
                attachments: new Map(),
                delete: jest.fn(),
            }

            const perms = { has: () => true }
            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockResolvedValue({
                        channels: {
                            fetch: jest.fn().mockResolvedValue({
                                isTextBased: () => true,
                                permissionsFor: jest
                                    .fn()
                                    .mockReturnValue(perms),
                                messages: {
                                    fetch: jest
                                        .fn()
                                        .mockResolvedValueOnce(
                                            new Map([['msg1', msg]]),
                                        )
                                        .mockResolvedValue(new Map()),
                                },
                                send: jest
                                    .fn()
                                    .mockRejectedValue(
                                        new Error('Send failed'),
                                    ),
                            }),
                        },
                        premiumTier: GuildPremiumTier.None,
                        members: { me: { user: { tag: 'Bot#0' } } },
                    }),
                },
            })

            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }

            const result = await executor.execute(job, jest.fn())
            expect(msg.delete).not.toHaveBeenCalled()
            expect(result.failed).toBe(1)
        })

        test('detects cancellation between pages', async () => {
            matchesScopeMock.mockReturnValue(true)
            batchJobServiceMock.getById
                .mockResolvedValueOnce({ id: 'j1', scope: {} })
                .mockResolvedValueOnce({ id: 'j1', status: 'cancelled' })

            const msg = {
                id: 'msg1',
                author: { id: 'u1' },
                content: 'test',
                createdAt: new Date(),
                attachments: new Map(),
                delete: jest.fn(),
            }

            const perms = { has: () => true }
            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockResolvedValue({
                        channels: {
                            fetch: jest.fn().mockResolvedValue({
                                isTextBased: () => true,
                                permissionsFor: jest
                                    .fn()
                                    .mockReturnValue(perms),
                                messages: {
                                    fetch: jest
                                        .fn()
                                        .mockResolvedValueOnce(
                                            new Map([['msg1', msg]]),
                                        )
                                        .mockResolvedValueOnce(new Map()),
                                },
                                send: jest.fn().mockResolvedValue({
                                    url: 'https://example.com',
                                }),
                            }),
                        },
                        premiumTier: GuildPremiumTier.None,
                        members: { me: { user: { tag: 'Bot#0' } } },
                    }),
                },
            })

            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 2,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }

            const result = await executor.execute(job, jest.fn())
            expect(result.cancelled).toBe(true)
        })

        test('resumes from nextCursor', async () => {
            matchesScopeMock.mockReturnValue(true)
            batchJobServiceMock.getById.mockResolvedValue({
                id: 'j1',
                scope: {},
                nextCursor: 'before-this',
            })

            const msg = {
                id: 'msg2',
                author: { id: 'u1' },
                content: 'test',
                createdAt: new Date(),
                attachments: new Map(),
                delete: jest.fn(),
            }

            const perms = { has: () => true }
            const mockMessages = {
                fetch: jest
                    .fn()
                    .mockResolvedValueOnce(new Map([['msg2', msg]]))
                    .mockResolvedValue(new Map()),
            }

            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockResolvedValue({
                        channels: {
                            fetch: jest.fn().mockResolvedValue({
                                isTextBased: () => true,
                                permissionsFor: jest
                                    .fn()
                                    .mockReturnValue(perms),
                                messages: mockMessages,
                                send: jest.fn().mockResolvedValue({
                                    url: 'https://example.com',
                                }),
                            }),
                        },
                        premiumTier: GuildPremiumTier.None,
                        members: { me: { user: { tag: 'Bot#0' } } },
                    }),
                },
            })

            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }

            await executor.execute(job, jest.fn())
            expect(mockMessages.fetch).toHaveBeenCalledWith(
                expect.objectContaining({ before: 'before-this' }),
            )
        })

        test('returns summary with counts and URLs', async () => {
            matchesScopeMock.mockReturnValue(true)
            batchJobServiceMock.getById.mockResolvedValue({
                id: 'j1',
                scope: {},
            })

            const msg = {
                id: 'msg1',
                author: { id: 'u1' },
                content: 'test',
                createdAt: new Date(),
                attachments: new Map(),
                delete: jest.fn(),
            }

            const perms = { has: () => true }
            getClientMock.mockReturnValue({
                guilds: {
                    fetch: jest.fn().mockResolvedValue({
                        channels: {
                            fetch: jest.fn().mockResolvedValue({
                                isTextBased: () => true,
                                permissionsFor: jest
                                    .fn()
                                    .mockReturnValue(perms),
                                messages: {
                                    fetch: jest
                                        .fn()
                                        .mockResolvedValueOnce(
                                            new Map([['msg1', msg]]),
                                        )
                                        .mockResolvedValue(new Map()),
                                },
                                send: jest.fn().mockResolvedValue({
                                    url: 'https://discord.com/channels/g/c/m',
                                }),
                            }),
                        },
                        premiumTier: GuildPremiumTier.None,
                        members: { me: { user: { tag: 'Bot#0' } } },
                    }),
                },
            })

            const job = {
                id: 'j1',
                guildId: 'g1',
                totalItems: 1,
                sourceChannelId: 'c1',
                targetChannelId: 'c2',
            }

            const result = await executor.execute(job, jest.fn())
            expect(result.moved).toBe(1)
            expect(result.failed).toBe(0)
            expect(result.skipped).toBe(0)
            expect(result.movedUrls).toContain(
                'https://discord.com/channels/g/c/m',
            )
        })
    })
})
