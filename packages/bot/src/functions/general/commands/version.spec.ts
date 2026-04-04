import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals'

const ORIGINAL_NPM_PACKAGE_VERSION = process.env.npm_package_version

const readFileSyncMock = jest.fn<(...args: unknown[]) => string>(() =>
    JSON.stringify({ version: '9.9.9' }),
)

const deferReplyMock = jest.fn<(arg?: unknown) => Promise<void>>(
    async (_arg?: unknown) => undefined,
)
const editReplyMock = jest.fn<(arg?: unknown) => Promise<void>>(
    async (_arg?: unknown) => undefined,
)
const createInfoEmbedMock = jest.fn((title: string, message: string) => ({
    title,
    message,
}))

jest.mock('node:fs', () => ({
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
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
        readFileSyncMock.mockReturnValue(JSON.stringify({ version: '9.9.9' }))
        delete process.env.COMMIT_SHA
        delete process.env.npm_package_version
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

    it('falls back to commit sha when package.json cannot be read', async () => {
        readFileSyncMock.mockImplementation(() => {
            throw new Error('missing package.json')
        })
        process.env.COMMIT_SHA = 'abc123def456'

        const interaction = createInteraction()
        await versionCommand.execute({ interaction } as any)

        expect(createInfoEmbedMock).toHaveBeenCalledWith(
            'Bot Version',
            'commit abc123d',
        )
    })

    it('prefers npm_package_version when available', async () => {
        process.env.npm_package_version = '2.6.62'

        const interaction = createInteraction()
        await versionCommand.execute({ interaction } as any)

        expect(readFileSyncMock).not.toHaveBeenCalled()
        expect(createInfoEmbedMock).toHaveBeenCalledWith(
            'Bot Version',
            'v2.6.62',
        )
    })
})

afterAll(() => {
    if (ORIGINAL_NPM_PACKAGE_VERSION === undefined) {
        delete process.env.npm_package_version
        return
    }
    process.env.npm_package_version = ORIGINAL_NPM_PACKAGE_VERSION
})
