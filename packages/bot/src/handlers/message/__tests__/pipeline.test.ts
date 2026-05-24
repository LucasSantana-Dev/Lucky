import { describe, expect, it, jest } from '@jest/globals'
import type { Message } from 'discord.js'
import { MessagePipeline } from '../pipeline'
import type { MessageContext, MessageHandler } from '../types'

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

describe('MessagePipeline', () => {
    it('should register handlers in order', () => {
        const pipeline = new MessagePipeline()
        const handler1: MessageHandler = {
            name: 'Handler1',
            canHandle: jest.fn(async () => true),
            handle: jest.fn(async () => ({ stop: false })),
        }
        const handler2: MessageHandler = {
            name: 'Handler2',
            canHandle: jest.fn(async () => true),
            handle: jest.fn(async () => ({ stop: false })),
        }

        pipeline.register(handler1)
        pipeline.register(handler2)

        const result = pipeline.register(handler1)
        expect(result).toBe(pipeline)
    })

    it('should execute all handlers when none return stop:true', async () => {
        const pipeline = new MessagePipeline()
        const handler1: MessageHandler = {
            name: 'Handler1',
            canHandle: jest.fn(async () => true),
            handle: jest.fn(async () => ({ stop: false })),
        }
        const handler2: MessageHandler = {
            name: 'Handler2',
            canHandle: jest.fn(async () => true),
            handle: jest.fn(async () => ({ stop: false })),
        }

        pipeline.register(handler1).register(handler2)

        const message = {
            guild: { id: 'guild1' },
            member: { id: 'member1' },
        } as unknown as Message
        const context = {
            guild: message.guild,
            member: message.member,
            featureToggles: {},
        } as unknown as MessageContext

        await pipeline.execute(message, context)

        expect(handler1.handle).toHaveBeenCalledWith(message, context)
        expect(handler2.handle).toHaveBeenCalledWith(message, context)
    })

    it('should halt pipeline when handler returns stop:true', async () => {
        const pipeline = new MessagePipeline()
        const handler1: MessageHandler = {
            name: 'Handler1',
            canHandle: jest.fn(async () => true),
            handle: jest.fn(async () => ({ stop: true })),
        }
        const handler2: MessageHandler = {
            name: 'Handler2',
            canHandle: jest.fn(async () => true),
            handle: jest.fn(async () => ({ stop: false })),
        }

        pipeline.register(handler1).register(handler2)

        const message = {
            guild: { id: 'guild1' },
            member: { id: 'member1' },
        } as unknown as Message
        const context = {
            guild: message.guild,
            member: message.member,
            featureToggles: {},
        } as unknown as MessageContext

        await pipeline.execute(message, context)

        expect(handler1.handle).toHaveBeenCalled()
        expect(handler2.handle).not.toHaveBeenCalled()
    })

    it('should skip handler when canHandle returns false', async () => {
        const pipeline = new MessagePipeline()
        const handler1: MessageHandler = {
            name: 'Handler1',
            canHandle: jest.fn(async () => false),
            handle: jest.fn(async () => ({ stop: false })),
        }
        const handler2: MessageHandler = {
            name: 'Handler2',
            canHandle: jest.fn(async () => true),
            handle: jest.fn(async () => ({ stop: false })),
        }

        pipeline.register(handler1).register(handler2)

        const message = {
            guild: { id: 'guild1' },
            member: { id: 'member1' },
        } as unknown as Message
        const context = {
            guild: message.guild,
            member: message.member,
            featureToggles: {},
        } as unknown as MessageContext

        await pipeline.execute(message, context)

        expect(handler1.canHandle).toHaveBeenCalled()
        expect(handler1.handle).not.toHaveBeenCalled()
        expect(handler2.handle).toHaveBeenCalled()
    })

    it('should isolate errors - one handler error does not crash pipeline', async () => {
        const pipeline = new MessagePipeline()
        const handler1: MessageHandler = {
            name: 'Handler1',
            canHandle: jest.fn(async () => true),
            handle: jest.fn(async () => {
                throw new Error('Handler1 error')
            }),
        }
        const handler2: MessageHandler = {
            name: 'Handler2',
            canHandle: jest.fn(async () => true),
            handle: jest.fn(async () => ({ stop: false })),
        }

        pipeline.register(handler1).register(handler2)

        const message = {
            guild: { id: 'guild1' },
            member: { id: 'member1' },
        } as unknown as Message
        const context = {
            guild: message.guild,
            member: message.member,
            featureToggles: {},
        } as unknown as MessageContext

        await expect(pipeline.execute(message, context)).resolves.not.toThrow()
        expect(handler2.handle).toHaveBeenCalled()
    })

    it('should catch canHandle errors and continue', async () => {
        const pipeline = new MessagePipeline()
        const handler1: MessageHandler = {
            name: 'Handler1',
            canHandle: jest.fn(async () => {
                throw new Error('canHandle error')
            }),
            handle: jest.fn(async () => ({ stop: false })),
        }
        const handler2: MessageHandler = {
            name: 'Handler2',
            canHandle: jest.fn(async () => true),
            handle: jest.fn(async () => ({ stop: false })),
        }

        pipeline.register(handler1).register(handler2)

        const message = {
            guild: { id: 'guild1' },
            member: { id: 'member1' },
        } as unknown as Message
        const context = {
            guild: message.guild,
            member: message.member,
            featureToggles: {},
        } as unknown as MessageContext

        await expect(pipeline.execute(message, context)).resolves.not.toThrow()
        expect(handler2.handle).toHaveBeenCalled()
    })
})
