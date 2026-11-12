import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    createMusicControlButtons,
    createMusicActionButtons,
    createQueuePaginationButtons,
    createLeaderboardPaginationButtons,
    createNowPlayingButtons,
    refreshMusicComponents,
} from './buttonComponents'
import { MUSIC_BUTTON_IDS } from '../../types/musicButtons'

jest.mock('discord.js', () => {
    class MockButtonBuilder {
        setCustomId = jest.fn().mockReturnThis()
        setEmoji = jest.fn().mockReturnThis()
        setLabel = jest.fn().mockReturnThis()
        setStyle = jest.fn().mockReturnThis()
        setDisabled = jest.fn().mockReturnThis()
    }
    const rowInner = { addComponents: jest.fn() }
    rowInner.addComponents.mockReturnValue(rowInner)
    const ActionRowBuilder = Object.assign(
        jest.fn(() => rowInner),
        { from: jest.fn((row: unknown) => ({ keptRow: row })) },
    )
    return {
        ActionRowBuilder,
        ButtonBuilder: MockButtonBuilder,
        ButtonStyle: {
            Primary: 'PRIMARY',
            Secondary: 'SECONDARY',
            Danger: 'DANGER',
        },
    }
})

jest.mock('discord-player', () => ({
    QueueRepeatMode: { OFF: 0, TRACK: 1, QUEUE: 2, AUTOPLAY: 3 },
}))

function getRow(): { addComponents: jest.Mock } {
    const { ActionRowBuilder } = jest.requireMock('discord.js') as {
        ActionRowBuilder: jest.Mock
    }
    return ActionRowBuilder.mock.results[0]?.value as {
        addComponents: jest.Mock
    }
}

function createMockQueue(
    isPaused: boolean,
    historyLength: number,
    tracksSize: number,
    repeatMode = 0,
) {
    return {
        node: { isPaused: jest.fn(() => isPaused) },
        history: { tracks: { data: new Array(historyLength).fill({}) } },
        tracks: { size: tracksSize },
        repeatMode,
    }
}

beforeEach(() => {
    const { ActionRowBuilder } = jest.requireMock('discord.js') as {
        ActionRowBuilder: jest.Mock
    }
    const rowInner = { addComponents: jest.fn().mockReturnThis() }
    ActionRowBuilder.mockReturnValue(rowInner)
})

describe('createMusicControlButtons', () => {
    it('calls addComponents with 5 buttons', () => {
        const queue = createMockQueue(false, 0, 0)
        createMusicControlButtons(queue as never)
        const row = getRow()
        const [call] = row.addComponents.mock.calls
        expect((call as unknown[]).length).toBe(5)
    })

    it('passes isPaused true to control logic without throwing', () => {
        const queue = createMockQueue(true, 0, 0)
        expect(() => createMusicControlButtons(queue as never)).not.toThrow()
    })

    it('passes isPaused false to control logic without throwing', () => {
        const queue = createMockQueue(false, 0, 0)
        expect(() => createMusicControlButtons(queue as never)).not.toThrow()
    })

    it('does not throw with empty history (disabled state)', () => {
        const queue = createMockQueue(false, 0, 0)
        expect(() => createMusicControlButtons(queue as never)).not.toThrow()
        const row = getRow()
        expect(row.addComponents).toHaveBeenCalled()
    })
})

describe('createMusicActionButtons', () => {
    it('calls addComponents with stop, clear, clear autoplay and the thumbs pair (#2658)', () => {
        const queue = createMockQueue(false, 0, 0)
        createMusicActionButtons(queue as never)
        const row = getRow()
        const [call] = row.addComponents.mock.calls
        expect((call as unknown[]).length).toBe(5)
    })

    it('does not throw when autoplay is active', () => {
        const queue = createMockQueue(false, 0, 0, 3)
        expect(() => createMusicActionButtons(queue as never)).not.toThrow()
    })

    it('does not throw when autoplay is off', () => {
        const queue = createMockQueue(false, 0, 0, 0)
        expect(() => createMusicActionButtons(queue as never)).not.toThrow()
    })
})

describe('createQueuePaginationButtons', () => {
    it('returns null when totalPages <= 1', () => {
        expect(createQueuePaginationButtons(0, 1)).toBeNull()
        expect(createQueuePaginationButtons(0, 0)).toBeNull()
    })

    it('returns a row when totalPages > 1', () => {
        const result = createQueuePaginationButtons(1, 3)
        expect(result).toBeDefined()
        expect(result).not.toBeNull()
    })

    it('calls addComponents with 3 buttons for multi-page queue', () => {
        createQueuePaginationButtons(1, 3)
        const row = getRow()
        const [call] = row.addComponents.mock.calls
        expect((call as unknown[]).length).toBe(3)
    })

    it('does not throw for first page', () => {
        expect(() => createQueuePaginationButtons(0, 5)).not.toThrow()
    })
})

describe('createLeaderboardPaginationButtons', () => {
    it('returns null when totalPages <= 1', () => {
        expect(createLeaderboardPaginationButtons(0, 1)).toBeNull()
        expect(createLeaderboardPaginationButtons(0, 0)).toBeNull()
    })

    it('returns a row when totalPages > 1', () => {
        const result = createLeaderboardPaginationButtons(0, 3)
        expect(result).toBeDefined()
        expect(result).not.toBeNull()
    })

    it('calls addComponents with 3 buttons for multi-page leaderboard', () => {
        createLeaderboardPaginationButtons(1, 3)
        const row = getRow()
        const [call] = row.addComponents.mock.calls
        expect((call as unknown[]).length).toBe(3)
    })

    it('does not throw for first page', () => {
        expect(() => createLeaderboardPaginationButtons(0, 5)).not.toThrow()
    })

    it('does not throw for last page', () => {
        expect(() => createLeaderboardPaginationButtons(4, 5)).not.toThrow()
    })
})

type MockRow = { addComponents: jest.Mock }
type MockButton = {
    setCustomId: jest.Mock
    setEmoji: jest.Mock
    setLabel: jest.Mock
    setStyle: jest.Mock
}

function freshRowPerCall(): void {
    const { ActionRowBuilder } = jest.requireMock('discord.js') as {
        ActionRowBuilder: jest.Mock
    }
    ActionRowBuilder.mockImplementation(() => {
        const row = { addComponents: jest.fn() }
        row.addComponents.mockReturnValue(row)
        return row
    })
}

function buttonsOf(row: unknown): MockButton[] {
    return (row as MockRow).addComponents.mock.calls[0] as MockButton[]
}

function idsOf(row: unknown): string[] {
    return buttonsOf(row).map(
        (button) => button.setCustomId.mock.calls[0][0] as string,
    )
}

describe('createNowPlayingButtons', () => {
    beforeEach(freshRowPerCall)

    it('is one row: pause, skip, like, dislike and More', () => {
        const row = createNowPlayingButtons(
            createMockQueue(false, 0, 0) as never,
            'Mais',
        )

        expect(idsOf(row)).toEqual([
            MUSIC_BUTTON_IDS.PAUSE_RESUME,
            MUSIC_BUTTON_IDS.SKIP,
            MUSIC_BUTTON_IDS.LIKE,
            MUSIC_BUTTON_IDS.DISLIKE,
            MUSIC_BUTTON_IDS.MORE_CONTROLS,
        ])
        const more = buttonsOf(row)[4]
        expect(more.setLabel).toHaveBeenCalledWith('Mais')
    })

    it('shows pause while playing and play while paused', () => {
        const playing = createNowPlayingButtons(
            createMockQueue(false, 0, 0) as never,
            'More',
        )
        const paused = createNowPlayingButtons(
            createMockQueue(true, 0, 0) as never,
            'More',
        )

        expect(buttonsOf(playing)[0].setEmoji).toHaveBeenCalledWith('⏸️')
        expect(buttonsOf(paused)[0].setEmoji).toHaveBeenCalledWith('▶️')
    })
})

describe('refreshMusicComponents', () => {
    beforeEach(freshRowPerCall)

    const row = (...ids: string[]) => ({
        components: ids.map((customId) => ({
            customId,
            label: customId === MUSIC_BUTTON_IDS.MORE_CONTROLS ? 'Más' : null,
        })),
    })

    it('keeps the compact now-playing row compact, with its own label', () => {
        const [refreshed] = refreshMusicComponents(
            [
                row(
                    MUSIC_BUTTON_IDS.PAUSE_RESUME,
                    MUSIC_BUTTON_IDS.SKIP,
                    MUSIC_BUTTON_IDS.LIKE,
                    MUSIC_BUTTON_IDS.DISLIKE,
                    MUSIC_BUTTON_IDS.MORE_CONTROLS,
                ),
            ],
            createMockQueue(true, 0, 0) as never,
        )

        expect(idsOf(refreshed)).toContain(MUSIC_BUTTON_IDS.MORE_CONTROLS)
        expect(buttonsOf(refreshed)[4].setLabel).toHaveBeenCalledWith('Más')
    })

    it('rebuilds the two full rows of the controls panel', () => {
        const rows = refreshMusicComponents(
            [
                row(MUSIC_BUTTON_IDS.PREVIOUS, MUSIC_BUTTON_IDS.PAUSE_RESUME),
                row(MUSIC_BUTTON_IDS.STOP, MUSIC_BUTTON_IDS.CLEAR_QUEUE),
            ],
            createMockQueue(false, 0, 0) as never,
        )

        expect(rows).toHaveLength(2)
        expect(idsOf(rows[0])).toContain(MUSIC_BUTTON_IDS.PREVIOUS)
        expect(idsOf(rows[1])).toContain(MUSIC_BUTTON_IDS.STOP)
    })

    it('keeps rows it does not own, like the queue pages, as they are', () => {
        const pages = row('queue_page_0', 'page_indicator', 'queue_page_2')
        const rows = refreshMusicComponents(
            [
                row(MUSIC_BUTTON_IDS.PREVIOUS, MUSIC_BUTTON_IDS.PAUSE_RESUME),
                pages,
            ],
            createMockQueue(false, 0, 0) as never,
        )

        expect(rows).toHaveLength(2)
        expect(rows[1]).toEqual({ keptRow: pages })
    })

    it('falls back to the full panel when the message has no rows', () => {
        const rows = refreshMusicComponents(
            undefined,
            createMockQueue(false, 0, 0) as never,
        )

        expect(rows).toHaveLength(2)
        expect(idsOf(rows[0])).toContain(MUSIC_BUTTON_IDS.PAUSE_RESUME)
        expect(idsOf(rows[1])).toContain(MUSIC_BUTTON_IDS.STOP)
    })
})
