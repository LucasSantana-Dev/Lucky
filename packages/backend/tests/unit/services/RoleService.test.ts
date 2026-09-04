import {
    describe,
    test,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'
import { roleService } from '../../../src/services/RoleService'
import { setClient } from '../../../src/utils/discordClientAccessor'

const originalFetch = global.fetch

describe('RoleService - guildId validation', () => {
    let originalDiscordToken: string | undefined

    beforeEach(() => {
        jest.clearAllMocks()
        setClient(null)
        originalDiscordToken = process.env.DISCORD_TOKEN
        process.env.DISCORD_TOKEN = 'test-bot-token'
        global.fetch = originalFetch
    })

    afterEach(() => {
        if (originalDiscordToken === undefined) {
            delete process.env.DISCORD_TOKEN
        } else {
            process.env.DISCORD_TOKEN = originalDiscordToken
        }
        global.fetch = originalFetch
    })

    test('getGuildRoleOptions rejects a non-snowflake guildId without calling fetch', async () => {
        const fetchSpy = jest.fn()
        global.fetch = fetchSpy as unknown as typeof fetch

        const roles = await roleService.getGuildRoleOptions(
            '123/../../users/@me',
        )

        expect(roles).toEqual([])
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    test('getFullGuildRoles rejects a non-snowflake guildId without calling fetch', async () => {
        const fetchSpy = jest.fn()
        global.fetch = fetchSpy as unknown as typeof fetch

        const roles = await roleService.getFullGuildRoles('not-a-snowflake')

        expect(roles).toEqual([])
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    test('createGuildRole rejects a non-snowflake guildId without calling fetch', async () => {
        const fetchSpy = jest.fn()
        global.fetch = fetchSpy as unknown as typeof fetch

        await expect(
            roleService.createGuildRole('123/../../users/@me', {
                name: 'test',
            }),
        ).rejects.toThrow('Invalid Discord guild id')
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})
