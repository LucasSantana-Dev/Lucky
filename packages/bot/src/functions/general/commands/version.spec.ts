import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const deferReplyMock = jest.fn().mockResolvedValue(undefined)
const editReplyMock = jest.fn().mockResolvedValue(undefined)
const createInfoEmbedMock = jest.fn((title: string, message: string) => ({
    title,
    message,
}))

jest.mock('../../../../package.json', () => ({ version: '9.9.9' }))

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

    it('replies with version from package.json', async () => {
        const interaction = createInteraction()
        await versionCommand.execute({ interaction } as any)
        expect(createInfoEmbedMock).toHaveBeenCalledWith(
            'Bot Version',
            'v9.9.9',
        )
    })
})
