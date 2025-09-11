import type { ChatInputCommandInteraction, GuildMember } from "discord.js"
import type { GuildQueue } from "discord-player"
import { errorEmbed } from "../general/embeds"
import { interactionReply } from "../general/interactionReply"
import { handleError, createUserErrorMessage } from "../error/errorHandler"

export async function requireGuild(
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!interaction.guildId) {
        const error = handleError(
            new Error("Command can only be used in a guild/server"),
            "guild validation",
            {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
                channelId: interaction.channelId,
            },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed("Error", createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireVoiceChannel(
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    const member = interaction.member as GuildMember
    if (!member?.voice?.channel) {
        const error = handleError(
            new Error("User must be in a voice channel"),
            "voice channel validation",
            {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
                channelId: interaction.channelId,
            },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed("Error", createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireQueue(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!queue) {
        const error = handleError(
            new Error("No music queue found"),
            "queue validation",
            {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
                channelId: interaction.channelId,
            },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed("Error", createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireCurrentTrack(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!queue?.currentTrack) {
        const error = handleError(
            new Error("No track is currently playing"),
            "current track validation",
            {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
                channelId: interaction.channelId,
            },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed("Error", createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireIsPlaying(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!queue?.isPlaying()) {
        const error = handleError(
            new Error("No music is currently playing"),
            "is playing validation",
            {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
                channelId: interaction.channelId,
            },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed("Error", createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireInteractionOptions(
    interaction: ChatInputCommandInteraction,
    options: string[],
) {
    if (!options.includes(interaction.options.getSubcommand())) {
        const error = handleError(
            new Error("Invalid interaction option"),
            "interaction options validation",
            {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
                channelId: interaction.channelId,
                details: {
                    providedOption: interaction.options.getSubcommand(),
                    validOptions: options,
                },
            },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed("Error", createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}
