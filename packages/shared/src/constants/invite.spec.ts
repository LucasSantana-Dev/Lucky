import { describe, expect, it } from '@jest/globals'
import {
    BOT_CLIENT_ID,
    BOT_INVITE_PERMISSIONS,
    buildBotInviteUrl,
} from './invite'

// Discord permission bits, for readable assertions.
const ADMINISTRATOR = 1n << 3n
const MANAGE_MESSAGES = 1n << 13n
const VIEW_CHANNEL = 1n << 10n
const SEND_MESSAGES = 1n << 11n
const EMBED_LINKS = 1n << 14n
const CONNECT = 1n << 20n
const SPEAK = 1n << 21n

describe('bot invite permissions', () => {
    const bits = BigInt(BOT_INVITE_PERMISSIONS)

    // The public listings state Lucky asks for no admin permission. Three
    // copies of this value had already drifted: the docs page shipped
    // Administrator and the backend redirect shipped Manage Messages (#1888,
    // #1894), so this is a claim worth pinning rather than a style preference.
    it('never requests Administrator', () => {
        expect(bits & ADMINISTRATOR).toBe(0n)
    })

    it('never requests Manage Messages', () => {
        expect(bits & MANAGE_MESSAGES).toBe(0n)
    })

    it('requests exactly the permissions the bot needs to function', () => {
        const expected =
            VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | CONNECT | SPEAK
        expect(bits).toBe(expected)
    })
})

describe('buildBotInviteUrl', () => {
    it('targets the Discord OAuth endpoint with the shared permission set', () => {
        expect(buildBotInviteUrl()).toBe(
            `https://discord.com/oauth2/authorize?client_id=${BOT_CLIENT_ID}` +
                `&scope=bot%20applications.commands&permissions=${BOT_INVITE_PERMISSIONS}`,
        )
    })

    // Without applications.commands the bot joins but registers no slash
    // commands, which is the shape of the failure that got the Top.gg
    // verification rejected (#1885).
    it('requests the applications.commands scope', () => {
        expect(buildBotInviteUrl()).toContain(
            'scope=bot%20applications.commands',
        )
    })

    it('accepts a fork client id', () => {
        expect(buildBotInviteUrl('123')).toContain('client_id=123')
    })
})
