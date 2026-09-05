import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { api } from '@/services/api'

vi.mock('@/services/api')

import AutoplayTelemetry from './AutoplayTelemetry'

const MOCK_HISTORY = {
    summary: {
        totalPicks: 40,
        accepted: 30,
        rejected: 10,
        pending: 0,
        globalAcceptanceRate: 0.75,
    },
    perSource: [
        {
            source: 'youtube',
            count: 25,
            acceptedCount: 20,
            rejectedCount: 5,
            pendingCount: 0,
            acceptanceRate: 0.8,
        },
        {
            source: 'spotify',
            count: 15,
            acceptedCount: 10,
            rejectedCount: 5,
            pendingCount: 0,
            acceptanceRate: 0.67,
        },
    ],
}

describe('AutoplayTelemetry', () => {
    const guildId = 'guild-1'

    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('renders the per-source table and overall summary', async () => {
        vi.mocked(api.recommendations.getHistory).mockResolvedValue({
            data: MOCK_HISTORY,
        } as any)

        render(<AutoplayTelemetry guildId={guildId} />)

        expect(await screen.findByText('youtube')).toBeInTheDocument()
        expect(screen.getByText('spotify')).toBeInTheDocument()
        expect(screen.getByText('80%')).toBeInTheDocument()
        expect(
            screen.getByText(/30 of 40 picks accepted overall/),
        ).toBeInTheDocument()
        expect(api.recommendations.getHistory).toHaveBeenCalledWith(guildId, 7)
    })

    test('shows empty state when perSource is empty', async () => {
        vi.mocked(api.recommendations.getHistory).mockResolvedValue({
            data: { summary: MOCK_HISTORY.summary, perSource: [] },
        } as any)

        render(<AutoplayTelemetry guildId={guildId} />)

        expect(
            await screen.findByText('No autoplay history yet'),
        ).toBeInTheDocument()
    })

    test('labels a null source as unknown', async () => {
        vi.mocked(api.recommendations.getHistory).mockResolvedValue({
            data: {
                summary: MOCK_HISTORY.summary,
                perSource: [
                    {
                        source: null,
                        count: 5,
                        acceptedCount: 2,
                        rejectedCount: 1,
                        pendingCount: 2,
                        acceptanceRate: null,
                    },
                ],
            },
        } as any)

        render(<AutoplayTelemetry guildId={guildId} />)

        expect(await screen.findByText('Unknown')).toBeInTheDocument()
        expect(screen.getByText('—')).toBeInTheDocument()
    })

    test('shows a failure message when the history request rejects', async () => {
        vi.mocked(api.recommendations.getHistory).mockRejectedValue(
            new Error('network error'),
        )

        render(<AutoplayTelemetry guildId={guildId} />)

        expect(
            await screen.findByText('Failed to load autoplay acceptance data.'),
        ).toBeInTheDocument()
    })

    test('refetches with 30 days when the 30d toggle is clicked', async () => {
        vi.mocked(api.recommendations.getHistory).mockResolvedValue({
            data: MOCK_HISTORY,
        } as any)

        render(<AutoplayTelemetry guildId={guildId} />)
        await screen.findByText('youtube')

        screen.getByRole('button', { name: '30d' }).click()

        await waitFor(() =>
            expect(api.recommendations.getHistory).toHaveBeenCalledWith(
                guildId,
                30,
            ),
        )
    })
})
