import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ButtonStyle, MessageFlags } from 'discord.js'
import type { TFunction } from 'i18next'
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

import {
    buildRecapMixButton,
    handleRecapMixButton,
    RECAP_MIX_BUTTON_ID,
} from './recapMixButton'

const TOP_TRACKS = [
    { title: 'Track A', author: 'Artist 1', plays: 10 },
    { title: 'Track B', author: 'Artist 2', plays: 8 },
]

const TRACK_A = { requestedBy: undefined, title: 'Track A' }
const TRACK_B = { requestedBy: undefined, title: 'Track B' }

const hit = (track: object) => ({ hasTracks: () => true, tracks: [track] })
const miss = { hasTracks: () => false, tracks: [] }

function makeInteraction(inVoice = true) {
    const playerMock = { search: searchMock, play: playMock }
    return {
        customId: RECAP_MIX_BUTTON_ID,
        guildId: 'g-1',
        user: { id: 'u-1' },
        channel: {},
        client: { player: playerMock },
        member: {
            voice: {
                channel: inVoice
                    ? {
                          id: 'vc-1',
                          members: new Map([
                              ['u-1', { id: 'u-1', user: { bot: false } }],
                              ['u-2', { id: 'u-2', user: { bot: false } }],
                              ['bot-1', { id: 'bot-1', user: { bot: true } }],
                          ]),
                      }
                    : null,
            },
        },
        deferUpdate: jest.fn<AnyFn>().mockResolvedValue(undefined),
        followUp: jest.fn<AnyFn>().mockResolvedValue(undefined),
    }
}

const ephemeral = (content: string) => ({
    content,
    flags: MessageFlags.Ephemeral,
})

describe('buildRecapMixButton (#2739)', () => {
    it('builds the primary play button with the recap_mix id', () => {
        const t = ((key: string) => key) as unknown as TFunction
        expect(buildRecapMixButton(t).toJSON()).toEqual(
            expect.objectContaining({
                custom_id: 'recap_mix',
                label: 'music.recap.mixButton',
                style: ButtonStyle.Primary,
                emoji: expect.objectContaining({ name: '▶️' }),
            }),
        )
    })
})

describe('handleRecapMixButton (#2739)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getWeeklyRecapMock.mockResolvedValue({ topTracks: TOP_TRACKS })
        searchMock.mockImplementation(async (query: string) =>
            hit(query.startsWith('Track A') ? TRACK_A : TRACK_B),
        )
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
        expect(searchMock).toHaveBeenCalledWith(
            'Track A Artist 1',
            expect.anything(),
        )
        expect(searchMock).toHaveBeenCalledWith(
            'Track B Artist 2',
            expect.anything(),
        )
        expect(playMock).toHaveBeenCalledTimes(1)
        expect(playMock.mock.calls[0][1]).toBe(TRACK_A)
        expect(addTrackMock).toHaveBeenCalledTimes(1)
        expect(addTrackMock).toHaveBeenCalledWith(TRACK_B)
    })

    it('passes non-bot voice members as vcMemberIds for autoplay', async () => {
        const interaction = makeInteraction()
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        expect(
            playMock.mock.calls[0][2].nodeOptions.metadata.vcMemberIds,
        ).toEqual(['u-1', 'u-2'])
    })

    it('reports only the playing track when the queue cannot be resolved', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: undefined })
        const interaction = makeInteraction()
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        expect(errorLogMock).toHaveBeenCalled()
        expect(interaction.followUp).toHaveBeenCalledWith(
            ephemeral(`music.recap.mixQueued:${JSON.stringify({ count: 1 })}`),
        )
    })

    it('replies with no-tracks and does not play when every search misses', async () => {
        searchMock.mockResolvedValue(miss)
        const interaction = makeInteraction()
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        expect(interaction.followUp).toHaveBeenCalledWith(
            ephemeral('music.recap.mixNoTracks'),
        )
        expect(playMock).not.toHaveBeenCalled()
        expect(recapMixPlayedTotalIncMock).not.toHaveBeenCalled()
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
            ephemeral(`music.recap.mixQueued:${JSON.stringify({ count: 2 })}`),
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
        searchMock.mockReset()
        searchMock
            .mockResolvedValueOnce(miss)
            .mockResolvedValueOnce(hit(TRACK_B))
        const interaction = makeInteraction()
        await handleRecapMixButton(interaction as unknown as ButtonInteraction)
        // Only the second track resolved: play called once, nothing queued
        expect(playMock).toHaveBeenCalledTimes(1)
        expect(addTrackMock).not.toHaveBeenCalled()
    })
})
