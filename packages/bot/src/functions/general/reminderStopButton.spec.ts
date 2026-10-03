import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const errorLogMock = jest.fn()
jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: jest.fn(),
}))

const reminderServiceMock = {
    deleteOwned: jest.fn() as jest.MockedFunction<any>,
    findById: jest.fn() as jest.MockedFunction<any>,
}
jest.mock('@lucky/shared/services', () => ({
    reminderService: reminderServiceMock,
}))

import {
    handleReminderStopButton,
    REMINDER_STOP_BUTTON_PREFIX,
} from './reminderStopButton'

function makeInteraction(customId: string) {
    return {
        customId,
        user: { id: 'u1' },
        update: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
        followUp: jest.fn().mockResolvedValue(undefined),
        replied: false,
        deferred: false,
    }
}

describe('handleReminderStopButton', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('exports the custom id prefix', () => {
        expect(REMINDER_STOP_BUTTON_PREFIX).toBe('remind_stop:')
    })

    test('owner: deletes by user scope, clears components, confirms privately', async () => {
        reminderServiceMock.deleteOwned.mockResolvedValue(true)
        const i = makeInteraction('remind_stop:r1')
        await handleReminderStopButton(i as never)

        expect(reminderServiceMock.deleteOwned).toHaveBeenCalledWith(
            null,
            'u1',
            'r1',
        )
        expect(i.update).toHaveBeenCalledWith({ components: [] })
        expect(i.followUp).toHaveBeenCalledWith({
            content: "🛑 Reminder stopped. You won't get it again.",
            ephemeral: true,
        })
    })

    test('non-owner: refuses privately and leaves components untouched', async () => {
        reminderServiceMock.deleteOwned.mockResolvedValue(false)
        reminderServiceMock.findById.mockResolvedValue({ id: 'r1' })
        const i = makeInteraction('remind_stop:r1')
        await handleReminderStopButton(i as never)

        expect(i.update).not.toHaveBeenCalled()
        expect(i.reply).toHaveBeenCalledWith({
            content: '❌ Only the person who set this reminder can stop it.',
            ephemeral: true,
        })
    })

    test('missing row: clears components and says already stopped', async () => {
        reminderServiceMock.deleteOwned.mockResolvedValue(false)
        reminderServiceMock.findById.mockResolvedValue(null)
        const i = makeInteraction('remind_stop:r1')
        await handleReminderStopButton(i as never)

        expect(i.update).toHaveBeenCalledWith({ components: [] })
        expect(i.followUp).toHaveBeenCalledWith({
            content: 'This reminder was already stopped.',
            ephemeral: true,
        })
    })

    test('malformed id: ephemeral error, no service calls', async () => {
        const i = makeInteraction('remind_stop:')
        await handleReminderStopButton(i as never)

        expect(reminderServiceMock.deleteOwned).not.toHaveBeenCalled()
        expect(i.update).not.toHaveBeenCalled()
        expect(i.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
    })

    test('service failure: logs and replies with an ephemeral error', async () => {
        reminderServiceMock.deleteOwned.mockRejectedValue(new Error('db down'))
        const i = makeInteraction('remind_stop:r1')
        await handleReminderStopButton(i as never)

        expect(errorLogMock).toHaveBeenCalled()
        expect(i.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
    })

    test('service failure after the interaction was acked: uses followUp', async () => {
        reminderServiceMock.deleteOwned.mockResolvedValue(true)
        const i = makeInteraction('remind_stop:r1')
        i.followUp.mockRejectedValueOnce(new Error('discord blip'))
        i.update.mockImplementation(async () => {
            i.replied = true
        })
        await handleReminderStopButton(i as never)

        expect(errorLogMock).toHaveBeenCalled()
        expect(i.followUp).toHaveBeenCalledTimes(2)
    })

    test('swallows a failing error reply', async () => {
        reminderServiceMock.deleteOwned.mockRejectedValue(new Error('db down'))
        const i = makeInteraction('remind_stop:r1')
        i.reply.mockRejectedValue(new Error('expired'))
        await expect(
            handleReminderStopButton(i as never),
        ).resolves.toBeUndefined()
        expect(errorLogMock).toHaveBeenCalledTimes(2)
    })
})
