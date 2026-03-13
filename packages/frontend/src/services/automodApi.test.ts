import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createAutoModApi, type AutoModApiClient } from './automodApi'

const apiClient: AutoModApiClient = {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
}

describe('createAutoModApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('maps settings and template endpoints', () => {
        const api = createAutoModApi(apiClient)

        api.getSettings('guild-1')
        api.updateSettings('guild-1', { spamEnabled: true })
        api.listTemplates('guild-1')
        api.applyTemplate('guild-1', 'strict')

        expect(apiClient.get).toHaveBeenNthCalledWith(
            1,
            '/guilds/guild-1/automod/settings',
        )
        expect(apiClient.patch).toHaveBeenCalledWith(
            '/guilds/guild-1/automod/settings',
            { spamEnabled: true },
        )
        expect(apiClient.get).toHaveBeenNthCalledWith(
            2,
            '/guilds/guild-1/automod/templates',
        )
        expect(apiClient.post).toHaveBeenCalledWith(
            '/guilds/guild-1/automod/templates/strict/apply',
        )
    })

    test('encodes guild and template path segments for template endpoints', () => {
        const api = createAutoModApi(apiClient)

        api.listTemplates('guild with spaces')
        api.applyTemplate('guild with spaces', 'strict/template')

        expect(apiClient.get).toHaveBeenCalledWith(
            '/guilds/guild%20with%20spaces/automod/templates',
        )
        expect(apiClient.post).toHaveBeenCalledWith(
            '/guilds/guild%20with%20spaces/automod/templates/strict%2Ftemplate/apply',
        )
    })

    test('maps exempt channels and roles endpoints', () => {
        const api = createAutoModApi(apiClient)

        api.addExemptChannel('guild-1', 'channel-1')
        api.removeExemptChannel('guild-1', 'channel-1')
        api.addExemptRole('guild-1', 'role-1')
        api.removeExemptRole('guild-1', 'role-1')

        expect(apiClient.post).toHaveBeenNthCalledWith(
            1,
            '/guilds/guild-1/automod/exempt/channels',
            { channelId: 'channel-1' },
        )
        expect(apiClient.delete).toHaveBeenNthCalledWith(
            1,
            '/guilds/guild-1/automod/exempt/channels/channel-1',
        )
        expect(apiClient.post).toHaveBeenNthCalledWith(
            2,
            '/guilds/guild-1/automod/exempt/roles',
            { roleId: 'role-1' },
        )
        expect(apiClient.delete).toHaveBeenNthCalledWith(
            2,
            '/guilds/guild-1/automod/exempt/roles/role-1',
        )
    })

    test('maps words and whitelist endpoints with URI encoding', () => {
        const api = createAutoModApi(apiClient)

        api.addWord('guild-1', 'bad word')
        api.removeWord('guild-1', 'bad word/1')
        api.addWhitelistedLink('guild-1', 'example.com')
        api.removeWhitelistedLink('guild-1', 'sub.domain/path')

        expect(apiClient.post).toHaveBeenNthCalledWith(
            1,
            '/guilds/guild-1/automod/words',
            { word: 'bad word' },
        )
        expect(apiClient.delete).toHaveBeenNthCalledWith(
            1,
            '/guilds/guild-1/automod/words/bad%20word%2F1',
        )
        expect(apiClient.post).toHaveBeenNthCalledWith(
            2,
            '/guilds/guild-1/automod/links/whitelist',
            { domain: 'example.com' },
        )
        expect(apiClient.delete).toHaveBeenNthCalledWith(
            2,
            '/guilds/guild-1/automod/links/whitelist/sub.domain%2Fpath',
        )
    })
})
