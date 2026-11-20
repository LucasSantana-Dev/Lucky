import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotFoundPage from './NotFound'

function renderPage() {
    return render(
        <MemoryRouter>
            <NotFoundPage />
        </MemoryRouter>,
    )
}

describe('NotFound', () => {
    test('renders a single level-one heading', () => {
        renderPage()
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })

    test('links back to the home page', () => {
        renderPage()
        expect(screen.getByRole('link')).toHaveAttribute('href', '/')
    })

    test('sets the document title and meta description', () => {
        renderPage()
        expect(document.title).toBe('Page not found - Lucky')
        expect(
            document
                .querySelector('meta[name="description"]')
                ?.getAttribute('content'),
        ).toBe('The page you are looking for does not exist.')
    })
})
