import { describe, expect, it } from '@jest/globals'
import type { TFunction } from 'i18next'
import type { RecapPayload } from '@lucky/shared/services'
import { buildRecapEmbed } from './recapEmbed'

// Echoes the key and its options so assertions see exactly what was asked for.
const t = ((key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction

const recap: RecapPayload = {
    schemaVersion: 1,
    guildId: 'g-1',
    from: '2026-10-04T18:00:00.000Z',
    to: '2026-10-11T18:00:00.000Z',
    plays: 20,
    skips: 3,
    autoplayPlays: 13,
    listenedSeconds: 3 * 3600 + 25 * 60,
    topTracks: [{ title: 'Song *A*', author: 'Artist A', plays: 4 }],
    topArtists: [{ name: 'Artist A', plays: 6 }],
}

describe('buildRecapEmbed (#2678)', () => {
    it('shows plays, time, autoplay share and the top lists', () => {
        const json = buildRecapEmbed(recap, t).toJSON()
        const field = (key: string) =>
            json.fields?.find((f) => f.name === key)?.value

        expect(json.description).toBe(
            'music.recap.period {"from":"2026-10-04","to":"2026-10-11"}',
        )
        expect(field('music.recap.playsName')).toBe(
            'music.recap.playsValue {"plays":20,"skips":3}',
        )
        expect(field('music.recap.listenedName')).toBe('3h 25m')
        expect(field('music.recap.autoplayName')).toBe(
            'music.recap.autoplayValue {"percent":65}',
        )
        expect(field('music.recap.topTracksName')).toBe(
            '**1.** Song \\*A\\* (Artist A) · ×4',
        )
        expect(field('music.recap.topArtistsName')).toBe('**1.** Artist A · ×6')
        expect(json.footer?.text).toBe('Lucky')
    })

    it('never names who played and omits empty top lists', () => {
        const json = buildRecapEmbed(
            { ...recap, topTracks: [], topArtists: [] },
            t,
        ).toJSON()

        expect(json.fields?.map((f) => f.name)).toEqual([
            'music.recap.playsName',
            'music.recap.listenedName',
            'music.recap.autoplayName',
        ])
        expect(JSON.stringify(json)).not.toContain('playedBy')
    })

    it('keeps long titles inside the field limit', () => {
        const long = 'x'.repeat(500)
        const json = buildRecapEmbed(
            {
                ...recap,
                topTracks: Array.from({ length: 5 }, () => ({
                    title: long,
                    author: long,
                    plays: 1,
                })),
            },
            t,
        ).toJSON()
        const value =
            json.fields?.find((f) => f.name === 'music.recap.topTracksName')
                ?.value ?? ''

        expect(value.length).toBeLessThanOrEqual(1024)
        expect(value).toContain('…')
    })
})
