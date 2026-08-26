import { describe, expect, it } from '@jest/globals'
import {
    SUPPORTED_BOT_LANGUAGES,
    DEFAULT_BOT_LANGUAGE,
    isBotLanguage,
    coerceBotLanguage,
} from './language'

describe('bot language constants', () => {
    it('matches the frontend tag format', () => {
        // The frontend uses `pt-BR`. A bare `pt` here would mismatch the first
        // time the two are compared.
        expect(SUPPORTED_BOT_LANGUAGES).toContain('pt-BR')
        expect(SUPPORTED_BOT_LANGUAGES).not.toContain('pt')
    })

    it('defaults to English', () => {
        expect(DEFAULT_BOT_LANGUAGE).toBe('en')
        expect(SUPPORTED_BOT_LANGUAGES).toContain(DEFAULT_BOT_LANGUAGE)
    })

    describe('isBotLanguage', () => {
        it.each(SUPPORTED_BOT_LANGUAGES)('accepts %s', (lang) => {
            expect(isBotLanguage(lang)).toBe(true)
        })

        it.each([['pt'], ['es-ES'], ['fr'], [''], ['EN']])(
            'rejects %s as an exact tag',
            (value) => {
                expect(isBotLanguage(value)).toBe(false)
            },
        )

        it.each([[null], [undefined], [42], [{}], [[]]])(
            'rejects non-string %s',
            (value) => {
                expect(isBotLanguage(value)).toBe(false)
            },
        )
    })

    describe('coerceBotLanguage', () => {
        it.each([
            ['pt-BR', 'pt-BR'],
            ['pt', 'pt-BR'],
            ['pt-PT', 'pt-BR'],
            ['es', 'es'],
            ['es-ES', 'es'],
            ['es-419', 'es'],
            ['en', 'en'],
            ['en-GB', 'en'],
            ['en-US', 'en'],
        ])('maps Discord locale %s to %s', (input, expected) => {
            expect(coerceBotLanguage(input)).toBe(expected)
        })

        it('is case-insensitive, since stored rows are not normalised', () => {
            expect(coerceBotLanguage('PT-br')).toBe('pt-BR')
            expect(coerceBotLanguage('ES')).toBe('es')
        })

        it('tolerates surrounding whitespace', () => {
            expect(coerceBotLanguage('  pt-BR  ')).toBe('pt-BR')
        })

        it.each([['fr'], ['de-DE'], ['zh-CN'], [''], ['   '], ['garbage']])(
            'falls back to en for unsupported %s',
            (value) => {
                expect(coerceBotLanguage(value)).toBe('en')
            },
        )

        it.each([[null], [undefined], [42], [{}], [[]]])(
            'falls back to en for non-string %s rather than throwing',
            (value) => {
                // A corrupt GuildSettings.language row must never break a reply.
                expect(() => coerceBotLanguage(value)).not.toThrow()
                expect(coerceBotLanguage(value)).toBe('en')
            },
        )
    })
})

describe('coerceBotLanguage subtag boundary', () => {
    it('keeps regional variants mapping to their language', () => {
        expect(coerceBotLanguage('pt-PT')).toBe('pt-BR')
        expect(coerceBotLanguage('es-419')).toBe('es')
        expect(coerceBotLanguage('en-GB')).toBe('en')
    })

    it('does not treat a corrupt value as a language just because it starts with one', () => {
        // A settings row written before the column was validated can hold
        // anything; a bare prefix match would let these override the Guild's
        // Discord locale.
        expect(coerceBotLanguage('entirely-broken')).toBe('en')
        expect(coerceBotLanguage('espanol')).toBe('en')
        expect(coerceBotLanguage('portuguese')).toBe('en')
        expect(coerceBotLanguage('ptbr')).toBe('en')
    })
})
