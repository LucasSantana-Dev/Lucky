import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    createMusicControlButtons,
    createQueuePaginationButtons,
    createLeaderboardPaginationButtons,
} from './buttonComponents'

// jest.mock is hoisted — cannot reference outer-scope const variables in factory
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
    return {
        ActionRowBuilder: jest.fn(() => rowInner),
        ButtonBuilder: MockButtonBuilder,
        ButtonStyle: { Primary: 'PRIMARY', Secondary: 'SECONDARY' },
    }
})

function getRow(): { addComponents: jest.Mock } {
    const { ActionRowBuilder } = jest.requireMock('discord.js') as { ActionRowBuilder: jest.Mock }
    return ActionRowBuilder.mock.results[0]?.value as { addComponents: jest.Mock }
}

function createMockQueue(isPaused: boolean, historyLength: number, tracksSize: number) {
    return {
        node: { isPaused: jest.fn(() => isPaused) },
        history: { tracks: { data: new Array(historyLength).fill({}) } },
        tracks: { size: tracksSize },
    }
}

// Restore addComponents after each resetMocks cycle
beforeEach(() => {
    const { ActionRowBuilder } = jest.requireMock('discord.js') as { ActionRowBuilder: jest.Mock }
    // Build a fresh rowInner per test since resetMocks clears implementations
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
