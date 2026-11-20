import { describe, test, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useNavigation } from './useNavigation'
import { useGuildStore } from '@/stores/guildStore'

const renderAt = (pathname: string) =>
    renderHook(() => useNavigation(), {
        wrapper: ({ children }: { children: ReactNode }) => (
            <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>
        ),
    }).result.current

const access = (overrides: Record<string, string> = {}) =>
    ({
        overview: 'none',
        settings: 'none',
        moderation: 'none',
        automation: 'none',
        music: 'none',
        integrations: 'none',
        ...overrides,
    }) as never

describe('useNavigation', () => {
    beforeEach(() => {
        useGuildStore.setState({ selectedGuild: null, memberContext: null })
    })

    describe('isActive', () => {
        test('matches the root only on exactly "/"', () => {
            expect(renderAt('/').isActive('/')).toBe(true)
            expect(renderAt('/music').isActive('/')).toBe(false)
        })

        test('matches an exact path', () => {
            expect(renderAt('/music').isActive('/music')).toBe(true)
        })

        test('matches a sub-route when no more specific nav item owns it', () => {
            expect(renderAt('/music/unknown-child').isActive('/music')).toBe(
                true,
            )
        })

        test('prefers the more specific nav item over its prefix', () => {
            const nav = renderAt('/music/history')

            expect(nav.isActive('/music/history')).toBe(true)
            expect(nav.isActive('/music')).toBe(false)
        })

        test('treats admin paths as owners of their sub-routes', () => {
            const nav = renderAt('/admin/support')

            expect(nav.isActive('/admin/support')).toBe(true)
            expect(nav.isActive('/admin')).toBe(false)
        })

        test('does not match a path that only shares a string prefix', () => {
            expect(renderAt('/musical').isActive('/music')).toBe(false)
        })
    })

    describe('canViewModule', () => {
        test('allows everything when no guild is selected', () => {
            expect(renderAt('/').canViewModule('moderation', 'manage')).toBe(
                true,
            )
        })

        test('allows everything when the guild has no effective access map', () => {
            useGuildStore.setState({ selectedGuild: { id: 'g1' } as never })

            expect(renderAt('/').canViewModule('moderation')).toBe(true)
        })

        test('uses the guild access map and distinguishes view from manage', () => {
            useGuildStore.setState({
                selectedGuild: {
                    id: 'g1',
                    effectiveAccess: access({ moderation: 'view' }),
                } as never,
            })
            const nav = renderAt('/')

            expect(nav.canViewModule('moderation')).toBe(true)
            expect(nav.canViewModule('moderation', 'manage')).toBe(false)
            expect(nav.canViewModule('music')).toBe(false)
        })

        test('prefers memberContext access over the guild access map', () => {
            useGuildStore.setState({
                selectedGuild: {
                    id: 'g1',
                    effectiveAccess: access({ music: 'manage' }),
                } as never,
                memberContext: {
                    effectiveAccess: access({ music: 'none' }),
                } as never,
            })

            expect(renderAt('/').canViewModule('music')).toBe(false)
        })
    })
})
