const mockGetGuildSettings = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (...a: unknown[]) => mockGetGuildSettings(...a),
    },
}))

import {
    QUEUE_LEAVE_OPTIONS,
    STAY_CONNECTED_LEAVE_OPTIONS,
    applyLeaveOptionsToQueue,
    queueLeaveOptionsFor,
} from './queueLeaveOptions'

describe('queueLeaveOptionsFor', () => {
    beforeEach(() => jest.clearAllMocks())

    it('leaves on end and on empty by default', async () => {
        mockGetGuildSettings.mockResolvedValue({ stayConnected: false })

        await expect(queueLeaveOptionsFor('g-1')).resolves.toEqual(
            QUEUE_LEAVE_OPTIONS,
        )
        expect(mockGetGuildSettings).toHaveBeenCalledWith('g-1')
    })

    it('stays connected when 24/7 mode is on', async () => {
        mockGetGuildSettings.mockResolvedValue({ stayConnected: true })

        const options = await queueLeaveOptionsFor('g-1')

        expect(options).toEqual(STAY_CONNECTED_LEAVE_OPTIONS)
        expect(options.leaveOnEnd).toBe(false)
        expect(options.leaveOnEmpty).toBe(false)
    })

    it('keeps the cooldowns that let an autoplay refill land (#2932)', () => {
        expect(QUEUE_LEAVE_OPTIONS.leaveOnEndCooldown).toBe(300_000)
        expect(QUEUE_LEAVE_OPTIONS.leaveOnEmptyCooldown).toBe(30_000)
    })

    it('falls back to leaving when the guild has no settings row', async () => {
        mockGetGuildSettings.mockResolvedValue(null)

        await expect(queueLeaveOptionsFor('g-1')).resolves.toEqual(
            QUEUE_LEAVE_OPTIONS,
        )
    })

    it('falls back to leaving when the settings read throws', async () => {
        mockGetGuildSettings.mockRejectedValue(new Error('db down'))

        await expect(queueLeaveOptionsFor('g-1')).resolves.toEqual(
            QUEUE_LEAVE_OPTIONS,
        )
    })
})

describe('applyLeaveOptionsToQueue', () => {
    function liveQueue() {
        return {
            options: { ...QUEUE_LEAVE_OPTIONS, pauseOnEmpty: true },
        } as any
    }

    it('turns leaving off on a running queue', () => {
        const queue = liveQueue()

        applyLeaveOptionsToQueue(queue, true)

        expect(queue.options.leaveOnEnd).toBe(false)
        expect(queue.options.leaveOnEmpty).toBe(false)
        // Never stream to an empty channel.
        expect(queue.options.pauseOnEmpty).toBe(true)
    })

    it('turns leaving back on', () => {
        const queue = liveQueue()
        applyLeaveOptionsToQueue(queue, true)

        applyLeaveOptionsToQueue(queue, false)

        expect(queue.options.leaveOnEnd).toBe(true)
        expect(queue.options.leaveOnEmpty).toBe(true)
    })
})
