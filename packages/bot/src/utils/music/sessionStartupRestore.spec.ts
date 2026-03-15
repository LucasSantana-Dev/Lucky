import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { restoreSessionsOnStartup } from './sessionStartupRestore'

// --- mocks ---

const keysMock = jest.fn()
const getSnapshotMock = jest.fn()
const deleteSnapshotMock = jest.fn()
const restoreSnapshotMock = jest.fn()

jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: {
        MUSIC: { SESSION_RESTORE_ENABLED: true },
    },
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: { keys: (...args: unknown[]) => keysMock(...args) },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('./sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        getSnapshot: (...args: unknown[]) => getSnapshotMock(...args),
        deleteSnapshot: (...args: unknown[]) => deleteSnapshotMock(...args),
        restoreSnapshot: (...args: unknown[]) => restoreSnapshotMock(...args),
    },
}))

// --- helpers ---

const GUILD_ID = 'guild-123'
const VOICE_CHANNEL_ID = 'vc-456'
const FRESH_SAVED_AT = Date.now() - 5 * 60 * 1_000 // 5 min ago
const STALE_SAVED_AT = Date.now() - 35 * 60 * 1_000 // 35 min ago (> 30 min limit)

const makeSnapshot = (overrides: Record<string, unknown> = {}) => ({
    sessionSnapshotId: 'snap-1',
    guildId: GUILD_ID,
    savedAt: FRESH_SAVED_AT,
    currentTrack: null,
    upcomingTracks: [{ title: 'Track 1', author: 'Artist', url: 'https://yt', duration: '3:00', source: 'youtube' }],
    voiceChannelId: VOICE_CHANNEL_ID,
    ...overrides,
})

const makeVoiceChannel = () => ({
    id: VOICE_CHANNEL_ID,
    isVoiceBased: () => true,
})

const makeQueue = () => ({
    connection: null,
    connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as void),
})

const makePlayer = (queue: ReturnType<typeof makeQueue>) => ({
    nodes: {
        create: jest.fn().mockReturnValue(queue),
    },
})

const makeClient = (overrides: Record<string, unknown> = {}) => {
    const queue = makeQueue()
    const player = makePlayer(queue)
    const voiceChannel = makeVoiceChannel()
    const guild = {
        id: GUILD_ID,
        channels: { cache: { get: jest.fn().mockReturnValue(voiceChannel) } },
    }
    return {
        guilds: { cache: { get: jest.fn().mockReturnValue(guild) } },
        player,
        _queue: queue,
        _guild: guild,
        ...overrides,
    }
}

describe('restoreSessionsOnStartup', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        keysMock.mockResolvedValue([`music:session:${GUILD_ID}`])
        getSnapshotMock.mockResolvedValue(makeSnapshot())
        deleteSnapshotMock.mockResolvedValue(undefined)
        restoreSnapshotMock.mockResolvedValue({ restoredCount: 1, sessionSnapshotId: 'snap-1' })
    })

    it('returns early when SESSION_RESTORE_ENABLED is false', async () => {
        const { ENVIRONMENT_CONFIG } = await import('@lucky/shared/config')
        const original = ENVIRONMENT_CONFIG.MUSIC.SESSION_RESTORE_ENABLED
        ;(ENVIRONMENT_CONFIG.MUSIC as Record<string, unknown>).SESSION_RESTORE_ENABLED = false
        try {
            const client = makeClient()
            await restoreSessionsOnStartup(client as unknown as import('../../types').CustomClient)
            expect(keysMock).not.toHaveBeenCalled()
        } finally {
            ;(ENVIRONMENT_CONFIG.MUSIC as Record<string, unknown>).SESSION_RESTORE_ENABLED = original
        }
    })

    it('returns early when no Redis session keys exist', async () => {
        keysMock.mockResolvedValue([])
        const client = makeClient()
        await restoreSessionsOnStartup(client as unknown as import('../../types').CustomClient)
        expect(getSnapshotMock).not.toHaveBeenCalled()
    })

    it('skips guild not in cache', async () => {
        const client = makeClient()
        ;(client.guilds.cache.get as jest.Mock).mockReturnValue(undefined)
        await restoreSessionsOnStartup(client as unknown as import('../../types').CustomClient)
        expect(getSnapshotMock).not.toHaveBeenCalled()
    })

    it('skips snapshot with missing voiceChannelId', async () => {
        getSnapshotMock.mockResolvedValue(makeSnapshot({ voiceChannelId: undefined }))
        const client = makeClient()
        await restoreSessionsOnStartup(client as unknown as import('../../types').CustomClient)
        expect(client.player.nodes.create).not.toHaveBeenCalled()
    })

    it('deletes stale snapshot and skips restore', async () => {
        getSnapshotMock.mockResolvedValue(makeSnapshot({ savedAt: STALE_SAVED_AT }))
        const client = makeClient()
        await restoreSessionsOnStartup(client as unknown as import('../../types').CustomClient)
        expect(deleteSnapshotMock).toHaveBeenCalledWith(GUILD_ID)
        expect(client.player.nodes.create).not.toHaveBeenCalled()
    })

    it('skips when voice channel is not found or not voice-based', async () => {
        const client = makeClient()
        ;(client._guild.channels.cache.get as jest.Mock).mockReturnValue({
            id: VOICE_CHANNEL_ID,
            isVoiceBased: () => false,
        })
        await restoreSessionsOnStartup(client as unknown as import('../../types').CustomClient)
        expect(client.player.nodes.create).not.toHaveBeenCalled()
    })

    it('creates queue, connects to voice, and restores snapshot for valid entry', async () => {
        const client = makeClient()
        await restoreSessionsOnStartup(client as unknown as import('../../types').CustomClient)
        expect(client.player.nodes.create).toHaveBeenCalledWith(
            client._guild,
            expect.objectContaining({ metadata: expect.anything() }),
        )
        expect(client._queue.connect).toHaveBeenCalled()
        expect(restoreSnapshotMock).toHaveBeenCalledWith(
            client._queue,
            undefined,
            { maxAgeMs: 30 * 60 * 1_000 },
        )
    })

    it('isolates per-guild errors and continues sweep', async () => {
        keysMock.mockResolvedValue([
            `music:session:guild-fail`,
            `music:session:${GUILD_ID}`,
        ])
        const client = makeClient()
        const originalGet = (client.guilds.cache.get as jest.Mock).getMockImplementation()
        ;(client.guilds.cache.get as jest.Mock).mockImplementation((id: string) => {
            if (id === 'guild-fail') throw new Error('boom')
            return originalGet ? originalGet(id) : undefined
        })
        await expect(
            restoreSessionsOnStartup(client as unknown as import('../../types').CustomClient)
        ).resolves.not.toThrow()
        expect(restoreSnapshotMock).toHaveBeenCalledTimes(1)
    })
})
