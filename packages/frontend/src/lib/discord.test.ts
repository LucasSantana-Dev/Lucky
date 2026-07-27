import { describe, expect, test } from 'vitest'
import { BOT_INVITE_PERMISSIONS, getBotInviteUrl } from './discord'

describe('getBotInviteUrl', () => {
    // Regression guard for #1888. The landing page and the docs page each built
    // their own invite URL, drifted, and the docs copy shipped `permissions=8`
    // (Administrator) while the landing page and every public listing promised
    // the minimal set. Top.gg's listing copy states "No admin permission", so
    // this is a claim we make publicly, not just a preference.
    test('never requests Administrator', () => {
        const url = getBotInviteUrl()

        expect(url).toContain(`permissions=${BOT_INVITE_PERMISSIONS}`)
        expect(url).not.toContain('permissions=8&')
        expect(url).not.toMatch(/permissions=8$/)
    })

    test('requests the minimal permission set', () => {
        // View Channels, Send Messages, Embed Links, Connect, Speak.
        expect(BOT_INVITE_PERMISSIONS).toBe('3165184')
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
