import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const mockPrisma = {
    reminder: {
        create: jest.fn() as jest.MockedFunction<any>,
        findMany: jest.fn() as jest.MockedFunction<any>,
        delete: jest.fn() as jest.MockedFunction<any>,
        deleteMany: jest.fn() as jest.MockedFunction<any>,
        update: jest.fn() as jest.MockedFunction<any>,
    },
} as any

jest.mock('../utils/database/prismaClient.js', () => ({
    getPrismaClient: () => mockPrisma,
}))

import { ReminderService } from './ReminderService.js'

describe('ReminderService', () => {
    let service: ReminderService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new ReminderService()
    })

    describe('create', () => {
        test('creates a reminder with correct fields', async () => {
            const remindAt = new Date('2026-07-03T10:00:00Z')
            mockPrisma.reminder.create.mockResolvedValue({
                id: 'reminder-1',
                guildId: 'guild-1',
                userId: 'user-1',
                channelId: 'channel-1',
                message: 'Test reminder',
                remindAt,
                delivered: false,
                createdAt: new Date(),
            })

            const result = await service.create(
                'guild-1',
                'user-1',
                'channel-1',
                'Test reminder',
                remindAt,
            )

            expect(mockPrisma.reminder.create).toHaveBeenCalledWith({
                data: {
                    guildId: 'guild-1',
                    userId: 'user-1',
                    channelId: 'channel-1',
                    message: 'Test reminder',
                    remindAt,
                },
            })
            expect(result.id).toBe('reminder-1')
        })
    })

    describe('listPending', () => {
        test('lists pending reminders scoped to guild+user, remindAt asc', async () => {
            const date1 = new Date('2026-07-03T10:00:00Z')
            const date2 = new Date('2026-07-04T10:00:00Z')
            mockPrisma.reminder.findMany.mockResolvedValue([
                {
                    id: 'reminder-1',
                    guildId: 'guild-1',
                    userId: 'user-1',
                    channelId: 'channel-1',
                    message: 'First',
                    remindAt: date1,
                    delivered: false,
                    createdAt: new Date(),
                },
                {
                    id: 'reminder-2',
                    guildId: 'guild-1',
                    userId: 'user-1',
                    channelId: 'channel-1',
                    message: 'Second',
                    remindAt: date2,
                    delivered: false,
                    createdAt: new Date(),
                },
            ])

            const result = await service.listPending('guild-1', 'user-1', 10)

            expect(mockPrisma.reminder.findMany).toHaveBeenCalledWith({
                where: {
                    guildId: 'guild-1',
                    userId: 'user-1',
                    delivered: false,
                },
                orderBy: { remindAt: 'asc' },
                take: 10,
            })
            expect(result).toHaveLength(2)
            expect(result[0].id).toBe('reminder-1')
        })

        test('defaults to limit 10', async () => {
            mockPrisma.reminder.findMany.mockResolvedValue([])

            await service.listPending('guild-1', 'user-1')

            expect(mockPrisma.reminder.findMany).toHaveBeenCalledWith({
                where: {
                    guildId: 'guild-1',
                    userId: 'user-1',
                    delivered: false,
                },
                orderBy: { remindAt: 'asc' },
                take: 10,
            })
        })
    })

    describe('deleteOwned', () => {
        test('deletes only when guild+user own the reminder', async () => {
            mockPrisma.reminder.deleteMany.mockResolvedValue({ count: 1 })

            const ok = await service.deleteOwned(
                'guild-1',
                'user-1',
                'reminder-1',
            )

            expect(mockPrisma.reminder.deleteMany).toHaveBeenCalledWith({
                where: {
                    id: 'reminder-1',
                    guildId: 'guild-1',
                    userId: 'user-1',
                },
            })
            expect(ok).toBe(true)
        })

        test('returns false when nothing matched (not the owner)', async () => {
            mockPrisma.reminder.deleteMany.mockResolvedValue({ count: 0 })
            const ok = await service.deleteOwned('g', 'u', 'other')
            expect(ok).toBe(false)
        })
    })

    describe('getDueReminders', () => {
        test('fetches undelivered reminders with remindAt <= now', async () => {
            jest.useFakeTimers()
            const now = new Date()
            const pastDate = new Date(now.getTime() - 1000)
            mockPrisma.reminder.findMany.mockResolvedValue([
                {
                    id: 'reminder-1',
                    guildId: 'guild-1',
                    userId: 'user-1',
                    channelId: 'channel-1',
                    message: 'Due reminder',
                    remindAt: pastDate,
                    delivered: false,
                    createdAt: new Date(),
                },
            ])

            const result = await service.getDueReminders(25)

            const call = mockPrisma.reminder.findMany.mock.calls[0][0] as any
            expect(
                (call.where.remindAt.lte as Date).getTime(),
            ).toBeLessThanOrEqual(now.getTime())
            expect(call.where.delivered).toBe(false)
            expect(call.orderBy).toEqual({ remindAt: 'asc' })
            expect(call.take).toBe(25)
            expect(result).toHaveLength(1)

            jest.useRealTimers()
        })
    })

    describe('recordFailedAttempt', () => {
        test('increments the attempt counter and sets the next attempt time', async () => {
            ;(mockPrisma.reminder.update as any).mockResolvedValue({})
            const next = new Date('2026-07-03T10:05:00Z')

            await service.recordFailedAttempt('reminder-1', next)

            expect(mockPrisma.reminder.update).toHaveBeenCalledWith({
                where: { id: 'reminder-1' },
                data: {
                    remindAt: next,
                    deliveryAttempts: { increment: 1 },
                },
            })
        })
    })

    describe('markDelivered', () => {
        test('marks reminder as delivered', async () => {
            ;(mockPrisma.reminder.update as any).mockResolvedValue({})

            await service.markDelivered('reminder-1')

            expect(mockPrisma.reminder.update).toHaveBeenCalledWith({
                where: { id: 'reminder-1' },
                data: { delivered: true },
            })
        })
    })
})
