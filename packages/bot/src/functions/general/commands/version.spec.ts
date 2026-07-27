import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
}))

const interactionReply = jest.fn() as jest.MockedFunction<
    (args: { interaction: unknown; content: unknown }) => Promise<void>
>
jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply,
}))

jest.mock('../../../utils/general/embeds.js', () => ({
    createInfoEmbed: jest.fn((title: string, desc: string) => ({
        title,
        description: desc,
    })),
}))

jest.mock('node:fs', () => ({
    readFileSync: jest.fn(() => {
        throw new Error('file not found')
    }),
}))

import versionCommand from './version.js'

function makeInteraction() {
    return {
        user: { id: 'u1', tag: 'alice#0000' },
        deferReply: jest.fn().mockResolvedValue(undefined),
    }
}

beforeEach(() => {
    interactionReply.mockClear().mockResolvedValue(undefined)
    delete process.env.npm_package_version
    delete process.env.COMMIT_SHA
})

describe('/version', () => {
    test('defers reply with ephemeral flag', async () => {
        const interaction = makeInteraction() as never

        await versionCommand.execute({ interaction })

        expect(interaction.deferReply).toHaveBeenCalledWith({
            flags: expect.anything(),
        })
    })

    test('uses npm_package_version when set', async () => {
        process.env.npm_package_version = '2.30.0'
        const interaction = makeInteraction() as never

        await versionCommand.execute({ interaction })

        const callArg = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ description: string }> }
        }
        expect(callArg.content.embeds[0].description).toBe('v2.30.0')
    })

    test('falls back to COMMIT_SHA when npm_package_version missing', async () => {
        process.env.COMMIT_SHA = 'abc123def456'
        const interaction = makeInteraction() as never

        await versionCommand.execute({ interaction })

        const callArg = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ description: string }> }
        }
        expect(callArg.content.embeds[0].description).toBe('commit abc123d')
    })

    test('uses "unknown" when neither env var is set', async () => {
        const interaction = makeInteraction() as never

        await versionCommand.execute({ interaction })

        const callArg = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ description: string }> }
        }
        expect(callArg.content.embeds[0].description).toBe('unknown')
    })

    test('sends embed with title "Bot Version"', async () => {
        process.env.npm_package_version = '1.0.0'
        const interaction = makeInteraction() as never

        await versionCommand.execute({ interaction })

        const callArg = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ title: string }> }
        }
        expect(callArg.content.embeds[0].title).toBe('Bot Version')
    })
})
