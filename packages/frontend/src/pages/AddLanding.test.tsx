import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AddLandingPage from './AddLanding'

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path='/add' element={<AddLandingPage />} />
                <Route path='/l/:source' element={<AddLandingPage />} />
            </Routes>
        </MemoryRouter>,
    )
}

describe('AddLandingPage (#2750)', () => {
    test('sends the query source through /api/add', () => {
        renderAt('/add?source=topgg')
        expect(screen.getByRole('link')).toHaveAttribute(
            'href',
            '/api/add?source=topgg',
        )
    })

    test('reads the source from the path', () => {
        renderAt('/l/botsgg')
        expect(screen.getByRole('link')).toHaveAttribute(
            'href',
            '/api/add?source=botsgg',
        )
    })

    test('falls back for unknown sources and never renders them', () => {
        renderAt('/add?source=%3Cimg%20src=x%3E')
        expect(screen.getByRole('link')).toHaveAttribute(
            'href',
            '/api/add?source=unknown',
        )
        expect(document.body.innerHTML).not.toContain('<img')
    })
})
