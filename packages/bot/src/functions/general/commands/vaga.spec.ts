import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ChannelType } from 'discord.js'

const findMany = jest.fn() as jest.Mock
const getPrismaClient = jest.fn(() => ({
    reactionRoleMessage: { findMany },
})) as unknown as jest.Mock

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient,
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

import vaga from './vaga'

const MAPPINGS = [
    { label: 'Python', roleId: 'r-python' },
    { label: 'React', roleId: 'r-react' },
    { label: 'Vagas', roleId: 'r-vagas' },
]

function makeInteraction(
    opts: Record<string, string | null>,
    button?: { customId: string },
) {
    const update = jest.fn()
    const send = jest.fn()
    const channel = {
        id: 'chan-vagas',
        name: 'vagas',
        type: ChannelType.GuildText,
        isTextBased: () => true,
        send,
    }
    const message = {
        awaitMessageComponent: jest.fn(() =>
            button
                ? Promise.resolve({ ...button, update })
                : Promise.reject(new Error('timeout')),
        ),
    }
    const reply = jest.fn(() => Promise.resolve(message))
    const interaction = {
        user: { id: 'u1', tag: 'mod#1' },
        guild: {
            id: 'g1',
            channels: {
                cache: {
                    find: (fn: (c: unknown) => boolean) =>
                        fn(channel) ? channel : undefined,
                },
            },
        },
        options: {
            getString: (name: string) => opts[name] ?? null,
        },
        reply,
        editReply: jest.fn(),
    }
    return { interaction, reply, send, update, message }
}

describe('/vaga command', () => {
    beforeEach(() => {
        findMany.mockReset()
        getPrismaClient.mockReturnValue({
            reactionRoleMessage: { findMany },
        })
        findMany.mockResolvedValue([{ mappings: MAPPINGS }])
    })

    const base = {
        titulo: 'Dev Python Pleno',
        descricao: 'Experiência com Python e React',
        url: 'https://x.com/job',
        modalidade: 'remoto',
        senioridade: 'pleno',
    }

    it('rejects outside a guild', async () => {
        const reply = jest.fn()
        await vaga.execute({
            interaction: {
                guild: null,
                reply,
                options: { getString: () => null },
            } as never,
            client: {} as never,
        })
        expect(reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
    })

    it('shows an ephemeral preview with detected + forced tags', async () => {
        const { interaction, reply } = makeInteraction(base, {
            customId: 'vaga_cancel',
        })
        await vaga.execute({
            interaction: interaction as never,
            client: {} as never,
        })
        const call = reply.mock.calls[0][0] as {
            content: string
            ephemeral: boolean
        }
        expect(call.ephemeral).toBe(true)
        expect(call.content).toContain('📍')
        // python + react detected, remoto + pleno forced, vagas always
        expect(call.content).toContain('Python')
        expect(call.content).toContain('Remoto')
        expect(call.content).toContain('Pleno')
    })

    it('publishes to #vagas on the Publicar button with role mentions', async () => {
        const { interaction, send, update } = makeInteraction(base, {
            customId: 'vaga_publish',
        })
        await vaga.execute({
            interaction: interaction as never,
            client: {} as never,
        })
        expect(send).toHaveBeenCalledTimes(1)
        const sent = send.mock.calls[0][0] as {
            content: string
            allowedMentions: { roles: string[] }
        }
        expect(sent.content).toContain('📍')
        expect(sent.content).toContain('<@&r-python>')
        expect(sent.allowedMentions.roles).toContain('r-vagas')
        expect(update).toHaveBeenCalled()
    })

    it('does not publish when cancelled', async () => {
        const { interaction, send } = makeInteraction(base, {
            customId: 'vaga_cancel',
        })
        await vaga.execute({
            interaction: interaction as never,
            client: {} as never,
        })
        expect(send).not.toHaveBeenCalled()
    })
})
