import { describe, expect, it } from '@jest/globals'
import { translatorFor } from '../i18n/index'
import { buildOnboardingEmbed } from './onboardingEmbed'

describe('buildOnboardingEmbed', () => {
    it('renders the English onboarding embed', () => {
        const t = translatorFor('en')
        expect(buildOnboardingEmbed(t).toJSON()).toMatchSnapshot()
    })

    it('renders the pt-BR onboarding embed', () => {
        const t = translatorFor('pt-BR')
        expect(buildOnboardingEmbed(t).toJSON()).toMatchSnapshot()
    })

    it('embed description mentions /play and recap (en)', () => {
        const t = translatorFor('en')
        const embed = buildOnboardingEmbed(t).toJSON()
        expect(embed.description).toMatch(/\/play/)
        expect(embed.description).toMatch(/recap/)
    })

    it('embed description mentions /play and recap (pt-BR)', () => {
        const t = translatorFor('pt-BR')
        const embed = buildOnboardingEmbed(t).toJSON()
        expect(embed.description).toMatch(/\/play/)
        expect(embed.description).toMatch(/recap/)
    })

    it('embed description never contains invite or vote CTA (en)', () => {
        const t = translatorFor('en')
        const embed = buildOnboardingEmbed(t).toJSON()
        expect(embed.description.toLowerCase()).not.toMatch(/invite|vote/)
    })

    it('embed description never contains invite or vote CTA (pt-BR)', () => {
        const t = translatorFor('pt-BR')
        const embed = buildOnboardingEmbed(t).toJSON()
        expect(embed.description.toLowerCase()).not.toMatch(/invite|vote/)
    })
})
