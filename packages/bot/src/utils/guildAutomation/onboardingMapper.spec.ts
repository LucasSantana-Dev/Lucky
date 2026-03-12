import { describe, it, expect } from '@jest/globals'
import { Collection } from 'discord.js'
import {
    manifestOnboardingToDiscordEdit,
    onboardingToManifest,
} from '@lucky/shared/services/guildAutomation/onboardingMapper'

describe('onboarding mapper', () => {
    it('maps manifest onboarding to discord edit payload', () => {
        const payload = manifestOnboardingToDiscordEdit({
            enabled: true,
            mode: 1,
            defaultChannelIds: ['123456789012345678'],
            prompts: [
                {
                    id: '223456789012345678',
                    title: 'Choose interests',
                    required: true,
                    options: [
                        {
                            title: 'Music',
                            channelIds: ['123456789012345678'],
                            roleIds: ['323456789012345678'],
                        },
                    ],
                },
            ],
        })

        expect(payload?.enabled).toBe(true)
        expect(payload?.defaultChannels).toEqual(['123456789012345678'])
        expect(payload?.prompts?.[0].title).toBe('Choose interests')
    })

    it('maps discord onboarding to manifest shape', () => {
        const onboarding = {
            enabled: true,
            mode: 1,
            defaultChannels: new Collection([
                [
                    '123456789012345678',
                    {
                        id: '123456789012345678',
                    },
                ],
            ]),
            prompts: new Collection([
                [
                    '223456789012345678',
                    {
                        id: '223456789012345678',
                        title: 'Choose',
                        singleSelect: false,
                        required: true,
                        inOnboarding: true,
                        type: 0,
                        options: new Collection(),
                    },
                ],
            ]),
        } as any

        const result = onboardingToManifest(
            '123456789012345678',
            onboarding,
        )

        expect(result?.enabled).toBe(true)
        expect(result?.defaultChannelIds).toEqual(['123456789012345678'])
        expect(result?.prompts[0]?.title).toBe('Choose')
    })
})
