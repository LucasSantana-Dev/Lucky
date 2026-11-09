import { afterEach, describe, expect, test, vi } from 'vitest'
import {
    BOT_INVITE_PERMISSIONS,
    getBotInviteUrl,
    getLandingAddUrl,
} from './discord'

describe('getBotInviteUrl', () => {
    // Regression guard for #1888. The landing page and the docs page each built
    // their own invite URL, drifted, and the docs copy shipped `permissions=8`
    // (Administrator) while the landing page promised a different set.
    //
    // The permission VALUE is asserted once, in
    // packages/shared/src/constants/invite.spec.ts, against the ADR. Pinning
    // the literal here too would just be a second place to forget (#1923).
    // These tests cover what is frontend-specific: that the helper actually
    // uses the shared constant and builds a well-formed URL.
    test('never requests Administrator', () => {
        const url = getBotInviteUrl()

        expect(url).toContain(`permissions=${BOT_INVITE_PERMISSIONS}`)
        expect(url).not.toContain('permissions=8&')
        expect(url).not.toMatch(/permissions=8$/)
    })

    // Without applications.commands the bot joins but registers no slash
    // commands, which is the shape of the failure that got the Top.gg
    // verification rejected (#1885).
    test('requests the applications.commands scope', () => {
        expect(getBotInviteUrl()).toContain('scope=bot%20applications.commands')
    })

    test('points at the Discord OAuth authorize endpoint', () => {
        expect(getBotInviteUrl()).toMatch(
            /^https:\/\/discord\.com\/oauth2\/authorize\?client_id=\d+/,
        )
    })
})

describe('getLandingAddUrl (#2861)', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    test('uses the configured API base with source=landing', () => {
        vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api/')
        vi.stubEnv('VITE_DISCORD_CLIENT_ID', '')
        expect(getLandingAddUrl()).toBe(
            'https://api.example.test/api/add?source=landing',
        )
    })

    test('falls back to /api when no base is configured', () => {
        vi.stubEnv('VITE_API_BASE_URL', '')
        vi.stubEnv('VITE_DISCORD_CLIENT_ID', '')
        expect(getLandingAddUrl()).toBe('/api/add?source=landing')
    })

    test('keeps the direct invite URL for a fork client id', () => {
        vi.stubEnv('VITE_DISCORD_CLIENT_ID', '123456789')
        expect(getLandingAddUrl()).toContain('client_id=123456789')
    })
})
