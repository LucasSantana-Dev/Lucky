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
    const originalNpmVersion = process.env.npm_package_version
    const originalCommitSha = process.env.COMMIT_SHA

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        process.env.npm_package_version = originalNpmVersion
        process.env.COMMIT_SHA = originalCommitSha
    })

    it('defers reply as ephemeral', async () => {
        const interaction = createInteraction()
        await versionCommand.execute({ interaction } as any)
        expect(deferReplyMock).toHaveBeenCalledWith({ ephemeral: true })
    })

    it('replies with semver when npm_package_version is set', async () => {
        process.env.npm_package_version = '2.6.60'
        delete process.env.COMMIT_SHA
        const interaction = createInteraction()
        await versionCommand.execute({ interaction } as any)
        expect(createInfoEmbedMock).toHaveBeenCalledWith(
            'Bot Version',
            'v2.6.60',
        )
    })

    it('replies with commit sha when npm_package_version is unset', async () => {
        delete process.env.npm_package_version
        process.env.COMMIT_SHA = 'abc1234567890'
        const interaction = createInteraction()
        await versionCommand.execute({ interaction } as any)
        expect(createInfoEmbedMock).toHaveBeenCalledWith(
            'Bot Version',
            'commit abc1234',
        )
    })

    it('replies with unknown when neither env var is set', async () => {
        delete process.env.npm_package_version
        delete process.env.COMMIT_SHA
        const interaction = createInteraction()
        await versionCommand.execute({ interaction } as any)
        expect(createInfoEmbedMock).toHaveBeenCalledWith(
            'Bot Version',
            'unknown',
        )
    })
})
