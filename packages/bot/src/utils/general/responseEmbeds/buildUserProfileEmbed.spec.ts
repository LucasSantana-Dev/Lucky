import { describe, it, expect } from '@jest/globals'
import { buildUserProfileEmbed } from './buildUserProfileEmbed'

const fakeUser = {
    username: 'TestUser',
    tag: 'TestUser#1234',
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/test.png',
}

describe('buildUserProfileEmbed', () => {
    it('creates a profile embed with username and avatar', () => {
        const embed = buildUserProfileEmbed(fakeUser)
        const data = embed.data

        expect(data.author?.name).toBe('TestUser#1234')
        expect(data.thumbnail?.url).toContain('avatars')
    })

    it('includes level when provided in stats', () => {
        const embed = buildUserProfileEmbed(fakeUser, { level: 42 })
        const levelField = embed.data.fields?.find((f) => f.name === 'Level')
        expect(levelField?.value).toBe('42')
    })

    it('includes rank when provided in stats', () => {
        const embed = buildUserProfileEmbed(fakeUser, { rank: 5 })
        const rankField = embed.data.fields?.find((f) => f.name === 'Rank')
        expect(rankField?.value).toBe('#5')
    })

    it('includes XP progress bar when xp and xpForNextLevel provided', () => {
        const embed = buildUserProfileEmbed(fakeUser, {
            xp: 50,
            xpForNextLevel: 100,
        })
        const progressField = embed.data.fields?.find(
            (f) => f.name === 'XP Progress',
        )
        expect(progressField?.value).toContain('50 / 100')
        expect(progressField?.value).toContain('█')
    })

    it('includes total XP when xp provided without xpForNextLevel', () => {
        const embed = buildUserProfileEmbed(fakeUser, { xp: 500 })
        const xpField = embed.data.fields?.find((f) => f.name === 'Total XP')
        expect(xpField?.value).toBe('500')
    })

    it('renders full progress with all stats', () => {
        const embed = buildUserProfileEmbed(fakeUser, {
            level: 25,
            rank: 3,
            xp: 750,
            xpForNextLevel: 1000,
        })
        const data = embed.data
        const fields = data.fields ?? []

        expect(fields.find((f) => f.name === 'Level')?.value).toBe('25')
        expect(fields.find((f) => f.name === 'Rank')?.value).toBe('#3')
        expect(fields.find((f) => f.name === 'XP Progress')).toBeDefined()
    })

    it('shows "No stats available" when no stats provided', () => {
        const embed = buildUserProfileEmbed(fakeUser)
        expect(embed.data.description).toBe('No stats available.')
    })

    it('shows "No stats available" when empty stats object provided', () => {
        const embed = buildUserProfileEmbed(fakeUser, {})
        expect(embed.data.description).toBe('No stats available.')
    })

    it('handles rank of 0 correctly', () => {
        const embed = buildUserProfileEmbed(fakeUser, { rank: 0 })
        const rankField = embed.data.fields?.find((f) => f.name === 'Rank')
        expect(rankField?.value).toBe('#0')
    })

    it('uses username as fallback when tag is not provided', () => {
        const userWithoutTag = {
            username: 'JustUsername',
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/test.png',
        }
        const embed = buildUserProfileEmbed(userWithoutTag, { level: 1 })
        expect(embed.data.author?.name).toBe('JustUsername')
    })

    it('includes timestamp in embed', () => {
        const embed = buildUserProfileEmbed(fakeUser, { level: 1 })
        expect(embed.data.timestamp).toBeDefined()
    })
})
