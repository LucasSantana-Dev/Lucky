/**
 * Discord-specific template literal types
 * Using existing types from discord.js where possible
 */

export type {
    Snowflake,
    User,
    GuildMember,
    Guild,
    Channel,
    VoiceChannel,
    TextChannel,
    GuildChannel,
    Message,
    Role,
    Emoji,
    Sticker,
    Application,
    Webhook,
    Integration,
    StageInstance,
    ThreadChannel,
    VoiceRegion,
    Invite,
} from 'discord.js'

// Custom Discord-specific types that aren't available in the library
export type DiscordMention =
    | `<@${string}>`
    | `<@!${string}>`
    | `<@&${string}>`
    | `<#${string}>`

export type DiscordChannelMention = `<#${string}>`

export type DiscordUserMention = `<@${string}>` | `<@!${string}>`

export type DiscordRoleMention = `<@&${string}>`

export type DiscordTimestamp = `<t:${number}:${string}>`

export type DiscordSlashCommand = `/${string}`

export type DiscordContextMenuCommand = `${string}`

export type DiscordButtonId = `btn_${string}`

export type DiscordSelectMenuId = `select_${string}`

export type DiscordModalId = `modal_${string}`

export type DiscordInteractionId = `${string}`

export type DiscordInteractionToken = `${string}`

export type DiscordSessionId = `${string}`

export type DiscordSequence = `${number}`

export type DiscordShardId = `${number}`

export type DiscordClusterId = `${number}`

export type DiscordNodeId = `${string}`

export type DiscordWorkerId = `${number}`

export type DiscordProcessId = `${number}`

export type DiscordThreadId = `${string}`

export type DiscordParentId = `${string}`

export type DiscordRootId = `${string}`

export type DiscordMessageReferenceId = `${string}`

export type DiscordMessageReferenceChannelId = `${string}`

export type DiscordMessageReferenceGuildId = `${string}`

export type DiscordMessageReferenceUserId = `${string}`

export type DiscordMessageReferenceRoleId = `${string}`

export type DiscordMessageReferenceEmojiId = `${string}`

export type DiscordMessageReferenceStickerId = `${string}`

export type DiscordMessageReferenceApplicationId = `${string}`

export type DiscordMessageReferenceWebhookId = `${string}`

export type DiscordMessageReferenceIntegrationId = `${string}`

export type DiscordMessageReferenceScheduledEventId = `${string}`

export type DiscordMessageReferenceStageInstanceId = `${string}`

export type DiscordMessageReferenceThreadId = `${string}`

export type DiscordMessageReferenceVoiceRegionId = `${string}`

export type DiscordMessageReferenceTemplateId = `${string}`

export type DiscordMessageReferenceInviteCode = `${string}`

export type DiscordCustomEmoji = `<:${string}:${string}>`

export type DiscordAnimatedEmoji = `<a:${string}:${string}>`

export type DiscordStandardEmoji = `${string}`

export type DiscordEmoji =
    | DiscordCustomEmoji
    | DiscordAnimatedEmoji
    | DiscordStandardEmoji
