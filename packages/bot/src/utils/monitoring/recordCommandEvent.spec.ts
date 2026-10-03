import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const pushMock = jest.fn()
const warnLogMock = jest.fn()
const incMock = jest.fn()
const observeMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    warnLog: (...a: unknown[]) => warnLogMock(...a),
}))
jest.mock('./commandEventBuffer', () => ({
    getCommandEventBuffer: () => ({
        push: (...a: unknown[]) => pushMock(...a),
    }),
}))
jest.mock('./prometheus', () => ({
    commandsTotal: { inc: (...a: unknown[]) => incMock(...a) },
    commandDurationSeconds: { observe: (...a: unknown[]) => observeMock(...a) },
}))

import { recordCommandEvent } from './recordCommandEvent'

const interaction = (over: Record<string, unknown> = {}) =>
    ({
        commandName: 'play',
        user: { id: 'u1' },
        guild: { id: 'g1', shardId: 2 },
        options: { getSubcommand: () => 'song' },
        client: { shard: { ids: [5] } },
        ...over,
    }) as any

describe('recordCommandEvent', () => {
    beforeEach(() => jest.clearAllMocks())

    it('pushes a row and updates metrics without guild/user labels', () => {
        recordCommandEvent({
            interaction: interaction(),
            kind: 'slash',
            outcome: 'ok',
            startedAt: Date.now() - 50,
            known: true,
        })
        expect(incMock).toHaveBeenCalledWith({
            command: 'play',
            kind: 'slash',
            outcome: 'ok',
        })
        expect(observeMock).toHaveBeenCalledWith(
            { command: 'play' },
            expect.any(Number),
        )
        expect(pushMock).toHaveBeenCalledWith(
            expect.objectContaining({
                guildId: 'g1',
                userId: 'u1',
                command: 'play',
                subcommand: 'song',
                shardId: 2,
                errorClass: null,
            }),
        )
    })

    it('maps unknown commands to "unknown" and uses client shard fallback', () => {
        recordCommandEvent({
            interaction: interaction({
                commandName: 'raw-user-input',
                guild: null,
            }),
            kind: 'slash',
            outcome: 'user_error',
            startedAt: Date.now(),
            known: false,
        })
        expect(incMock).toHaveBeenCalledWith(
            expect.objectContaining({ command: 'unknown' }),
        )
        expect(pushMock).toHaveBeenCalledWith(
            expect.objectContaining({
                command: 'unknown',
                guildId: null,
                subcommand: null,
                shardId: 5,
            }),
        )
    })

    it('never throws and warns when recording fails', () => {
        pushMock.mockImplementation(() => {
            throw new Error('boom')
        })
        expect(() =>
            recordCommandEvent({
                interaction: interaction(),
                kind: 'slash',
                outcome: 'ok',
                startedAt: Date.now(),
                known: true,
            }),
        ).not.toThrow()
        expect(warnLogMock).toHaveBeenCalledTimes(1)
    })
})
