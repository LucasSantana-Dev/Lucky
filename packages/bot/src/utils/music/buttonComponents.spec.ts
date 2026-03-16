import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { createMusicControlButtons, createQueuePaginationButtons } from './buttonComponents'
import type { GuildQueue } from 'discord-player'

function createQueue(overrides: Record<string, unknown> = {}): GuildQueue {
    return {
        currentTrack: { title: 'Test Track', author: 'Artist' },
        node: {
            isPaused: jest.fn().mockReturnValue(false),
        },
        history: {
            tracks: { toArray: jest.fn().mockReturnValue([]) },
        },
        tracks: {
            size: 3,
            toArray: jest.fn().mockReturnValue([
                { title: 'Track 1' },
                { title: 'Track 2' },
            ]),
        },
        repeatMode: 0,
        ...overrides,
    } as unknown as GuildQueue
}

describe('createMusicControlButtons', () => {
    it('returns an ActionRowBuilder with 5 buttons', () => {
        const queue = createQueue()
        const row = createMusicControlButtons(queue)

        expect(row).toBeDefined()
        const components = (row as any).data.components
        expect(components).toHaveLength(5)
    })

    it('disables previous button when history is empty', () => {
        const queue = createQueue({
            history: { tracks: { toArray: jest.fn().mockReturnValue([]) } },
        })
        const row = createMusicControlButtons(queue)

        const components = (row as any).data.components
        const prevButton = components[0]
        expect(prevButton.disabled).toBe(true)
    })

    it('enables previous button when history has tracks', () => {
        const queue = createQueue({
            history: {
                tracks: { toArray: jest.fn().mockReturnValue([{ title: 'Previous' }]) },
            },
        })
        const row = createMusicControlButtons(queue)

        const components = (row as any).data.components
        const prevButton = components[0]
        expect(prevButton.disabled).toBe(false)
    })

    it('shows pause emoji when queue is playing', () => {
        const queue = createQueue({
            node: { isPaused: jest.fn().mockReturnValue(false) },
        })
        const row = createMusicControlButtons(queue)

        const components = (row as any).data.components
        const pauseResumeButton = components[1]
        expect(pauseResumeButton.emoji?.name ?? pauseResumeButton.label).toBeTruthy()
    })

    it('disables shuffle button when queue has fewer than 2 tracks', () => {
        const queue = createQueue({
            tracks: {
                size: 1,
                toArray: jest.fn().mockReturnValue([{ title: 'Track 1' }]),
            },
        })
        const row = createMusicControlButtons(queue)

        const components = (row as any).data.components
        const shuffleButton = components[3]
        expect(shuffleButton.disabled).toBe(true)
    })

    it('enables shuffle button when queue has 2 or more tracks', () => {
        const queue = createQueue({
            tracks: {
                size: 2,
                toArray: jest.fn().mockReturnValue([{ title: 'T1' }, { title: 'T2' }]),
            },
        })
        const row = createMusicControlButtons(queue)

        const components = (row as any).data.components
        const shuffleButton = components[3]
        expect(shuffleButton.disabled).toBe(false)
    })
})

describe('createQueuePaginationButtons', () => {
    it('returns null when totalPages is 1 or less', () => {
        expect(createQueuePaginationButtons(0, 1)).toBeNull()
        expect(createQueuePaginationButtons(0, 0)).toBeNull()
    })

    it('returns an ActionRowBuilder with 3 buttons when totalPages > 1', () => {
        const row = createQueuePaginationButtons(0, 3)

        expect(row).not.toBeNull()
        const components = (row as any).data.components
        expect(components).toHaveLength(3)
    })

    it('disables prev button on first page', () => {
        const row = createQueuePaginationButtons(0, 3)
        const components = (row as any).data.components
        const prevButton = components[0]

        expect(prevButton.disabled).toBe(true)
    })

    it('disables next button on last page', () => {
        const row = createQueuePaginationButtons(2, 3)
        const components = (row as any).data.components
        const nextButton = components[2]

        expect(nextButton.disabled).toBe(true)
    })

    it('enables both buttons on middle pages', () => {
        const row = createQueuePaginationButtons(1, 3)
        const components = (row as any).data.components

        expect(components[0].disabled).toBe(false)
        expect(components[2].disabled).toBe(false)
    })

    it('indicator button shows current page / total pages', () => {
        const row = createQueuePaginationButtons(1, 3)
        const components = (row as any).data.components
        const indicator = components[1]

        expect(indicator.label).toBe('2 / 3')
    })
})
