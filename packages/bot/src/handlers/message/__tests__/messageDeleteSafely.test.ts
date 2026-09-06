import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Message } from 'discord.js'

const warnLogMock = jest.fn()
jest.mock('@lucky/shared/utils', () => ({
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

import { deleteMessageSafely } from '../messageDeleteSafely'

function createMessage(deleteImpl: () => Promise<unknown>) {
    return {
        channelId: 'channel1',
        delete: jest.fn(deleteImpl),
    } as unknown as Message
}

describe('deleteMessageSafely', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('deletes the message without logging on success', async () => {
        const message = createMessage(() => Promise.resolve(undefined))

        await deleteMessageSafely(message)

        expect(message.delete).toHaveBeenCalled()
        expect(warnLogMock).not.toHaveBeenCalled()
    })

    it('silently ignores an Unknown Message (10008) error', async () => {
        const message = createMessage(() =>
            Promise.reject({ code: 10008, message: 'Unknown Message' }),
        )

        await deleteMessageSafely(message)

        expect(warnLogMock).not.toHaveBeenCalled()
    })

    it('logs any other error, e.g. missing permissions (50013)', async () => {
        const error = { code: 50013, message: 'Missing Permissions' }
        const message = createMessage(() => Promise.reject(error))

        await deleteMessageSafely(message)

        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to delete message',
                error,
                data: { channelId: 'channel1' },
            }),
        )
    })
})
