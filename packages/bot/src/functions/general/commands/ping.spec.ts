import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
}))

const interactionReply = jest.fn() as jest.MockedFunction<
    (args: { interaction: unknown; content: unknown }) => Promise<void>
>
jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply,
}))

import pingCommand from './ping.js'

function makeInteraction() {
    return {
        user: { id: 'u1', tag: 'alice#0000' },
        createdTimestamp: 1000,
        client: {
            ws: {
                ping: 42,
            },
        },
        fetchReply: jest.fn(),
    }
}

beforeEach(() => {
    interactionReply.mockClear().mockResolvedValue(undefined)
})

describe('/ping', () => {
    test('sends initial pinging message', async () => {
        const interaction = makeInteraction() as never
        ;(interaction.fetchReply as jest.Mock).mockResolvedValueOnce({
            createdTimestamp: 1050,
        })

        await pingCommand.execute({ interaction })

        expect(interactionReply).toHaveBeenCalledTimes(2)
        const firstCall = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(firstCall.content.content).toContain('Pinging')
    })

    test('calculates and displays latency correctly', async () => {
        const interaction = makeInteraction() as never
        ;(interaction.fetchReply as jest.Mock).mockResolvedValueOnce({
            createdTimestamp: 1050,
        })

        await pingCommand.execute({ interaction })

        const secondCall = interactionReply.mock.calls[1][0] as {
            content: { content: string }
        }
        expect(secondCall.content.content).toContain('Pong!')
        expect(secondCall.content.content).toContain('50ms')
        expect(secondCall.content.content).toContain('42ms')
    })

    test('displays API latency from client.ws.ping', async () => {
        const interaction = makeInteraction() as never
        ;(interaction.fetchReply as jest.Mock).mockResolvedValueOnce({
            createdTimestamp: 1025,
        })

        await pingCommand.execute({ interaction })

        const secondCall = interactionReply.mock.calls[1][0] as {
            content: { content: string }
        }
        expect(secondCall.content.content).toContain('API Latência')
    })

    test('handles zero latency gracefully', async () => {
        const interaction = {
            ...makeInteraction(),
            createdTimestamp: 1000,
            client: { ws: { ping: 0 } },
        } as never
        ;(interaction.fetchReply as jest.Mock).mockResolvedValueOnce({
            createdTimestamp: 1000,
        })

        await pingCommand.execute({ interaction })

        const secondCall = interactionReply.mock.calls[1][0] as {
            content: { content: string }
        }
        expect(secondCall.content.content).toContain('0ms')
    })
})
