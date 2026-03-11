import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Bell } from 'lucide-react'
import Shell from './Shell'
import SectionHeader from './SectionHeader'
import EmptyState from './EmptyState'
import StatTile from './StatTile'
import ActionPanel from './ActionPanel'

describe('Design primitives', () => {
    test('renders shell and content', () => {
        render(
            <Shell>
                <p>Content body</p>
            </Shell>,
        )

        expect(screen.getByText('Content body')).toBeInTheDocument()
    })

    test('renders section header with actions', () => {
        render(
            <SectionHeader
                eyebrow='Overview'
                title='Dashboard'
                description='Control panel'
                actions={<button>Refresh</button>}
            />,
        )

        expect(screen.getByText('Overview')).toBeInTheDocument()
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
        expect(screen.getByText('Control panel')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    })

    test('renders empty state with action', () => {
        render(
            <EmptyState
                title='No server selected'
                description='Select a server to continue'
                action={<button>Choose server</button>}
            />,
        )

        expect(screen.getByText('No server selected')).toBeInTheDocument()
        expect(screen.getByText('Select a server to continue')).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Choose server' }),
        ).toBeInTheDocument()
    })

    test('renders stat tile with number and trend', () => {
        render(
            <StatTile
                label='Total cases'
                value={1234}
                delta={12}
                tone='brand'
                icon={<Bell className='h-4 w-4' />}
            />,
        )

        expect(screen.getByText('Total cases')).toBeInTheDocument()
        expect(screen.getByText('1,234')).toBeInTheDocument()
        expect(screen.getByText('12%')).toBeInTheDocument()
    })

    test('renders action panel', () => {
        render(
            <ActionPanel
                title='Need help?'
                description='Get support in Discord'
                action={<button>Join now</button>}
            />,
        )

        expect(screen.getByText('Need help?')).toBeInTheDocument()
        expect(screen.getByText('Get support in Discord')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Join now' })).toBeInTheDocument()
    })
})
