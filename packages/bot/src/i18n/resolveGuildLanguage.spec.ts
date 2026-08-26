import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import {
    pickLanguage,
    resolveGuildLanguage,
    invalidateGuildLanguage,
    clearGuildLanguageCache,
    __setClockForTests,
    __resetClockForTests,
} from './resolveGuildLanguage'

beforeEach(() => {
    clearGuildLanguageCache()
    __resetClockForTests()
})

afterEach(() => {
    __resetClockForTests()
})

describe('pickLanguage (spec D3 ordering)', () => {
    it('prefers an explicit Guild setting over the Discord locale', () => {
        expect(
            pickLanguage({ settingsLanguage: 'es', preferredLocale: 'pt-BR' }),
        ).toBe('es')
    })

    it('falls back to the Discord locale when the Guild never chose', () => {
        // The zero-config win: a Brazilian Guild gets Portuguese on install.
        expect(pickLanguage({ preferredLocale: 'pt-BR' })).toBe('pt-BR')
        expect(pickLanguage({ preferredLocale: 'es-ES' })).toBe('es')
        expect(pickLanguage({ preferredLocale: 'en-GB' })).toBe('en')
    })

    it('falls back to en when neither source says anything', () => {
        expect(pickLanguage({})).toBe('en')
        expect(
            pickLanguage({ settingsLanguage: '', preferredLocale: '' }),
        ).toBe('en')
    })

    it('coerces a legacy settings value rather than trusting it verbatim', () => {
        // Rows written before the column was validated can hold anything.
        expect(pickLanguage({ settingsLanguage: 'pt' })).toBe('pt-BR')
        expect(pickLanguage({ settingsLanguage: 'es-419' })).toBe('es')
    })

    it('falls back to en on a corrupt settings value without throwing', () => {
        expect(() => pickLanguage({ settingsLanguage: 42 })).not.toThrow()
        expect(pickLanguage({ settingsLanguage: 42 })).toBe('en')
        expect(pickLanguage({ settingsLanguage: 'klingon' })).toBe('en')
    })

    it('ignores an unusable Discord locale', () => {
        expect(pickLanguage({ preferredLocale: 'de-DE' })).toBe('en')
        expect(pickLanguage({ preferredLocale: null })).toBe('en')
    })
})

describe('resolveGuildLanguage', () => {
    it('returns the default without loading when there is no Guild', async () => {
        // The four non-Guild guards in the music commands hit this path.
        const load = jest.fn<() => Promise<never>>()
        await expect(resolveGuildLanguage(null, load)).resolves.toBe('en')
        await expect(resolveGuildLanguage(undefined, load)).resolves.toBe('en')
        expect(load).not.toHaveBeenCalled()
    })

    it('loads once, then serves from cache', async () => {
        const load = jest
            .fn<() => Promise<{ settingsLanguage: string }>>()
            .mockResolvedValue({ settingsLanguage: 'es' })

        await expect(resolveGuildLanguage('g1', load)).resolves.toBe('es')
        await expect(resolveGuildLanguage('g1', load)).resolves.toBe('es')
        expect(load).toHaveBeenCalledTimes(1)
    })

    it('keeps Guilds independent, which is the whole point', async () => {
        // Two Guilds on different languages in one process (acceptance 6).
        const g1 = jest
            .fn<() => Promise<{ settingsLanguage: string }>>()
            .mockResolvedValue({ settingsLanguage: 'pt-BR' })
        const g2 = jest
            .fn<() => Promise<{ settingsLanguage: string }>>()
            .mockResolvedValue({ settingsLanguage: 'es' })

        expect(await resolveGuildLanguage('g1', g1)).toBe('pt-BR')
        expect(await resolveGuildLanguage('g2', g2)).toBe('es')
        expect(await resolveGuildLanguage('g1', g1)).toBe('pt-BR')
    })

    it('reloads after invalidation, so an admin change takes effect at once', async () => {
        let stored = 'en'
        const load = jest
            .fn<() => Promise<{ settingsLanguage: string }>>()
            .mockImplementation(() =>
                Promise.resolve({ settingsLanguage: stored }),
            )

        expect(await resolveGuildLanguage('g1', load)).toBe('en')
        stored = 'pt-BR'
        expect(await resolveGuildLanguage('g1', load)).toBe('en') // still cached
        invalidateGuildLanguage('g1')
        expect(await resolveGuildLanguage('g1', load)).toBe('pt-BR')
    })

    it('reloads once the TTL expires', async () => {
        let clock = 1_000_000
        __setClockForTests(() => clock)
        const load = jest
            .fn<() => Promise<{ settingsLanguage: string }>>()
            .mockResolvedValue({ settingsLanguage: 'es' })

        await resolveGuildLanguage('g1', load)
        clock += 4 * 60 * 1000
        await resolveGuildLanguage('g1', load)
        expect(load).toHaveBeenCalledTimes(1)

        clock += 2 * 60 * 1000 // past the 5 minute TTL
        await resolveGuildLanguage('g1', load)
        expect(load).toHaveBeenCalledTimes(2)
    })

    it('falls back without caching when the load throws', async () => {
        // A failed settings lookup must not pin English for the whole TTL.
        const load = jest
            .fn<() => Promise<{ settingsLanguage: string }>>()
            .mockRejectedValueOnce(new Error('db down'))
            .mockResolvedValue({ settingsLanguage: 'pt-BR' })

        expect(await resolveGuildLanguage('g1', load)).toBe('en')
        expect(await resolveGuildLanguage('g1', load)).toBe('pt-BR')
        expect(load).toHaveBeenCalledTimes(2)
    })
})
