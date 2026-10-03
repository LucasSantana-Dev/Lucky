import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const reminderServiceMock = {
    getDueReminders: jest.fn() as jest.MockedFunction<any>,
    markDelivered: jest.fn() as jest.MockedFunction<any>,
    recordFailedAttempt: jest.fn() as jest.MockedFunction<any>,
    markDeliveryFailed: jest.fn() as jest.MockedFunction<any>,
    rescheduleRecurring: jest.fn() as jest.MockedFunction<any>,
}

const computeNextOccurrenceMock = jest.fn() as jest.MockedFunction<any>

jest.mock('@lucky/shared/services', () => ({
    reminderService: reminderServiceMock,
    MAX_DELIVERY_ATTEMPTS: 12,
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    computeNextOccurrence: computeNextOccurrenceMock,
    DEFAULT_TIMEZONE: 'America/Sao_Paulo',
}))
jest.mock('@lucky/shared/constants', () => ({ COLOR: { LUCKY_PURPLE: 0 } }))

import { infoLog } from '@lucky/shared/utils'
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
        targetType: 'user',
        roleId: null,
        deliveryFailed: false,
        recurrenceRule: null,
        timezone: null,
        ...overrides,
    }
}

/** Guild cache whose member fetch resolves (user still a member). */
function memberGuilds(fetch: jest.Mock = jest.fn().mockResolvedValue({})) {
    return {
        cache: { get: jest.fn().mockReturnValue({ members: { fetch } }) },
    }
}

/** Minimal Discord client whose DM + channel sends both fail. */
function failingClient() {
    return {
        isReady: () => true,
        guilds: memberGuilds(),
        users: { fetch: jest.fn().mockRejectedValue(new Error('dm closed')) },
        channels: { fetch: jest.fn().mockRejectedValue(new Error('no chan')) },
    } as never
}

/** Client whose DM send succeeds. */
function deliveringClient(
    send: jest.Mock = jest.fn().mockResolvedValue(undefined),
    guilds: unknown = memberGuilds(),
) {
    return {
        isReady: () => true,
        guilds,
        users: { fetch: jest.fn().mockResolvedValue({ send }) },
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

    it('re-arms a recurring reminder instead of marking it delivered', async () => {
        const next = new Date('2026-07-04T23:00:00Z')
        computeNextOccurrenceMock.mockReturnValue(next)
        await runTick(deliveringClient(), [
            makeReminder({
                recurrenceRule:
                    'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=20;BYMINUTE=0;BYSECOND=0',
                timezone: 'America/Sao_Paulo',
            }),
        ])

        expect(reminderServiceMock.rescheduleRecurring).toHaveBeenCalledWith(
            'r1',
            next,
        )
        expect(reminderServiceMock.markDelivered).not.toHaveBeenCalled()
    })

    it('stops a recurring reminder whose rule is exhausted (next = null)', async () => {
        computeNextOccurrenceMock.mockReturnValue(null)
        await runTick(deliveringClient(), [
            makeReminder({
                recurrenceRule: 'FREQ=DAILY;COUNT=1',
                timezone: null,
            }),
        ])

        expect(reminderServiceMock.rescheduleRecurring).not.toHaveBeenCalled()
        expect(reminderServiceMock.markDelivered).toHaveBeenCalledWith('r1')
    })

    it('stops a recurring reminder when the rule throws instead of re-arming', async () => {
        computeNextOccurrenceMock.mockImplementation(() => {
            throw new Error('unparseable rule')
        })
        await runTick(deliveringClient(), [
            makeReminder({
                recurrenceRule: 'NOT-A-RULE',
                timezone: 'America/Sao_Paulo',
            }),
        ])

        expect(reminderServiceMock.rescheduleRecurring).not.toHaveBeenCalled()
        expect(reminderServiceMock.markDelivered).toHaveBeenCalledWith('r1')
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

    // --- Broadcast (channel/role) reminders — #1767 ---

    /** Client whose channel send succeeds; captures the send payload. */
    function broadcastClient(send: jest.Mock) {
        return {
            isReady: () => true,
            guilds: memberGuilds(),
            users: { fetch: jest.fn() },
            channels: {
                fetch: jest.fn().mockResolvedValue({ send }),
            },
        } as never
    }

    it('posts a channel reminder once (no ping, no retry) and marks it delivered', async () => {
        const send = jest.fn().mockResolvedValue(undefined) as jest.Mock
        await runTick(broadcastClient(send), [
            makeReminder({ targetType: 'channel' }),
        ])

        expect(send).toHaveBeenCalledTimes(1)
        const payload = send.mock.calls[0][0] as Record<string, unknown>
        expect(payload.content).toBeUndefined()
        expect(payload.allowedMentions).toEqual({ parse: [] })
        expect(reminderServiceMock.markDelivered).toHaveBeenCalledWith('r1')
        expect(reminderServiceMock.markDeliveryFailed).not.toHaveBeenCalled()
    })

    it('pings the role and scopes the mention for a role reminder', async () => {
        const send = jest.fn().mockResolvedValue(undefined) as jest.Mock
        await runTick(broadcastClient(send), [
            makeReminder({ targetType: 'role', roleId: 'role9' }),
        ])

        const payload = send.mock.calls[0][0] as Record<string, unknown>
        expect(payload.content).toBe('<@&role9>')
        expect(payload.allowedMentions).toEqual({ roles: ['role9'] })
        expect(reminderServiceMock.markDelivered).toHaveBeenCalledWith('r1')
    })

    it('flags a failed broadcast (fire-once) instead of retrying', async () => {
        await runTick(failingClient(), [
            makeReminder({ targetType: 'channel' }),
        ])

        expect(reminderServiceMock.markDeliveryFailed).toHaveBeenCalledWith(
            'r1',
        )
        expect(reminderServiceMock.recordFailedAttempt).not.toHaveBeenCalled()
        expect(reminderServiceMock.markDelivered).not.toHaveBeenCalled()
    })

    // --- Membership check + stop button (#2619) ---

    const RULE = 'FREQ=DAILY;BYHOUR=20;BYMINUTE=0;BYSECOND=0'

    it('cancels a user reminder when the user left the guild (10007)', async () => {
        const send = jest.fn().mockResolvedValue(undefined) as jest.Mock
        const fetch = jest
            .fn()
            .mockRejectedValue({ code: 10007, message: 'Unknown Member' })
        const client = deliveringClient(send, memberGuilds(fetch))
        await runTick(client, [makeReminder({ recurrenceRule: RULE })])

        expect(fetch).toHaveBeenCalledWith({ user: 'u1', force: true })
        expect(reminderServiceMock.markDelivered).toHaveBeenCalledWith('r1')
        expect(reminderServiceMock.rescheduleRecurring).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalled()
        expect(
            (client as unknown as { users: { fetch: jest.Mock } }).users.fetch,
        ).not.toHaveBeenCalled()
        expect(
            (client as unknown as { channels: { fetch: jest.Mock } }).channels
                .fetch,
        ).not.toHaveBeenCalled()
        expect(infoLog).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    reminderId: 'r1',
                    reason: 'user_left_guild',
                }),
            }),
        )
    })

    it('cancels a user reminder when the bot is no longer in the guild', async () => {
        const send = jest.fn().mockResolvedValue(undefined) as jest.Mock
        const guilds = { cache: { get: jest.fn().mockReturnValue(undefined) } }
        await runTick(deliveringClient(send, guilds), [makeReminder()])

        expect(guilds.cache.get).toHaveBeenCalledWith('g1')
        expect(reminderServiceMock.markDelivered).toHaveBeenCalledWith('r1')
        expect(send).not.toHaveBeenCalled()
        expect(infoLog).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    reminderId: 'r1',
                    reason: 'bot_left_guild',
                }),
            }),
        )
    })

    it('cancels a recurring reminder in a guild the bot left (no re-arm)', async () => {
        const send = jest.fn().mockResolvedValue(undefined) as jest.Mock
        const guilds = { cache: { get: jest.fn().mockReturnValue(undefined) } }
        await runTick(deliveringClient(send, guilds), [
            makeReminder({ recurrenceRule: RULE }),
        ])

        expect(reminderServiceMock.markDelivered).toHaveBeenCalledWith('r1')
        expect(reminderServiceMock.rescheduleRecurring).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalled()
    })

    it('fails open and delivers when the member fetch errors transiently', async () => {
        const send = jest.fn().mockResolvedValue(undefined) as jest.Mock
        const fetch = jest.fn().mockRejectedValue(new Error('gateway timeout'))
        await runTick(deliveringClient(send, memberGuilds(fetch)), [
            makeReminder(),
        ])

        expect(send).toHaveBeenCalledTimes(1)
        expect(reminderServiceMock.markDelivered).toHaveBeenCalledWith('r1')
    })

    it('skips everything untouched while the client is not ready', async () => {
        const send = jest.fn() as jest.Mock
        const client = {
            isReady: () => false,
            guilds: { cache: { get: jest.fn() } },
            users: { fetch: jest.fn().mockResolvedValue({ send }) },
            channels: { fetch: jest.fn() },
        } as never
        await runTick(client, [makeReminder({ recurrenceRule: RULE })])

        expect(send).not.toHaveBeenCalled()
        expect(reminderServiceMock.markDelivered).not.toHaveBeenCalled()
        expect(reminderServiceMock.recordFailedAttempt).not.toHaveBeenCalled()
        expect(reminderServiceMock.rescheduleRecurring).not.toHaveBeenCalled()
    })

    it('attaches a Stop button to a recurring DM', async () => {
        computeNextOccurrenceMock.mockReturnValue(new Date())
        const send = jest.fn().mockResolvedValue(undefined) as jest.Mock
        await runTick(deliveringClient(send), [
            makeReminder({ recurrenceRule: RULE }),
        ])

        const payload = send.mock.calls[0][0] as {
            components: { toJSON: () => any }[]
        }
        expect(payload.components).toHaveLength(1)
        const row = payload.components[0].toJSON()
        expect(row.components).toHaveLength(1)
        expect(row.components[0]).toMatchObject({
            custom_id: 'remind_stop:r1',
            label: 'Stop this reminder',
            style: 4,
        })
    })

    it('attaches the Stop button to the channel fallback of a recurring reminder', async () => {
        computeNextOccurrenceMock.mockReturnValue(new Date())
        const send = jest.fn().mockResolvedValue(undefined) as jest.Mock
        const client = {
            isReady: () => true,
            guilds: memberGuilds(),
            users: { fetch: jest.fn().mockRejectedValue(new Error('dm off')) },
            channels: { fetch: jest.fn().mockResolvedValue({ send }) },
        } as never
        await runTick(client, [makeReminder({ recurrenceRule: RULE })])

        const payload = send.mock.calls[0][0] as {
            components: { toJSON: () => any }[]
        }
        expect(payload.components[0].toJSON().components[0].custom_id).toBe(
            'remind_stop:r1',
        )
    })

    it('sends no components for a one-time reminder', async () => {
        const send = jest.fn().mockResolvedValue(undefined) as jest.Mock
        await runTick(deliveringClient(send), [makeReminder()])

        const payload = send.mock.calls[0][0] as Record<string, unknown>
        expect(payload.components).toBeUndefined()
    })

    it('does not run the membership check for broadcast reminders', async () => {
        const send = jest.fn().mockResolvedValue(undefined) as jest.Mock
        const fetch = jest.fn()
        const client = {
            isReady: () => true,
            guilds: memberGuilds(fetch),
            users: { fetch: jest.fn() },
            channels: { fetch: jest.fn().mockResolvedValue({ send }) },
        } as never
        await runTick(client, [makeReminder({ targetType: 'channel' })])

        expect(fetch).not.toHaveBeenCalled()
        expect(send).toHaveBeenCalledTimes(1)
    })

    it('does not count a failed broadcast in the delivered log', async () => {
        await runTick(failingClient(), [
            makeReminder({ targetType: 'channel' }),
        ])

        expect(reminderServiceMock.markDeliveryFailed).toHaveBeenCalledWith(
            'r1',
        )
        expect(infoLog).not.toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('delivered'),
            }),
        )
    })
})
