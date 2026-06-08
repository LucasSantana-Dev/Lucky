import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GlobalTogglesSection from './GlobalTogglesSection'
import { useFeaturesStore } from '@/stores/featuresStore'
import type { FeatureToggleName, FeatureToggleState } from '@/types'

vi.mock('@/stores/featuresStore')
vi.mock('@/components/Features/FeatureCard', () => ({
    default: ({
        feature,
        enabled,
        onToggle,
        readOnly,
    }: {
        feature: { name: string }
        enabled: boolean
        onToggle: (v: boolean) => void
        readOnly: boolean
    }) => (
        <div
            data-testid={`feature-card-${feature.name}`}
            data-enabled={String(enabled)}
            data-readonly={String(readOnly)}
            onClick={() => onToggle(!enabled)}
        >
            {feature.name}
        </div>
    ),
}))

function mockStore(features: unknown[] = []) {
    vi.mocked(useFeaturesStore).mockImplementation((selector?: unknown) => {
        const state = { features }
        return typeof selector === 'function' ? selector(state) : state
    })
}

const baseProps = {
    toggles: {} as unknown as FeatureToggleState,
    provider: 'environment' as const,
    writable: false,
    onToggle: vi.fn() as (name: FeatureToggleName, enabled: boolean) => void,
}

describe('GlobalTogglesSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('renders section heading', () => {
        mockStore()
        render(<GlobalTogglesSection {...baseProps} />)
        expect(screen.getByText('Global Feature Toggles')).toBeInTheDocument()
    })

    test('renders Admin Only badge', () => {
        mockStore()
        render(<GlobalTogglesSection {...baseProps} />)
        expect(screen.getByText('Admin Only')).toBeInTheDocument()
    })

    test.each([
        ['database', 'Database'],
        ['environment', 'Environment'],
    ] as const)('displays %s provider label as "%s"', (provider, label) => {
        mockStore()
        render(<GlobalTogglesSection {...baseProps} provider={provider} />)
        expect(screen.getByText(label)).toBeInTheDocument()
    })

    test('shows writable description when writable=true', () => {
        mockStore()
        render(<GlobalTogglesSection {...baseProps} writable={true} />)
        expect(
            screen.getByText(
                'Toggle features on or off globally. Changes take effect immediately for all servers.',
            ),
        ).toBeInTheDocument()
    })

    test('shows read-only description when writable=false', () => {
        mockStore()
        render(<GlobalTogglesSection {...baseProps} writable={false} />)
        expect(
            screen.getByText(
                'These toggles are managed externally and cannot be changed here.',
            ),
        ).toBeInTheDocument()
    })

    test('renders a FeatureCard per feature in store', () => {
        mockStore([
            {
                name: 'AUTOPLAY' as FeatureToggleName,
                description: 'A',
                isGlobal: true,
            },
            {
                name: 'LYRICS' as FeatureToggleName,
                description: 'B',
                isGlobal: true,
            },
        ])
        render(<GlobalTogglesSection {...baseProps} />)
        expect(screen.getByTestId('feature-card-AUTOPLAY')).toBeInTheDocument()
        expect(screen.getByTestId('feature-card-LYRICS')).toBeInTheDocument()
    })

    test('passes correct enabled state from toggles map', () => {
        mockStore([
            {
                name: 'AUTOPLAY' as FeatureToggleName,
                description: 'A',
                isGlobal: true,
            },
        ])
        render(
            <GlobalTogglesSection
                {...baseProps}
                toggles={{ AUTOPLAY: true } as unknown as FeatureToggleState}
            />,
        )
        expect(screen.getByTestId('feature-card-AUTOPLAY')).toHaveAttribute(
            'data-enabled',
            'true',
        )
    })

    test('defaults missing toggle to false', () => {
        mockStore([
            {
                name: 'AUTOPLAY' as FeatureToggleName,
                description: 'A',
                isGlobal: true,
            },
        ])
        render(
            <GlobalTogglesSection
                {...baseProps}
                toggles={{} as unknown as FeatureToggleState}
            />,
        )
        expect(screen.getByTestId('feature-card-AUTOPLAY')).toHaveAttribute(
            'data-enabled',
            'false',
        )
    })

    test('passes readOnly=true when writable=false', () => {
        mockStore([
            {
                name: 'AUTOPLAY' as FeatureToggleName,
                description: 'A',
                isGlobal: true,
            },
        ])
        render(<GlobalTogglesSection {...baseProps} writable={false} />)
        expect(screen.getByTestId('feature-card-AUTOPLAY')).toHaveAttribute(
            'data-readonly',
            'true',
        )
    })

    test('passes readOnly=false when writable=true', () => {
        mockStore([
            {
                name: 'AUTOPLAY' as FeatureToggleName,
                description: 'A',
                isGlobal: true,
            },
        ])
        render(<GlobalTogglesSection {...baseProps} writable={true} />)
        expect(screen.getByTestId('feature-card-AUTOPLAY')).toHaveAttribute(
            'data-readonly',
            'false',
        )
    })

    test('fires onToggle with feature name and new state when card clicked', async () => {
        const user = userEvent.setup()
        const onToggle = vi.fn() as (
            name: FeatureToggleName,
            enabled: boolean,
        ) => void
        mockStore([
            {
                name: 'AUTOPLAY' as FeatureToggleName,
                description: 'A',
                isGlobal: true,
            },
        ])
        render(
            <GlobalTogglesSection
                {...baseProps}
                toggles={{ AUTOPLAY: false } as unknown as FeatureToggleState}
                writable={true}
                onToggle={onToggle}
            />,
        )
        await user.click(screen.getByTestId('feature-card-AUTOPLAY'))
        expect(onToggle).toHaveBeenCalledWith('AUTOPLAY', true)
    })
})
