import { describe, expect, it } from '@jest/globals'
import {
    BOT_CLIENT_ID,
    BOT_INVITE_PERMISSIONS,
    buildBotInviteUrl,
} from './invite'

// Discord permission bits, for readable assertions.
const ADMINISTRATOR = 1n << 3n
const VIEW_AUDIT_LOG = 1n << 7n
const VIEW_CHANNEL = 1n << 10n
const SEND_MESSAGES = 1n << 11n
const MANAGE_MESSAGES = 1n << 13n
const EMBED_LINKS = 1n << 14n
const CONNECT = 1n << 20n
const SPEAK = 1n << 21n

// High-alarm permissions the ADR deliberately escalates on demand rather than
// requesting up front.
const KICK_MEMBERS = 1n << 1n
const BAN_MEMBERS = 1n << 2n
const MANAGE_CHANNELS = 1n << 4n
const MANAGE_GUILD = 1n << 5n
const MANAGE_ROLES = 1n << 28n
const MODERATE_MEMBERS = 1n << 40n

describe('bot invite permissions', () => {
    const bits = BigInt(BOT_INVITE_PERMISSIONS)

    // This value is the curated default decided in
    // decisions/2026-06-18-invite-permission-scope.md. Four copies had already
    // drifted apart (#1888, #1894, #1923) — the docs page shipped
    // Administrator, the backend redirect shipped a set missing View Channels
    // entirely — so it is worth pinning to the decision rather than to taste.
    it('never requests Administrator', () => {
        expect(bits & ADMINISTRATOR).toBe(0n)
    })

    it('requests exactly the ADR curated set', () => {
        const expected =
            VIEW_AUDIT_LOG |
            VIEW_CHANNEL |
            SEND_MESSAGES |
            MANAGE_MESSAGES |
            EMBED_LINKS |
            CONNECT |
            SPEAK
        expect(bits).toBe(expected)
    })

    // The ADR escalates these on demand: commands needing them check
    // interaction.appPermissions and prompt, rather than the invite asking a
    // server owner to hand them over up front (#1498).
    it.each([
        ['Kick Members', KICK_MEMBERS],
        ['Ban Members', BAN_MEMBERS],
        ['Manage Channels', MANAGE_CHANNELS],
        ['Manage Guild', MANAGE_GUILD],
        ['Manage Roles', MANAGE_ROLES],
        ['Moderate Members', MODERATE_MEMBERS],
    ])('never requests %s up front', (_label, bit) => {
        expect(bits & bit).toBe(0n)
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
