import { describe, expect, it } from '@jest/globals'
import { translatorFor } from './index'

describe('translatorFor (spec D2: no global language state)', () => {
    it('translates into each supported language', () => {
        expect(translatorFor('en')('music.errors.notInVoice')).toBe(
            'Join a voice channel first.',
        )
        expect(translatorFor('pt-BR')('music.errors.notInVoice')).toBe(
            'Entre em um canal de voz primeiro.',
        )
        expect(translatorFor('es')('music.errors.notInVoice')).toBe(
            'Únete a un canal de voz primero.',
        )
    })

    it('keeps two bound translators independent', () => {
        // The race D2 bans: with changeLanguage() the second call would flip the
        // first translator's language too. Interleave them to make sure.
        const pt = translatorFor('pt-BR')
        const es = translatorFor('es')

        expect(pt('music.errors.nothingPlaying')).toBe(
            'Nada está tocando no momento.',
        )
        expect(es('music.errors.nothingPlaying')).toBe(
            'No se está reproduciendo nada ahora mismo.',
        )
        // pt must be unchanged after es was created and used.
        expect(pt('music.errors.nothingPlaying')).toBe(
            'Nada está tocando no momento.',
        )
    })

    it('survives being held across an await', async () => {
        const pt = translatorFor('pt-BR')
        await Promise.resolve()
        translatorFor('es')('music.errors.notInVoice')
        await Promise.resolve()
        expect(pt('music.errors.notInVoice')).toBe(
            'Entre em um canal de voz primeiro.',
        )
    })

    it('renders the English string when a key is missing from a catalogue', () => {
        // spec D6 / acceptance 7. Simulated by asking for a key that exists in
        // en only; fallbackLng must supply it rather than echoing the path.
        const out = translatorFor('es')('music.errors.notInGuild')
        expect(out).not.toContain('music.errors')
        expect(out.length).toBeGreaterThan(0)
    })

    it('interpolates without escaping, since Discord renders plain text', () => {
        // escapeValue:true would turn the apostrophe into &#39; in a reply.
        const out = translatorFor('en')('music.nowPlaying', {
            title: 'Song & Dance',
        })
        expect(out).toBe("Now playing Song & Dance, don't stop")
        expect(out).not.toContain('&amp;')
        expect(out).not.toContain('&#39;')
    })

    it('interpolates per language', () => {
        expect(translatorFor('pt-BR')('music.nowPlaying', { title: 'X' })).toBe(
            'Tocando agora X, não pare',
        )
    })
})
