import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import QueueList from './QueueList'
import type { TrackInfo } from '@/types'

vi.mock('sonner', () => ({
    toast: { success: vi.fn() },
}))

function makeTrack(index: number): TrackInfo {
    return {
        id: `track-${index}`,
        title: `Track ${index}`,
        author: `Artist ${index}`,
        url: `https://example.com/track-${index}`,
        duration: 180 + index,
        durationFormatted: `3:${String(index).padStart(2, '0')}`,
        source: 'youtube',
    }
}

function makeTracks(count: number): TrackInfo[] {
    return Array.from({ length: count }, (_, i) => makeTrack(i + 1))
}

describe('QueueList', () => {
    const onRemove = vi.fn()
    const onMove = vi.fn()
    const onClear = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('renders loading skeleton', () => {
        render(
            <QueueList
                tracks={[]}
                isLoading
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        expect(screen.queryByText('Queue')).not.toBeInTheDocument()
    })

    test('renders empty state', () => {
        render(
            <QueueList
                tracks={[]}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        expect(screen.getByText('Queue is empty')).toBeInTheDocument()
        expect(screen.getByText('(0 tracks)')).toBeInTheDocument()
        expect(screen.queryByLabelText('Clear queue')).not.toBeInTheDocument()
    })

    test('renders tracks with titles and authors', () => {
        render(
            <QueueList
                tracks={makeTracks(3)}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        expect(screen.getByText('Track 1')).toBeInTheDocument()
        expect(screen.getByText('Artist 2')).toBeInTheDocument()
        expect(screen.getByText('Track 3')).toBeInTheDocument()
        expect(screen.getByText('(3 tracks)')).toBeInTheDocument()
    })

    test('shows singular track count for 1 track', () => {
        render(
            <QueueList
                tracks={makeTracks(1)}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        expect(screen.getByText('(1 track)')).toBeInTheDocument()
    })

    test('calls onRemove when remove button clicked', async () => {
        const user = userEvent.setup()
        render(
            <QueueList
                tracks={makeTracks(2)}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        const removeButtons = screen.getAllByLabelText(/Remove .* from queue/)
        await user.click(removeButtons[0])

        expect(onRemove).toHaveBeenCalledWith(0)
    })

    test('calls onClear when clear button clicked', async () => {
        const user = userEvent.setup()
        render(
            <QueueList
                tracks={makeTracks(2)}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        await user.click(screen.getByLabelText('Clear queue'))
        expect(onClear).toHaveBeenCalled()
    })

    test('shows show more button when > 20 tracks', () => {
        render(
            <QueueList
                tracks={makeTracks(25)}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        expect(
            screen.getByLabelText('Show more tracks (5 remaining)'),
        ).toBeInTheDocument()
        expect(screen.getByText('Show 5 more')).toBeInTheDocument()
    })

    test('shows more tracks when show more clicked', async () => {
        const user = userEvent.setup()
        render(
            <QueueList
                tracks={makeTracks(25)}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        expect(screen.queryByText('Track 25')).not.toBeInTheDocument()

        await user.click(screen.getByText('Show 5 more'))

        expect(screen.getByText('Track 25')).toBeInTheDocument()
    })

    test('does not show show more for <= 20 tracks', () => {
        render(
            <QueueList
                tracks={makeTracks(15)}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        expect(screen.queryByText(/Show .* more/)).not.toBeInTheDocument()
    })

    test('drag and drop calls onMove', () => {
        render(
            <QueueList
                tracks={makeTracks(3)}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        const items = screen.getAllByRole('listitem')

        fireEvent.dragStart(items[0])
        fireEvent.dragOver(items[2], { preventDefault: vi.fn() })
        fireEvent.drop(items[2])

        expect(onMove).toHaveBeenCalledWith(0, 2)
    })

    test('drag end resets drop target', () => {
        render(
            <QueueList
                tracks={makeTracks(3)}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        const items = screen.getAllByRole('listitem')

        fireEvent.dragStart(items[0])
        fireEvent.dragOver(items[1], { preventDefault: vi.fn() })
        fireEvent.dragEnd(items[0])

        expect(onMove).not.toHaveBeenCalled()
    })

    test('renders track thumbnail image', () => {
        const tracks = [
            {
                ...makeTrack(1),
                thumbnail: 'https://img.example.com/thumb.jpg',
            },
        ]
        render(
            <QueueList
                tracks={tracks}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        const img = document.querySelector('img')
        expect(img).toBeInTheDocument()
        expect(img?.src).toContain('thumb.jpg')
    })

    test('renders placeholder when no thumbnail', () => {
        render(
            <QueueList
                tracks={makeTracks(1)}
                onRemove={onRemove}
                onMove={onMove}
                onClear={onClear}
            />,
        )

        expect(document.querySelector('img')).not.toBeInTheDocument()
    })
})
