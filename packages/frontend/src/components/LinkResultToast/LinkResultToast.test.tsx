import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import LinkResultToast from './LinkResultToast'

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

function LocationProbe() {
    const location = useLocation()
    return <output data-testid='loc'>{location.search}</output>
}

function renderAt(search: string) {
    return render(
        <MemoryRouter initialEntries={[`/${search}`]}>
            <LinkResultToast />
            <LocationProbe />
        </MemoryRouter>,
    )
}

describe('LinkResultToast', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows success and strips spotify_linked', () => {
        const { getByTestId } = renderAt('?spotify_linked=true')
        expect(toast.success).toHaveBeenCalledWith('linkResult.spotifyLinked')
        expect(getByTestId('loc').textContent).toBe('')
    })

    test('shows success and strips lastfm_linked', () => {
        const { getByTestId } = renderAt('?lastfm_linked=true')
        expect(toast.success).toHaveBeenCalledWith('linkResult.lastfmLinked')
        expect(getByTestId('loc').textContent).toBe('')
    })

    test.each([
        ['spotify_connect_error', 'linkResult.errors.spotify_connect_error'],
        [
            'spotify_exchange_failed',
            'linkResult.errors.spotify_exchange_failed',
        ],
        ['spotify_invalid_state', 'linkResult.errors.spotify_invalid_state'],
        ['spotify_missing_code', 'linkResult.errors.spotify_missing_code'],
        ['spotify_missing_state', 'linkResult.errors.spotify_missing_state'],
        ['spotify_not_configured', 'linkResult.errors.spotify_not_configured'],
        ['spotify_save_failed', 'linkResult.errors.spotify_save_failed'],
        ['lastfm_callback_error', 'linkResult.errors.lastfm_callback_error'],
        ['lastfm_connect_error', 'linkResult.errors.lastfm_connect_error'],
        ['lastfm_exchange_failed', 'linkResult.errors.lastfm_exchange_failed'],
        ['lastfm_invalid_state', 'linkResult.errors.lastfm_invalid_state'],
        ['lastfm_missing_state', 'linkResult.errors.lastfm_missing_state'],
        ['lastfm_missing_token', 'linkResult.errors.lastfm_missing_token'],
        ['lastfm_not_configured', 'linkResult.errors.lastfm_not_configured'],
        ['lastfm_save_failed', 'linkResult.errors.lastfm_save_failed'],
    ])('maps %s to its message and strips the param', (code, message) => {
        const { getByTestId } = renderAt(`?error=${code}`)
        expect(toast.error).toHaveBeenCalledWith(message)
        expect(getByTestId('loc').textContent).toBe('')
    })

    test('shows the generic message for unknown codes without echoing them', () => {
        renderAt('?error=<img src=x onerror=alert(1)>')
        expect(toast.error).toHaveBeenCalledWith('linkResult.errors.generic')
        expect(toast.error).toHaveBeenCalledTimes(1)
    })

    test('does not treat a non-link error code as a link result', () => {
        const { getByTestId } = renderAt('?error=other')
        expect(toast.error).toHaveBeenCalledWith('linkResult.errors.generic')
        expect(getByTestId('loc').textContent).toBe('')
    })

    test('ignores *_linked values other than true', () => {
        const { getByTestId } = renderAt('?spotify_linked=false')
        expect(toast.success).not.toHaveBeenCalled()
        expect(getByTestId('loc').textContent).toBe('?spotify_linked=false')
    })

    test('preserves unrelated params', () => {
        const { getByTestId } = renderAt('?foo=bar&spotify_linked=true&x=1')
        expect(toast.success).toHaveBeenCalledTimes(1)
        expect(getByTestId('loc').textContent).toBe('?foo=bar&x=1')
    })

    test('shows nothing when there are no params', () => {
        const { getByTestId } = renderAt('')
        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
        expect(getByTestId('loc').textContent).toBe('')
    })
})
