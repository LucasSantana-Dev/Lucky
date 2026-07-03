import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const reminderServiceMock = {
    getDueReminders: jest.fn() as jest.MockedFunction<any>,
    markDelivered: jest.fn() as jest.MockedFunction<any>,
    recordFailedAttempt: jest.fn() as jest.MockedFunction<any>,
}

jest.mock('@lucky/shared/services', () => ({
    reminderService: reminderServiceMock,
    MAX_DELIVERY_ATTEMPTS: 12,
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))
jest.mock('@lucky/shared/constants', () => ({ COLOR: { LUCKY_PURPLE: 0 } }))

import { ReminderScheduler } from './reminderScheduler'

function makeReminder(overrides: Record<string, unknown> = {}) {
    return {
        id: 'r1',
        guildId: 'g1',
        userId: 'u1',
        channelId: 'c1',
        message: 'hi',
        remindAt: new Date('2026-07-03T10:00:00Z'),
        delivered: false,
        deliveryAttempts: 0,
        createdAt: new Date('2026-07-03T09:00:00Z'),
        ...overrides,
    }
}

/** Minimal Discord client whose DM + channel sends both fail. */
function failingClient() {
    return {
        users: { fetch: jest.fn().mockRejectedValue(new Error('dm closed')) },
        channels: { fetch: jest.fn().mockRejectedValue(new Error('no chan')) },
    } as never
}

/** Client whose DM send succeeds. */
function deliveringClient() {
    return {
        users: {
            fetch: jest
                .fn()
                .mockResolvedValue({ send: jest.fn().mockResolvedValue(undefined) }),
        },
        channels: { fetch: jest.fn() },
    } as never
}

describe('ReminderScheduler.tick', () => {
    let scheduler: ReminderScheduler

    beforeEach(() => {
        jest.clearAllMocks()
        scheduler = new ReminderScheduler()
    })

    /** Runs one tick with the given client + due rows, then stops the timer. */
    async function runTick(
        client: ReturnType<typeof deliveringClient>,
        due: ReturnType<typeof makeReminder>[],
    ) {
        reminderServiceMock.getDueReminders.mockResolvedValue(due)
        scheduler.start(client)
        // start() fires an immediate tick; let its microtasks settle.
        await new Promise((r) => setImmediate(r))
        scheduler.stop()
    }

    it('marks a reminder delivered when it reaches the user', async () => {
        await runTick(deliveringClient(), [makeReminder()])

        expect(reminderServiceMock.markDelivered).toHaveBeenCalledWith('r1')
        expect(reminderServiceMock.recordFailedAttempt).not.toHaveBeenCalled()
    })

    it('backs off (records a failed attempt) when delivery fails below the cap', async () => {
        await runTick(failingClient(), [makeReminder({ deliveryAttempts: 2 })])

        expect(reminderServiceMock.recordFailedAttempt).toHaveBeenCalledTimes(1)
        expect(reminderServiceMock.recordFailedAttempt.mock.calls[0][0]).toBe(
            'r1',
        )
        expect(reminderServiceMock.markDelivered).not.toHaveBeenCalled()
    })

    it('gives up (marks delivered) once the attempt cap is reached, regardless of createdAt', async () => {
        // Far-future createdAt guard: a future-dated reminder must NOT be
        // dropped by elapsed time — only by the counter (review P1).
        await runTick(failingClient(), [makeReminder({ deliveryAttempts: 11 })])

        expect(reminderServiceMock.markDelivered).toHaveBeenCalledWith('r1')
        expect(reminderServiceMock.recordFailedAttempt).not.toHaveBeenCalled()
    })

    it('isolates a per-reminder failure so the batch continues', async () => {
        reminderServiceMock.markDelivered
            .mockRejectedValueOnce(new Error('db blip'))
            .mockResolvedValue(undefined)
        await runTick(deliveringClient(), [
            makeReminder({ id: 'r1' }),
            makeReminder({ id: 'r2' }),
        ])

        // both reminders were processed despite r1's markDelivered throwing
        expect(reminderServiceMock.markDelivered).toHaveBeenCalledTimes(2)
    })
})
