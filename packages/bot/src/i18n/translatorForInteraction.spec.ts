import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const getGuildSettings =
    jest.fn<(id: string) => Promise<{ language: string } | null>>()

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: { getGuildSettings },
}))

import { translatorForInteraction } from './translatorForInteraction'
import { clearGuildLanguageCache } from './resolveGuildLanguage'

beforeEach(() => {
    getGuildSettings.mockReset()
    clearGuildLanguageCache()
})

describe('translatorForInteraction', () => {
    it('translates using the Guild setting', async () => {
        getGuildSettings.mockResolvedValue({ language: 'pt-BR' })
        const t = await translatorForInteraction({
            guildId: 'g1',
            guild: { preferredLocale: 'en-US' },
        })
        expect(t('music.queue.noTracks')).toBe('Nenhuma faixa na fila')
    })

    it('falls back to the Discord locale when the Guild never chose', async () => {
        getGuildSettings.mockResolvedValue({ language: '' })
        const t = await translatorForInteraction({
            guildId: 'g2',
            guild: { preferredLocale: 'es-ES' },
        })
        expect(t('music.queue.noTracks')).toBe('No hay pistas en la cola')
    })

    it('returns English outside a Guild without touching the database', async () => {
        const t = await translatorForInteraction({ guildId: null })
        expect(t('music.queue.noTracks')).toBe('No tracks in queue')
        expect(getGuildSettings).not.toHaveBeenCalled()
    })

    it('survives a settings row that does not exist', async () => {
        getGuildSettings.mockResolvedValue(null)
        const t = await translatorForInteraction({
            guildId: 'g3',
            guild: { preferredLocale: null },
        })
        expect(t('music.queue.noTracks')).toBe('No tracks in queue')
    })

    it('falls back to English when the settings lookup throws', async () => {
        // A database blip must not break a music reply.
        getGuildSettings.mockRejectedValue(new Error('db down'))
        const t = await translatorForInteraction({
            guildId: 'g4',
            guild: { preferredLocale: 'pt-BR' },
        })
        expect(t('music.queue.noTracks')).toBe('No tracks in queue')
    })

    it('queries once per Guild, then serves from cache', async () => {
        getGuildSettings.mockResolvedValue({ language: 'es' })
        await translatorForInteraction({ guildId: 'g5' })
        await translatorForInteraction({ guildId: 'g5' })
        expect(getGuildSettings).toHaveBeenCalledTimes(1)
    })
})
