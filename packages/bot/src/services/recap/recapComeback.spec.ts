import type { TFunction } from 'i18next'

jest.mock('@lucky/shared/constants', () => ({
    COLOR: { LUCKY_PURPLE: 0x8b5cf6 },
    TOP_GG_VOTE_URL: 'https://top.gg/vote',
}))
jest.mock('../../functions/music/recapMixButton', () => {
    const { ButtonBuilder, ButtonStyle } = jest.requireActual('discord.js')
    return {
        buildRecapMixButton: () =>
            new ButtonBuilder()
                .setCustomId('recap_mix')
                .setLabel('mix')
                .setStyle(ButtonStyle.Primary),
    }
})
jest.mock('../../functions/music/recapOffButton', () => ({
    RECAP_OFF_BUTTON_ID: 'recap_off',
}))

import { buildComebackEmbed, buildComebackRow } from './recapComeback'

const t = ((key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key) as unknown as TFunction

function month(artists: string[]) {
    return {
        schemaVersion: 1 as const,
        guildId: 'g-1',
        from: '2026-09-13T18:00:00.000Z',
        to: '2026-10-11T18:00:00.000Z',
        plays: 40,
        skips: 0,
        autoplayPlays: 0,
        listenedSeconds: 0,
        topTracks: [],
        topArtists: artists.map((name) => ({ name, plays: 3 })),
    }
}

describe('comeback card', () => {
    it('names up to three artists the guild played', () => {
        const embed = buildComebackEmbed(
            month(['A', 'B', 'C', 'D']),
            t,
        ).toJSON()

        expect(embed.title).toBe('music.recap.comebackTitle')
        expect(embed.description).toBe(
            'music.recap.comebackBody:{"artists":"**A**, **B**, **C**"}',
        )
    })

    it('neutralizes markdown and newlines in artist names', () => {
        const embed = buildComebackEmbed(
            month(['**bold**\n# heading']),
            t,
        ).toJSON()

        expect(embed.description).not.toContain('\\n# heading')
        expect(embed.description).toContain('\\\\*\\\\*bold')
    })

    it('uses the plain text when no artist is known', () => {
        expect(buildComebackEmbed(month([]), t).toJSON().description).toBe(
            'music.recap.comebackBodyNoArtists',
        )
    })

    it('offers the mix and the off button, nothing else', () => {
        const ids = buildComebackRow(t)
            .toJSON()
            .components.map((c) => (c as { custom_id: string }).custom_id)

        expect(ids).toEqual(['recap_mix', 'recap_off'])
    })
})
