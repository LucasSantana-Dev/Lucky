import { afterEach, describe, expect, test } from 'vitest'
import i18n from '@/lib/i18n'

describe('i18n language resolution', () => {
    const initial = i18n.language

    afterEach(async () => {
        await i18n.changeLanguage(initial)
    })

    test('pt-BR stays in the hierarchy and resolves Portuguese strings', async () => {
        await i18n.changeLanguage('pt-BR')

        expect(i18n.languages).toContain('pt-BR')
        expect(i18n.t('config.back')).toBe('Voltar')
    })

    test('en-US still resolves the English strings', async () => {
        await i18n.changeLanguage('en-US')

        expect(i18n.t('config.back')).toBe('Back')
    })
})
