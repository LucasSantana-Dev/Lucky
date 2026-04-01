import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const deferReplyMock = jest.fn().mockResolvedValue(undefined)
const editReplyMock = jest.fn().mockResolvedValue(undefined)
const createInfoEmbedMock = jest.fn((title: string, message: string) => ({
    title,
    message,
}))

jest.mock('../../../utils/general/embeds', () => ({
    createInfoEmbed: (...args: unknown[]) =>
        createInfoEmbedMock(...(args as [string, string])),
}))

import versionCommand from './version'

function createInteraction() {
    return {
        deferReply: deferReplyMock,
        editReply: editReplyMock,
    } as any
}

describe('version command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('defers reply as ephemeral', async () => {
        const interaction = createInteraction()
        await versionCommand.execute({ interaction } as any)
        expect(deferReplyMock).toHaveBeenCalledWith({ ephemeral: true })
    })

    it('replies with a versioned embed', async () => {
        const interaction = createInteraction()
        await versionCommand.execute({ interaction } as any)
        expect(createInfoEmbedMock).toHaveBeenCalledWith(
            'Bot Version',
            expect.stringMatching(/^v/),
        )
        expect(editReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: expect.any(Array) }),
        )
    })
})
