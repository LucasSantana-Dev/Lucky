import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { MessageFlags } from 'discord.js'
import type { ButtonInteraction } from 'discord.js'

type AnyFn = (...args: any[]) => any

const getWeeklyRecapMock = jest.fn<AnyFn>()
const searchMock = jest.fn<AnyFn>()
const playMock = jest.fn<AnyFn>()
const addTrackMock = jest.fn<AnyFn>()
const recapMixPlayedTotalIncMock = jest.fn()
const errorLogMock = jest.fn()
const resolveGuildQueueMock = jest.fn<AnyFn>()

jest.mock('@lucky/shared/services', () => ({
    getWeeklyRecap: (...a: unknown[]) => getWeeklyRecapMock(...a),
}))
jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: { PLAYER: { CONNECTION_TIMEOUT: 5000 } },
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...a: unknown[]) => errorLogMock(...a),
}))
jest.mock('../../i18n/translatorForInteraction', () => ({
    translatorForInteraction:
        async () => (key: string, opts?: Record<string, unknown>) =>
            opts ? `${key}:${JSON.stringify(opts)}` : key,
}))
jest.mock('../../services/recap/recapWindow', () => ({
    latestRecapBoundary: () => new Date('2026-10-19T18:00:00Z'),
    recapWindow: (b: Date) => ({
        from: new Date(b.getTime() - 7 * 24 * 60 * 60 * 1000),
        to: b,
    }),
}))
jest.mock('../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...a: unknown[]) => resolveGuildQueueMock(...a),
}))
jest.mock('../../utils/monitoring/prometheus', () => ({
    recapMixPlayedTotal: { inc: recapMixPlayedTotalIncMock },
}))

import { handleRecapMixButton, RECAP_MIX_BUTTON_ID } from './recapMixButton'

const TOP_TRACKS = [
    { title: 'Track A', author: 'Artist 1', plays: 10 },
    { title: 'Track B', author: 'Artist 2', plays: 8 },
]

const MOCK_TRACK = { requestedBy: undefined, title: 'Track A' }

function makeInteraction(inVoice = true) {
    const playerMock = { search: searchMock, play: playMock }
    return {
        customId: RECAP_MIX_BUTTON_ID,
        guildId: 'g-1',
        user: { id: 'u-1' },
        channel: {},
        client: { player: playerMock },
        member: {
            voice: { channel: inVoice ? { id: 'vc-1' } : null },
        },
        deferUpdate: jest.fn<AnyFn>().mockResolvedValue(undefined),
        followUp: jest.fn<AnyFn>().mockResolvedValue(undefined),
    }
}

const ephemeral = (content: string) => ({
    content,
    flags: MessageFlags.Ephemeral,
})

describe('handleRecapMixButton (#2739)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getWeeklyRecapMock.mockResolvedValue({ topTracks: TOP_TRACKS })
        searchMock.mockResolvedValue({
            hasTracks: () => true,
            tracks: [MOCK_TRACK],
        })
        playMock.mockResolvedValue(undefined)
        resolveGuildQueueMock.mockReturnValue({
            queue: { addTrack: addTrackMock },
        })
    })

    it('defers the update before doing any async work', async () => {
        const interaction = makeInteraction()
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        expect(
            interaction.deferUpdate.mock.invocationCallOrder[0],
        ).toBeLessThan(getWeeklyRecapMock.mock.invocationCallOrder[0])
    })

    it('replies with no-voice message when user is not in a voice channel', async () => {
        const interaction = makeInteraction(false)
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        expect(interaction.followUp).toHaveBeenCalledWith(
            ephemeral('music.recap.mixNoVoice'),
        )
        expect(playMock).not.toHaveBeenCalled()
    })

    it('replies with no-tracks when recap has no top tracks', async () => {
        getWeeklyRecapMock.mockResolvedValue({ topTracks: [] })
        const interaction = makeInteraction()
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        expect(interaction.followUp).toHaveBeenCalledWith(
            ephemeral('music.recap.mixNoTracks'),
        )
    })

    it('plays the first found track and queues the rest', async () => {
        const interaction = makeInteraction()
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        expect(playMock).toHaveBeenCalledTimes(1)
        expect(addTrackMock).toHaveBeenCalledTimes(1)
    })

    it('increments the prometheus counter on success', async () => {
        const interaction = makeInteraction()
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        expect(recapMixPlayedTotalIncMock).toHaveBeenCalledTimes(1)
    })

    it('replies with mixQueued containing track count on success', async () => {
        const interaction = makeInteraction()
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        expect(interaction.followUp).toHaveBeenCalledWith(
            ephemeral(
                expect.stringContaining(
                    'music.recap.mixQueued',
                ) as unknown as string,
            ),
        )
    })

    it('replies with mixFailed when player.play throws', async () => {
        playMock.mockRejectedValue(new Error('connection failed'))
        const interaction = makeInteraction()
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        expect(interaction.followUp).toHaveBeenCalledWith(
            ephemeral('music.recap.mixFailed'),
        )
        expect(recapMixPlayedTotalIncMock).not.toHaveBeenCalled()
    })

    it('skips tracks where search returns no results', async () => {
        searchMock
            .mockResolvedValueOnce({ hasTracks: () => false, tracks: [] })
            .mockResolvedValueOnce({
                hasTracks: () => true,
                tracks: [MOCK_TRACK],
            })
        const interaction = makeInteraction()
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        // Only the second track resolved: play called once, nothing queued
        expect(playMock).toHaveBeenCalledTimes(1)
        expect(addTrackMock).not.toHaveBeenCalled()
    })
})
