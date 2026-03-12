import type {
    GuildOnboardingEditOptions,
    GuildOnboarding,
    GuildOnboardingPrompt,
    GuildOnboardingPromptOption,
} from 'discord.js'
import type {
    GuildAutomationManifestDocument,
    GuildAutomationOnboarding,
} from './types'

function mapPromptOption(option: GuildOnboardingPromptOption) {
    return {
        id: option.id,
        title: option.title,
        description: option.description,
        channelIds: [...option.channels.keys()],
        roleIds: [...option.roles.keys()],
        emoji: option.emoji?.id ?? option.emoji?.name ?? null,
    }
}

function mapPrompt(prompt: GuildOnboardingPrompt) {
    return {
        id: prompt.id,
        title: prompt.title,
        singleSelect: prompt.singleSelect,
        required: prompt.required,
        inOnboarding: prompt.inOnboarding,
        type: prompt.type,
        options: [...prompt.options.values()].map((option) =>
            mapPromptOption(option),
        ),
    }
}

export function onboardingToManifest(
    guildId: string,
    onboarding: GuildOnboarding | null,
): GuildAutomationManifestDocument['onboarding'] {
    if (!onboarding) {
        return undefined
    }

    return {
        enabled: onboarding.enabled,
        mode: onboarding.mode,
        defaultChannelIds: [...onboarding.defaultChannels.keys()],
        prompts: [...onboarding.prompts.values()].map((prompt) => mapPrompt(prompt)),
    }
}

export function manifestOnboardingToDiscordEdit(
    onboarding: GuildAutomationOnboarding | undefined,
): GuildOnboardingEditOptions | null {
    if (!onboarding) {
        return null
    }

    return {
        enabled: onboarding.enabled,
        mode: onboarding.mode,
        defaultChannels: onboarding.defaultChannelIds,
        prompts: onboarding.prompts.map((prompt) => ({
            id: prompt.id,
            title: prompt.title,
            singleSelect: prompt.singleSelect,
            required: prompt.required,
            inOnboarding: prompt.inOnboarding,
            type: prompt.type,
            options: prompt.options.map((option) => ({
                id: option.id ?? null,
                title: option.title,
                description: option.description ?? null,
                channels: option.channelIds,
                roles: option.roleIds,
                emoji: option.emoji ?? null,
            })),
        })),
    }
}
