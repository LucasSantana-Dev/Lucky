import { describe, expect, it, jest } from '@jest/globals'
import type { Message } from 'discord.js'
import { customCommandHandler } from '../customCommandHandler'
import type { MessageContext } from '../types'

jest.mock('@lucky/shared/services', () => ({
    customCommandService: {
        listCommands: jest.fn(),
        incrementUsage: jest.fn(),
        canUseCommand: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    getPrismaClient: jest.fn(),
    detectRolesFromText: jest.fn(),
    JOB_ALIASES: {},
}))

import { customCommandService } from '@lucky/shared/services'
import { getPrismaClient, detectRolesFromText } from '@lucky/shared/utils'

describe('customCommandHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(customCommandService.canUseCommand as jest.Mock).mockReturnValue(true)
    })

    describe('canHandle', () => {
        it('should return false when CUSTOM_COMMANDS feature toggle is false', async () => {
            const message = {
                author: { bot: false },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: false },
            }

            const result = await customCommandHandler.canHandle(
                message,
                context,
            )
            expect(result).toBe(false)
        })

        it('should return false when message is from a bot', async () => {
            const message = {
                author: { bot: true },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }

            const result = await customCommandHandler.canHandle(
                message,
                context,
            )
            expect(result).toBe(false)
        })

        it('should return true for valid non-bot message with CUSTOM_COMMANDS enabled', async () => {
            const message = {
                author: { bot: false },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }

            const result = await customCommandHandler.canHandle(
                message,
                context,
            )
            expect(result).toBe(true)
        })
    })

    describe('handle', () => {
        it('should return stop: false when no commands found', async () => {
            ;(customCommandService.listCommands as jest.Mock).mockResolvedValue(
                null,
            )

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                content: '!help',
                reply: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }

            const result = await customCommandHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(message.reply).not.toHaveBeenCalled()
        })

        it('should return stop: false when no command matches', async () => {
            ;(customCommandService.listCommands as jest.Mock).mockResolvedValue(
                [
                    {
                        name: 'hello',
                        response: 'Hello there!',
                    },
                ],
            )

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                content: 'goodbye',
                reply: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }

            const result = await customCommandHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(message.reply).not.toHaveBeenCalled()
        })

        it('should match exact trigger and reply', async () => {
            ;(customCommandService.listCommands as jest.Mock).mockResolvedValue(
                [
                    {
                        name: 'hello',
                        response: 'Hello there!',
                    },
                ],
            )
            ;(
                customCommandService.incrementUsage as jest.Mock
            ).mockResolvedValue(undefined)

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                content: 'hello',
                reply: jest.fn().mockResolvedValue(undefined),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }

            const result = await customCommandHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(message.reply).toHaveBeenCalledWith({
                content: 'Hello there!',
                allowedMentions: { repliedUser: false },
            })
            expect(customCommandService.incrementUsage).toHaveBeenCalledWith(
                'guild1',
                'hello',
            )
        })

        it('should match prefix trigger (trigger + space + args) and reply', async () => {
            ;(customCommandService.listCommands as jest.Mock).mockResolvedValue(
                [
                    {
                        name: 'greet',
                        response: 'Hi there!',
                    },
                ],
            )
            ;(
                customCommandService.incrementUsage as jest.Mock
            ).mockResolvedValue(undefined)

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                content: 'greet @user',
                reply: jest.fn().mockResolvedValue(undefined),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }

            const result = await customCommandHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(message.reply).toHaveBeenCalledWith({
                content: 'Hi there!',
                allowedMentions: { repliedUser: false },
            })
            expect(customCommandService.incrementUsage).toHaveBeenCalledWith(
                'guild1',
                'greet',
            )
        })

        it('should return stop: false after successful command execution', async () => {
            ;(customCommandService.listCommands as jest.Mock).mockResolvedValue(
                [{ name: 'help', response: 'Here is help' }],
            )
            ;(
                customCommandService.incrementUsage as jest.Mock
            ).mockResolvedValue(undefined)

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                content: 'help',
                reply: jest.fn().mockResolvedValue(undefined),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }

            const result = await customCommandHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })

        it('should handle empty command list', async () => {
            ;(customCommandService.listCommands as jest.Mock).mockResolvedValue(
                [],
            )

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                content: 'hello',
                reply: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }

            const result = await customCommandHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(message.reply).not.toHaveBeenCalled()
        })

        it('smart command posts to the target channel with detected role pings', async () => {
            ;(customCommandService.listCommands as jest.Mock).mockResolvedValue(
                [
                    {
                        name: 'vaga',
                        response: '📋 Nova vaga',
                        commandKind: 'job_post',
                        config: { targetChannelId: 'chan2' },
                    },
                ],
            )
            ;(
                customCommandService.incrementUsage as jest.Mock
            ).mockResolvedValue(undefined)
            ;(getPrismaClient as jest.Mock).mockReturnValue({
                reactionRoleMessage: {
                    findMany: jest.fn(() =>
                        Promise.resolve([
                            {
                                mappings: [{ label: 'Python', roleId: 'r-py' }],
                            },
                        ]),
                    ),
                },
            })
            ;(detectRolesFromText as jest.Mock).mockReturnValue([
                { label: 'Python', roleId: 'r-py' },
            ])

            const send = jest.fn().mockResolvedValue(undefined)
            const reply = jest.fn().mockResolvedValue(undefined)
            const message = {
                author: { id: 'user1', bot: false },
                content: 'vaga Dev Python remoto',
                channelId: 'c1',
                member: { roles: { cache: { map: () => [] } } },
                reply,
                guild: {
                    members: { me: {} },
                    channels: {
                        fetch: jest.fn(() =>
                            Promise.resolve({
                                id: 'chan2',
                                isTextBased: () => true,
                                permissionsFor: () => ({ has: () => true }),
                                send,
                            }),
                        ),
                    },
                },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }

            await customCommandHandler.handle(message, context)

            expect(send).toHaveBeenCalledTimes(1)
            const sent = (send.mock.calls[0] as unknown[])[0] as {
                content: string
                allowedMentions: { roles: string[] }
            }
            expect(sent.content).toContain('Dev Python remoto')
            expect(sent.content).toContain('<@&r-py>')
            expect(sent.allowedMentions.roles).toEqual(['r-py'])
            expect(reply).toHaveBeenCalled()
        })

        it('smart command without target channel replies in place', async () => {
            ;(customCommandService.listCommands as jest.Mock).mockResolvedValue(
                [{ name: 'vaga', response: '', commandKind: 'job_post' }],
            )
            ;(
                customCommandService.incrementUsage as jest.Mock
            ).mockResolvedValue(undefined)
            ;(getPrismaClient as jest.Mock).mockReturnValue({
                reactionRoleMessage: {
                    findMany: jest.fn(() =>
                        Promise.resolve([
                            { mappings: [{ label: 'X', roleId: 'r-x' }] },
                        ]),
                    ),
                },
            })
            ;(detectRolesFromText as jest.Mock).mockReturnValue([])

            const reply = jest.fn().mockResolvedValue(undefined)
            const message = {
                author: { id: 'user1', bot: false },
                content: 'vaga texto qualquer',
                channelId: 'c1',
                member: { roles: { cache: { map: () => [] } } },
                reply,
                guild: { members: { me: {} }, channels: { fetch: jest.fn() } },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }

            await customCommandHandler.handle(message, context)
            const replied = (reply.mock.calls[0] as unknown[])[0] as {
                content: string
            }
            expect(replied.content).toContain('texto qualquer')
        })

        function smartSetup(opts: {
            config?: Record<string, unknown>
            mappings?: unknown[]
            detected?: unknown[]
            channel?: Record<string, unknown> | null
            me?: unknown
            fetchMe?: unknown
            content?: string
        }) {
            ;(customCommandService.listCommands as jest.Mock).mockResolvedValue(
                [
                    {
                        name: 'vaga',
                        response: '',
                        commandKind: 'job_post',
                        config: opts.config ?? { targetChannelId: 'chan2' },
                    },
                ],
            )
            ;(
                customCommandService.incrementUsage as jest.Mock
            ).mockResolvedValue(undefined)
            ;(getPrismaClient as jest.Mock).mockReturnValue({
                reactionRoleMessage: {
                    findMany: jest.fn(() =>
                        Promise.resolve([
                            {
                                mappings: opts.mappings ?? [
                                    { label: 'Python', roleId: 'r-py' },
                                ],
                            },
                        ]),
                    ),
                },
            })
            ;(detectRolesFromText as jest.Mock).mockReturnValue(
                opts.detected ?? [{ label: 'Python', roleId: 'r-py' }],
            )
            const send = jest.fn().mockResolvedValue(undefined)
            const reply = jest.fn().mockResolvedValue(undefined)
            const channel =
                opts.channel === null
                    ? null
                    : {
                          id: 'chan2',
                          isTextBased: () => true,
                          permissionsFor: () => ({ has: () => true }),
                          send,
                          ...(opts.channel ?? {}),
                      }
            const message = {
                author: { id: 'user1', bot: false },
                content: opts.content ?? 'vaga Dev Python remoto',
                channelId: 'c1',
                member: { roles: { cache: { map: () => [] } } },
                reply,
                guild: {
                    members: {
                        me: 'me' in opts ? opts.me : {},
                        fetchMe: jest.fn(() =>
                            'fetchMe' in opts
                                ? Promise.resolve(opts.fetchMe)
                                : Promise.reject(new Error('no fetch')),
                        ),
                    },
                    channels: {
                        fetch: jest.fn(() => Promise.resolve(channel)),
                    },
                },
            } as unknown as Message
            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }
            return { message, context, send, reply }
        }

        it('SECURITY: denied canUseCommand never runs the smart path', async () => {
            const { message, context, send, reply } = smartSetup({})
            ;(customCommandService.canUseCommand as jest.Mock).mockReturnValue(
                false,
            )
            await customCommandHandler.handle(message, context)
            expect(send).not.toHaveBeenCalled()
            expect(reply).not.toHaveBeenCalled()
            expect(customCommandService.incrementUsage).not.toHaveBeenCalled()
        })

        it('warns when the guild has no reaction roles configured', async () => {
            const { message, context, send, reply } = smartSetup({
                mappings: [],
            })
            await customCommandHandler.handle(message, context)
            expect(send).not.toHaveBeenCalled()
            expect(
                (reply.mock.calls[0] as unknown[])[0] as { content: string },
            ).toMatchObject({
                content: expect.stringContaining('Nenhum cargo de reação'),
            })
        })

        it('warns when the target channel is invalid', async () => {
            const { message, context, send, reply } = smartSetup({
                channel: null,
            })
            await customCommandHandler.handle(message, context)
            expect(send).not.toHaveBeenCalled()
            expect(
                (reply.mock.calls[0] as unknown[])[0] as { content: string },
            ).toMatchObject({
                content: expect.stringContaining('Canal de destino inválido'),
            })
        })

        it('warns when the bot cannot post in the target channel', async () => {
            const { message, context, send, reply } = smartSetup({
                channel: { permissionsFor: () => ({ has: () => false }) },
            })
            await customCommandHandler.handle(message, context)
            expect(send).not.toHaveBeenCalled()
            expect(
                (reply.mock.calls[0] as unknown[])[0] as { content: string },
            ).toMatchObject({
                content: expect.stringContaining('Sem permissão'),
            })
        })

        it('fetches the bot member on cache miss instead of failing perms', async () => {
            const { message, context, send } = smartSetup({
                me: null,
                fetchMe: {},
            })
            await customCommandHandler.handle(message, context)
            expect(send).toHaveBeenCalledTimes(1)
        })

        it('rejects content over the 2000-char limit', async () => {
            const { message, context, send, reply } = smartSetup({
                content: 'vaga ' + 'x'.repeat(2100),
            })
            await customCommandHandler.handle(message, context)
            expect(send).not.toHaveBeenCalled()
            expect(
                (reply.mock.calls[0] as unknown[])[0] as { content: string },
            ).toMatchObject({
                content: expect.stringContaining('muito longo'),
            })
        })

        it('a failed confirmation ack does not skip usage accounting', async () => {
            const { message, context, send, reply } = smartSetup({})
            reply.mockRejectedValue(new Error('cannot reply'))
            await customCommandHandler.handle(message, context)
            expect(send).toHaveBeenCalledTimes(1)
            expect(customCommandService.incrementUsage).toHaveBeenCalled()
        })

        it('should handle error when listCommands throws', async () => {
            const error = new Error('Service error')
            ;(customCommandService.listCommands as jest.Mock).mockRejectedValue(
                error,
            )

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                content: 'hello',
                reply: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { CUSTOM_COMMANDS: true },
            }

            const result = await customCommandHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(message.reply).not.toHaveBeenCalled()
        })
    })
})
