import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { CustomClient } from '../../types'

jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: { MUSIC: { SESSION_RESTORE_ENABLED: true } },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

const listGuildIdsMock = jest.fn<any>()
const getSnapshotMock = jest.fn<any>()
const deleteSnapshotMock = jest.fn<any>()
const restoreSnapshotMock = jest.fn<any>()

jest.mock('./sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        listGuildIds: (...a: unknown[]) => listGuildIdsMock(...a),
        getSnapshot: (...a: unknown[]) => getSnapshotMock(...a),
        deleteSnapshot: (...a: unknown[]) => deleteSnapshotMock(...a),
        restoreSnapshot: (...a: unknown[]) => restoreSnapshotMock(...a),
    },
}))

import { restoreSessionsOnStartup } from './sessionStartupRestore'

function clientWith(
    guildId: string,
    channelVoice = true,
    humanCount = 1,
): CustomClient {
    // Minimal stand-in for a discord.js Collection of voice members: filter()
    // returns an object exposing `.size`, which is all the guard inspects.
    const members = {
        filter: (predicate: (m: { user: { bot: boolean } }) => boolean) => {
            const humans = Array.from({ length: humanCount }, () => ({
                user: { bot: false },
            })).filter(predicate)
            return { size: humans.length }
        },
    }
    const channel = { isVoiceBased: () => channelVoice, members }
    const guild = { channels: { cache: { get: () => channel } } }
    const queue = { connection: null, connect: jest.fn(async () => undefined) }
    return {
        guilds: {
            cache: {
                get: (id: string) => (id === guildId ? guild : undefined),
            },
        },
        player: { nodes: { create: jest.fn(() => queue) } },
    } as unknown as CustomClient
}

describe('restoreSessionsOnStartup', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        listGuildIdsMock.mockResolvedValue([])
        getSnapshotMock.mockResolvedValue(null)
        restoreSnapshotMock.mockResolvedValue({
            restoredCount: 0,
            sessionSnapshotId: null,
        })
    })

    it('discovers guilds via Postgres listGuildIds, not Redis', async () => {
        await restoreSessionsOnStartup(clientWith('g1'))
        expect(listGuildIdsMock).toHaveBeenCalledTimes(1)
    })

    it('no-ops when there are no snapshots', async () => {
        listGuildIdsMock.mockResolvedValue([])
        await restoreSessionsOnStartup(clientWith('g1'))
        expect(getSnapshotMock).not.toHaveBeenCalled()
    })

    it('restores a fresh snapshot for a cached guild', async () => {
        listGuildIdsMock.mockResolvedValue(['g1'])
        getSnapshotMock.mockResolvedValue({
            savedAt: Date.now() - 60_000,
            voiceChannelId: 'vc-1',
        })
        restoreSnapshotMock.mockResolvedValue({
            restoredCount: 2,
            sessionSnapshotId: 's1',
        })

        await restoreSessionsOnStartup(clientWith('g1'))
        expect(restoreSnapshotMock).toHaveBeenCalledTimes(1)
    })

    it('skips restore when no humans are in the saved channel', async () => {
        listGuildIdsMock.mockResolvedValue(['g1'])
        getSnapshotMock.mockResolvedValue({
            savedAt: Date.now() - 60_000,
            voiceChannelId: 'vc-1',
        })

        await restoreSessionsOnStartup(clientWith('g1', true, 0))
        expect(restoreSnapshotMock).not.toHaveBeenCalled()
    })

    it('deletes a stale snapshot instead of restoring', async () => {
        listGuildIdsMock.mockResolvedValue(['g1'])
        getSnapshotMock.mockResolvedValue({
            savedAt: Date.now() - 60 * 60 * 1000, // 1h > 30m
            voiceChannelId: 'vc-1',
        })

        await restoreSessionsOnStartup(clientWith('g1'))
        expect(deleteSnapshotMock).toHaveBeenCalledWith('g1')
        expect(restoreSnapshotMock).not.toHaveBeenCalled()
    })
})
