import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeatureErrorBanner from './FeatureErrorBanner'
import type { FeatureLoadErrorState } from '@/stores/featuresStore'

vi.mock('@/services/api', () => ({
    api: {
        auth: { getDiscordLoginUrl: () => 'https://api.test/auth/discord' },
    },
}))

const makeError = (
    kind: FeatureLoadErrorState['kind'],
): FeatureLoadErrorState => ({
    kind,
    message: `failed: ${kind}`,
    scope: 'catalog',
})

describe('FeatureErrorBanner', () => {
    test('shows the error message', () => {
        render(
            <FeatureErrorBanner
                loadError={makeError('network')}
                retryLoad={vi.fn()}
            />,
        )

        expect(
            screen.getByText('Unable to load feature data'),
        ).toBeInTheDocument()
        expect(screen.getByText('failed: network')).toBeInTheDocument()
    })

    test('calls retryLoad when Retry is clicked', async () => {
        const retryLoad = vi.fn()
        render(
            <FeatureErrorBanner
                loadError={makeError('upstream')}
                retryLoad={retryLoad}
            />,
        )

        await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

        expect(retryLoad).toHaveBeenCalledTimes(1)
    })

    test.each(['auth', 'forbidden'] as const)(
        'offers a re-authenticate link for %s errors',
        (kind) => {
            render(
                <FeatureErrorBanner
                    loadError={makeError(kind)}
                    retryLoad={vi.fn()}
                />,
            )

            expect(
                screen.getByRole('link', { name: 'Re-authenticate' }),
            ).toHaveAttribute('href', 'https://api.test/auth/discord')
        },
    )

    test.each(['network', 'upstream'] as const)(
        'hides the re-authenticate link for %s errors',
        (kind) => {
            render(
                <FeatureErrorBanner
                    loadError={makeError(kind)}
                    retryLoad={vi.fn()}
                />,
            )

            expect(
                screen.queryByRole('link', { name: 'Re-authenticate' }),
            ).not.toBeInTheDocument()
        },
    )
})
