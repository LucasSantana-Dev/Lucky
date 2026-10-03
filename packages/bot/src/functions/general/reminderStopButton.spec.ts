import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const errorLogMock = jest.fn()
jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: jest.fn(),
}))

const reminderServiceMock = {
    deleteOwned: jest.fn() as jest.MockedFunction<any>,
}
jest.mock('@lucky/shared/services', () => ({
    reminderService: reminderServiceMock,
}))

import {
    handleReminderStopButton,
    REMINDER_STOP_BUTTON_PREFIX,
} from './reminderStopButton'

function makeInteraction(customId: string) {
    const i = {
        customId,
        user: { id: 'u1' },
        deferUpdate: jest.fn(),
        editReply: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
        followUp: jest.fn().mockResolvedValue(undefined),
        replied: false,
        deferred: false,
    }
    i.deferUpdate.mockImplementation(async () => {
        i.deferred = true
    })
    return i
}

describe('handleReminderStopButton', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('exports the custom id prefix', () => {
        expect(REMINDER_STOP_BUTTON_PREFIX).toBe('remind_stop:')
    })

    test('owner: acks first, deletes by user scope, clears components, confirms', async () => {
        const order: string[] = []
        reminderServiceMock.deleteOwned.mockImplementation(async () => {
            order.push('delete')
            return true
        })
        const i = makeInteraction('remind_stop:r1')
        i.deferUpdate.mockImplementation(async () => {
            order.push('defer')
        })
        await handleReminderStopButton(i as never)

        expect(order).toEqual(['defer', 'delete'])
        expect(reminderServiceMock.deleteOwned).toHaveBeenCalledWith(
            null,
            'u1',
            'r1',
        )
        expect(i.editReply).toHaveBeenCalledWith({ components: [] })
        expect(i.followUp).toHaveBeenCalledWith({
            content: "🛑 Reminder stopped. You won't get it again.",
            ephemeral: true,
        })
    })

    test('non-owner or gone: one generic followUp, components untouched', async () => {
        reminderServiceMock.deleteOwned.mockResolvedValue(false)
        const i = makeInteraction('remind_stop:r1')
        await handleReminderStopButton(i as never)

        expect(i.editReply).not.toHaveBeenCalled()
        expect(i.followUp).toHaveBeenCalledTimes(1)
        expect(i.followUp).toHaveBeenCalledWith({
            content: '❌ Reminder not found or already stopped.',
            ephemeral: true,
        })
    })

    test('malformed id: ephemeral reply, no ack, no service calls', async () => {
        const i = makeInteraction('remind_stop:')
        await handleReminderStopButton(i as never)

        expect(i.deferUpdate).not.toHaveBeenCalled()
        expect(reminderServiceMock.deleteOwned).not.toHaveBeenCalled()
        expect(i.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
    })

    test('error before delete: logs and sends an error followUp', async () => {
        reminderServiceMock.deleteOwned.mockRejectedValue(new Error('db down'))
        const i = makeInteraction('remind_stop:r1')
        await handleReminderStopButton(i as never)

        expect(errorLogMock).toHaveBeenCalled()
        expect(i.editReply).not.toHaveBeenCalled()
        expect(i.followUp).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
    })

    test('defer itself failed: error goes out via reply', async () => {
        const i = makeInteraction('remind_stop:r1')
        i.deferUpdate.mockRejectedValue(new Error('expired'))
        await handleReminderStopButton(i as never)

        expect(i.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
        expect(i.followUp).not.toHaveBeenCalled()
    })

    test('error after a successful delete: log only, no user error', async () => {
        reminderServiceMock.deleteOwned.mockResolvedValue(true)
        const i = makeInteraction('remind_stop:r1')
        i.editReply.mockRejectedValue(new Error('discord blip'))
        await handleReminderStopButton(i as never)

        expect(errorLogMock).toHaveBeenCalledTimes(1)
        expect(i.followUp).not.toHaveBeenCalled()
        expect(i.reply).not.toHaveBeenCalled()
    })

    test('swallows a failing error reply', async () => {
        reminderServiceMock.deleteOwned.mockRejectedValue(new Error('db down'))
        const i = makeInteraction('remind_stop:r1')
        i.followUp.mockRejectedValue(new Error('expired'))
        await expect(
            handleReminderStopButton(i as never),
        ).resolves.toBeUndefined()
        expect(errorLogMock).toHaveBeenCalledTimes(2)
    })
})
