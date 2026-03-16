import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const shuffleQueueMock = jest.fn()
const createMusicControlButtonsMock = jest.fn()
const createQueueEmbedMock = jest.fn()

jest.mock('../utils/music/queueManipulation', () => ({
    shuffleQueue: (...args: unknown[]) => shuffleQueueMock(...args),
}))

jest.mock('../utils/music/buttonComponents', () => ({
    createMusicControlButtons: (...args: unknown[]) => createMusicControlButtonsMock(...args),
}))

jest.mock('../functions/music/commands/queue/queueEmbed', () => ({
    createQueueEmbed: (...args: unknown[]) => createQueueEmbedMock(...args),
}))

import { handleMusicButtonInteraction } from './musicButtonHandler'

function createInteraction(customId: string, overrides: Record<string, unknown> = {}) {
    return {
        customId,
        guild: { id: 'guild-1' },
        update: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
        deferUpdate: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as any
}

function createPlayer(queueOverrides: Record<string, unknown> = {}) {
    return {
        nodes: {
            get: jest.fn().mockReturnValue({
                currentTrack: { title: 'Test Track' },
                node: {
                    isPaused: jest.fn().mockReturnValue(false),
                    pause: jest.fn(),
                    resume: jest.fn(),
                    skip: jest.fn(),
                },
                history: {
                    tracks: { toArray: jest.fn().mockReturnValue([{ title: 'Previous' }]) },
                    back: jest.fn().mockResolvedValue(undefined),
                },
                tracks: { size: 2, toArray: jest.fn().mockReturnValue([]) },
                repeatMode: 0,
                setRepeatMode: jest.fn(),
                ...queueOverrides,
            }),
        },
    } as any
}

describe('handleMusicButtonInteraction', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createMusicControlButtonsMock.mockReturnValue({ data: { components: [] } })
        createQueueEmbedMock.mockResolvedValue({ embed: {}, components: [] })
    })

    it('returns early when guild is null', async () => {
        const interaction = createInteraction('music_skip', { guild: null })

        await handleMusicButtonInteraction(interaction, createPlayer())

        expect(interaction.update).not.toHaveBeenCalled()
        expect(interaction.reply).not.toHaveBeenCalled()
    })

    it('returns early when no queue found', async () => {
        const interaction = createInteraction('music_skip')
        const player = { nodes: { get: jest.fn().mockReturnValue(null) } } as any

        await handleMusicButtonInteraction(interaction, player)

        expect(interaction.update).not.toHaveBeenCalled()
    })

    it('skips track when skip button is clicked', async () => {
        const interaction = createInteraction('music_skip')
        const queue = {
            currentTrack: { title: 'Test Track' },
            node: {
                isPaused: jest.fn().mockReturnValue(false),
                pause: jest.fn(),
                resume: jest.fn(),
                skip: jest.fn(),
            },
            history: { tracks: { toArray: jest.fn().mockReturnValue([]) }, back: jest.fn() },
            tracks: { size: 2, toArray: jest.fn().mockReturnValue([]) },
            repeatMode: 0,
            setRepeatMode: jest.fn(),
        }
        const player = { nodes: { get: jest.fn().mockReturnValue(queue) } } as any

        await handleMusicButtonInteraction(interaction, player)

        expect(queue.node.skip).toHaveBeenCalled()
        expect(interaction.update).toHaveBeenCalled()
    })

    it('shuffles queue when shuffle button is clicked', async () => {
        const interaction = createInteraction('music_shuffle')
        const player = createPlayer()

        await handleMusicButtonInteraction(interaction, player)

        expect(shuffleQueueMock).toHaveBeenCalled()
        expect(interaction.update).toHaveBeenCalled()
    })

    it('toggles pause when pause/resume button is clicked while playing', async () => {
        const interaction = createInteraction('music_pause_resume')
        const queue = {
            currentTrack: { title: 'Test Track' },
            node: {
                isPaused: jest.fn().mockReturnValue(false),
                pause: jest.fn(),
                resume: jest.fn(),
                skip: jest.fn(),
            },
            history: { tracks: { toArray: jest.fn().mockReturnValue([]) }, back: jest.fn() },
            tracks: { size: 2, toArray: jest.fn().mockReturnValue([]) },
            repeatMode: 0,
            setRepeatMode: jest.fn(),
        }
        const player = { nodes: { get: jest.fn().mockReturnValue(queue) } } as any

        await handleMusicButtonInteraction(interaction, player)

        expect(queue.node.pause).toHaveBeenCalled()
        expect(interaction.update).toHaveBeenCalled()
    })

    it('resumes when pause/resume button is clicked while paused', async () => {
        const interaction = createInteraction('music_pause_resume')
        const queue = {
            currentTrack: { title: 'Test Track' },
            node: {
                isPaused: jest.fn().mockReturnValue(true),
                pause: jest.fn(),
                resume: jest.fn(),
                skip: jest.fn(),
            },
            history: { tracks: { toArray: jest.fn().mockReturnValue([]) }, back: jest.fn() },
            tracks: { size: 2, toArray: jest.fn().mockReturnValue([]) },
            repeatMode: 0,
            setRepeatMode: jest.fn(),
        }
        const player = { nodes: { get: jest.fn().mockReturnValue(queue) } } as any

        await handleMusicButtonInteraction(interaction, player)

        expect(queue.node.resume).toHaveBeenCalled()
        expect(interaction.update).toHaveBeenCalled()
    })

    it('cycles loop mode when loop button is clicked', async () => {
        const interaction = createInteraction('music_loop')
        const queue = {
            currentTrack: { title: 'Test Track' },
            node: {
                isPaused: jest.fn().mockReturnValue(false),
                pause: jest.fn(),
                resume: jest.fn(),
                skip: jest.fn(),
            },
            history: { tracks: { toArray: jest.fn().mockReturnValue([]) }, back: jest.fn() },
            tracks: { size: 2, toArray: jest.fn().mockReturnValue([]) },
            repeatMode: 0,
            setRepeatMode: jest.fn(),
        }
        const player = { nodes: { get: jest.fn().mockReturnValue(queue) } } as any

        await handleMusicButtonInteraction(interaction, player)

        expect(queue.setRepeatMode).toHaveBeenCalled()
        expect(interaction.update).toHaveBeenCalled()
    })

    it('goes back in history when previous button is clicked', async () => {
        const interaction = createInteraction('music_previous')
        const backMock = jest.fn().mockResolvedValue(undefined)
        const queue = {
            currentTrack: { title: 'Test Track' },
            node: {
                isPaused: jest.fn().mockReturnValue(false),
                pause: jest.fn(),
                resume: jest.fn(),
                skip: jest.fn(),
            },
            history: {
                tracks: { toArray: jest.fn().mockReturnValue([{ title: 'Previous' }]) },
                back: backMock,
            },
            tracks: { size: 2, toArray: jest.fn().mockReturnValue([]) },
            repeatMode: 0,
            setRepeatMode: jest.fn(),
        }
        const player = { nodes: { get: jest.fn().mockReturnValue(queue) } } as any

        await handleMusicButtonInteraction(interaction, player)

        expect(backMock).toHaveBeenCalled()
    })
})
