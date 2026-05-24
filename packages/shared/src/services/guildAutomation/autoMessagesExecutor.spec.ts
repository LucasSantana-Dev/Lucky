import { describe, expect, it, jest } from '@jest/globals'
import { createAutoMessagesExecutor } from './autoMessagesExecutor'

type ServiceRow = {
    id: string
    channelId: string | null
    message: string | null
    enabled: boolean
} | null

type GetMessageFn = (guildId: string) => Promise<ServiceRow>
type CreateMessageFn = (
    guildId: string,
    type: 'welcome' | 'leave',
    data: { message: string },
    options?: { channelId?: string },
) => Promise<{ id: string }>
type UpdateMessageFn = (
    id: string,
    data: Record<string, unknown>,
) => Promise<void>

function makeService(
    overrides: Partial<{
        welcome: ServiceRow
        leave: ServiceRow
    }> = {},
) {
    return {
        getWelcomeMessage: jest
            .fn<GetMessageFn>()
            .mockResolvedValue(overrides.welcome ?? null),
        getLeaveMessage: jest
            .fn<GetMessageFn>()
            .mockResolvedValue(overrides.leave ?? null),
        createMessage: jest
            .fn<CreateMessageFn>()
            .mockImplementation(
                (
                    _guildId: string,
                    type: 'welcome' | 'leave',
                ): Promise<{ id: string }> =>
                    Promise.resolve({ id: `new-${type}` }),
            ),
        updateMessage: jest.fn<UpdateMessageFn>().mockResolvedValue(undefined),
    }
}

describe('autoMessagesExecutor', () => {
    it('Apply creates welcome and leave when neither exists', async () => {
        const service = makeService()
        const executor = createAutoMessagesExecutor({
            autoMessageService: service,
        })
        const ctx = { guildId: 'guild-1' }

        const live = await executor.capture(ctx)
        const diff = executor.diff(live, {
            welcome: { message: 'Hi', channelId: '1' },
            leave: { message: 'Bye', channelId: '2' },
        })
        const result = await executor.apply(diff, ctx)

        expect(service.createMessage).toHaveBeenCalledTimes(2)
        expect(service.createMessage).toHaveBeenCalledWith(
            'guild-1',
            'welcome',
            { message: 'Hi' },
            { channelId: '1' },
        )
        expect(service.createMessage).toHaveBeenCalledWith(
            'guild-1',
            'leave',
            { message: 'Bye' },
            { channelId: '2' },
        )
        expect(service.updateMessage).not.toHaveBeenCalled()
        expect(result).toEqual({
            status: 'success',
            applied: [
                { type: 'welcome', action: 'create' },
                { type: 'leave', action: 'create' },
            ],
        })
    })

    it('Apply updates welcome when row already exists; leaves leave untouched when manifest omits it', async () => {
        const service = makeService({
            welcome: {
                id: 'welcome-row',
                channelId: 'old-1',
                message: 'old hi',
                enabled: true,
            },
        })
        const executor = createAutoMessagesExecutor({
            autoMessageService: service,
        })
        const ctx = { guildId: 'guild-1' }

        const live = await executor.capture(ctx)
        const diff = executor.diff(live, {
            welcome: { message: 'new hi', channelId: 'new-1', enabled: false },
        })
        const result = await executor.apply(diff, ctx)

        expect(service.createMessage).not.toHaveBeenCalled()
        expect(service.updateMessage).toHaveBeenCalledTimes(1)
        expect(service.updateMessage).toHaveBeenCalledWith('welcome-row', {
            message: 'new hi',
            channelId: 'new-1',
            enabled: false,
        })
        expect(result).toEqual({
            status: 'success',
            applied: [
                { type: 'welcome', action: 'update' },
                { type: 'leave', action: 'noop' },
            ],
        })
    })

    it('Apply is noop when manifest payload has no message (matches monolith skip-on-empty behavior)', async () => {
        const service = makeService()
        const executor = createAutoMessagesExecutor({
            autoMessageService: service,
        })
        const ctx = { guildId: 'guild-1' }

        const live = await executor.capture(ctx)
        const diff = executor.diff(live, {
            welcome: { channelId: '1' }, // no message — should be noop
            leave: {},
        })
        const result = await executor.apply(diff, ctx)

        expect(service.createMessage).not.toHaveBeenCalled()
        expect(service.updateMessage).not.toHaveBeenCalled()
        expect(result).toEqual({
            status: 'success',
            applied: [
                { type: 'welcome', action: 'noop' },
                { type: 'leave', action: 'noop' },
            ],
        })
    })

    it('Apply is noop when manifest section is empty', async () => {
        const service = makeService()
        const executor = createAutoMessagesExecutor({
            autoMessageService: service,
        })
        const ctx = { guildId: 'guild-1' }

        const live = await executor.capture(ctx)
        const diff = executor.diff(live, {})
        const result = await executor.apply(diff, ctx)

        expect(service.createMessage).not.toHaveBeenCalled()
        expect(service.updateMessage).not.toHaveBeenCalled()
        expect(result).toEqual({
            status: 'success',
            applied: [
                { type: 'welcome', action: 'noop' },
                { type: 'leave', action: 'noop' },
            ],
        })
    })

    it('Apply returns partial result when some ops fail', async () => {
        const service = makeService()
        service.createMessage.mockRejectedValueOnce(
            new Error('Discord API error'),
        )
        const executor = createAutoMessagesExecutor({
            autoMessageService: service,
        })
        const ctx = { guildId: 'guild-1' }

        const live = await executor.capture(ctx)
        const diff = executor.diff(live, {
            welcome: { message: 'Hi', channelId: '1' },
            leave: { message: 'Bye', channelId: '2' },
        })
        const result = await executor.apply(diff, ctx)

        expect(result.status).toBe('partial')
        if (result.status === 'partial') {
            expect(result.applied).toEqual([
                { type: 'leave', action: 'create' },
            ])
            expect(result.errors).toHaveLength(1)
            expect(result.errors[0]).toMatchObject({
                opIndex: 0,
                opKind: 'create',
            })
        }
    })

    it('Apply returns failed result when all ops fail', async () => {
        const service = makeService()
        service.createMessage.mockRejectedValue(new Error('Discord API error'))
        const executor = createAutoMessagesExecutor({
            autoMessageService: service,
        })
        const ctx = { guildId: 'guild-1' }

        const live = await executor.capture(ctx)
        const diff = executor.diff(live, {
            welcome: { message: 'Hi', channelId: '1' },
            leave: { message: 'Bye', channelId: '2' },
        })
        const result = await executor.apply(diff, ctx)

        expect(result.status).toBe('failed')
        if (result.status === 'failed') {
            expect(result).toHaveProperty('error')
            expect(result.error).toMatch(/Discord API error/)
        }
    })
})
