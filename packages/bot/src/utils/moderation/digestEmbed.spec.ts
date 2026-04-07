import { describe, expect, it } from '@jest/globals'
import {
    buildDigestEmbed,
    filterCasesSince,
    resolveDigestPeriodDays,
    type DigestCase,
} from './digestEmbed'

function caseDaysAgo(type: string, moderatorName: string, daysAgo: number): DigestCase {
    return {
        type,
        moderatorName,
        createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    }
}

describe('resolveDigestPeriodDays', () => {
    it('defaults to 7 when no period is supplied', () => {
        expect(resolveDigestPeriodDays(null)).toBe(7)
        expect(resolveDigestPeriodDays(undefined)).toBe(7)
    })

    it('maps known period strings to days', () => {
        expect(resolveDigestPeriodDays('7d')).toBe(7)
        expect(resolveDigestPeriodDays('30d')).toBe(30)
        expect(resolveDigestPeriodDays('90d')).toBe(90)
    })

    it('falls back to 7 for unknown periods', () => {
        expect(resolveDigestPeriodDays('xx')).toBe(7)
    })
})

describe('filterCasesSince', () => {
    it('keeps only cases within the window', () => {
        const cases = [
            caseDaysAgo('warn', 'A', 1),
            caseDaysAgo('ban', 'B', 8),
            caseDaysAgo('kick', 'A', 6),
        ]
        const filtered = filterCasesSince(cases, 7)
        expect(filtered).toHaveLength(2)
        expect(filtered.map((c) => c.type)).toEqual(['warn', 'kick'])
    })

    it('returns an empty array when nothing is in window', () => {
        expect(filterCasesSince([caseDaysAgo('ban', 'A', 30)], 7)).toEqual([])
    })
})

describe('buildDigestEmbed', () => {
    it('renders totals, period actions, and top moderators', () => {
        const embed = buildDigestEmbed({
            stats: { totalCases: 12, activeCases: 4 },
            cases: [
                caseDaysAgo('warn', 'Alice', 1),
                caseDaysAgo('warn', 'Alice', 2),
                caseDaysAgo('ban', 'Bob', 3),
            ],
            days: 7,
        })
        const data = embed.toJSON()
        expect(data.title).toContain('7 days')

        const fields = data.fields ?? []
        const totalsField = fields.find((f) => f.name.includes('totals'))
        expect(totalsField?.value).toContain('12')
        expect(totalsField?.value).toContain('4')

        const actionsField = fields.find((f) => f.name.includes('Actions'))
        expect(actionsField?.value).toContain('3')
        expect(actionsField?.value).toContain('WARN')

        const topField = fields.find((f) => f.name.includes('moderator'))
        expect(topField?.value).toContain('Alice')
        expect(topField?.value).toContain('Bob')
    })

    it('shows the empty actions message when nothing is in window', () => {
        const embed = buildDigestEmbed({
            stats: { totalCases: 5, activeCases: 0 },
            cases: [caseDaysAgo('ban', 'A', 30)],
            days: 7,
        })
        const fields = embed.toJSON().fields ?? []
        const actionsField = fields.find((f) => f.name.includes('Actions'))
        expect(actionsField?.value).toContain('No actions recorded')
    })

    it('omits the moderators field when no period cases exist', () => {
        const embed = buildDigestEmbed({
            stats: { totalCases: 5, activeCases: 0 },
            cases: [],
            days: 7,
        })
        const fields = embed.toJSON().fields ?? []
        const topField = fields.find((f) => f.name.includes('moderator'))
        expect(topField).toBeUndefined()
    })

    it('uses singular "action" when a moderator only has one case', () => {
        const embed = buildDigestEmbed({
            stats: { totalCases: 1, activeCases: 0 },
            cases: [caseDaysAgo('warn', 'Solo', 1)],
            days: 7,
        })
        const fields = embed.toJSON().fields ?? []
        const topField = fields.find((f) => f.name.includes('moderator'))
        expect(topField?.value).toContain('1 action')
        expect(topField?.value).not.toContain('1 actions')
    })
})
