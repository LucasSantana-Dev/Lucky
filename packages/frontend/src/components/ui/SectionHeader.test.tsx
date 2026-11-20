import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import SectionHeader from './SectionHeader'

describe('SectionHeader', () => {
    test('renders an h1 by default', () => {
        render(<SectionHeader title='Page' />)
        expect(
            screen.getByRole('heading', { level: 1, name: 'Page' }),
        ).toBeInTheDocument()
    })

    test('renders an h2 when headingLevel is 2', () => {
        render(<SectionHeader title='Sub' headingLevel={2} />)
        expect(
            screen.getByRole('heading', { level: 2, name: 'Sub' }),
        ).toBeInTheDocument()
        expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    })
})
