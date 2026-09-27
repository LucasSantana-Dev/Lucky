import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    type ButtonInteraction,
    type GuildMember,
} from 'discord.js'
import { QueryType } from 'discord-player'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { infoLog, warnLog } from '@lucky/shared/utils'
import type { CustomClient } from '../types'
import {
    createErrorEmbed,
    createSuccessEmbed,
    createWarningEmbed,
} from '../utils/general/embeds'
import { interactionReply } from '../utils/general/interactionReply'
import { isUnknownInteractionError } from '../functions/music/commands/play/queryUtils'
import { TEXT_SEARCH_BLOCKED_EXTRACTORS } from '../functions/music/commands/play/handlers/resolveProvider'
import { runPostPlayBackgroundOps } from '../functions/music/commands/play/handlers/postPlayBackgroundOps'
import { resolveGuildQueue } from '../services/musicManagement/queueResolver'
import { translatorForInteraction } from '../i18n/translatorForInteraction'

/**
 * One-click music station on the join onboarding embed (#2473). Seeds
 * playback from SoundCloud — never YouTube — so it works with
 * HOSTED_YOUTUBE_ENABLED=false, then hands over to the existing autoplay
 * pipeline (setupTrackHandlers/replenishQueue), which is wired globally on
 * the player instance and needs nothing special triggered from here.
 *
 * See decisions/2026-09-27-music-first-positioning.md point 2/3.
 */

export const ONBOARDING_STATION_BUTTON_PREFIX = 'station_'

type StationGenre = {
    id: string
    query: string
    emoji: string
}

// SoundCloud search queries. Deliberately never routed through
// QueryType.YOUTUBE_SEARCH or AUTO — see onboardingStation.spec.ts.
const STATION_GENRES: readonly StationGenre[] = [
    { id: 'lofi', query: 'lofi hip hop beats to relax', emoji: '🎧' },
    { id: 'gaming', query: 'gaming music mix', emoji: '🎮' },
    { id: 'pop', query: 'pop hits mix', emoji: '🎤' },
    { id: 'brMix', query: 'as mais tocadas no brasil hits mix', emoji: '🇧🇷' },
]

type GuildLike = {
    id: string
    preferredLocale?: string | null
}

export async function createOnboardingStationRow(
    guild: GuildLike,
): Promise<ActionRowBuilder<ButtonBuilder>> {
    const t = await translatorForInteraction({ guildId: guild.id, guild })
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...STATION_GENRES.map((genre) =>
            new ButtonBuilder()
                .setCustomId(`${ONBOARDING_STATION_BUTTON_PREFIX}${genre.id}`)
                .setLabel(t(`music.station.genres.${genre.id}`))
                .setEmoji(genre.emoji)
                .setStyle(ButtonStyle.Secondary),
        ),
    )
}

function logStationClick(data: {
    guildId: string
    genre: string
    started: boolean
    reason: string
}): void {
    infoLog({
        message: 'Onboarding station clicked',
        data: { event: 'onboarding_station', ...data },
    })
}

export async function handleOnboardingStationButton(
    interaction: ButtonInteraction,
): Promise<void> {
    const guildId = interaction.guildId
    const genreId = interaction.customId.slice(
        ONBOARDING_STATION_BUTTON_PREFIX.length,
    )
    const genre = STATION_GENRES.find((candidate) => candidate.id === genreId)

    if (!guildId || !interaction.guild || !genre) {
        logStationClick({
            guildId: guildId ?? 'unknown',
            genre: genreId || 'unknown',
            started: false,
            reason: 'invalid_request',
        })
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed('Error', 'This button is not available.'),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const t = await translatorForInteraction(interaction)
    const member = interaction.member as GuildMember
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
        logStationClick({
            guildId,
            genre: genre.id,
            started: false,
            reason: 'not_in_voice',
        })
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createWarningEmbed(
                        t('music.station.notInVoiceTitle'),
                        t('music.station.notInVoiceDescription'),
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const me = interaction.guild.members.me
    const hasVoicePermissions = Boolean(
        me &&
        voiceChannel
            .permissionsFor(me)
            ?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]),
    )
    if (!hasVoicePermissions) {
        logStationClick({
            guildId,
            genre: genre.id,
            started: false,
            reason: 'missing_permissions',
        })
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createWarningEmbed(
                        t('music.station.missingPermissionsTitle'),
                        t('music.station.missingPermissionsDescription'),
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    try {
        await interaction.deferReply({ ephemeral: true })
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            logStationClick({
                guildId,
                genre: genre.id,
                started: false,
                reason: 'interaction_expired',
            })
            return
        }
        throw error
    }

    const client = interaction.client as CustomClient
    try {
        const hadQueueBeforePlay = Boolean(
            resolveGuildQueue(client, guildId).queue,
        )
        const result = await client.player.play(voiceChannel, genre.query, {
            searchEngine: QueryType.SOUNDCLOUD_SEARCH,
            blockExtractors: TEXT_SEARCH_BLOCKED_EXTRACTORS,
            requestedBy: interaction.user,
            nodeOptions: {
                metadata: {
                    channel: interaction.channel,
                    requestedBy: interaction.user,
                },
                connectionTimeout: ENVIRONMENT_CONFIG.PLAYER.CONNECTION_TIMEOUT,
                leaveOnEmpty: true,
                leaveOnEmptyCooldown: 30_000,
                leaveOnEnd: true,
                leaveOnEndCooldown: 300_000,
            },
        })

        // Without this, the seed track plays once and stops: trackEventHandlers
        // only replenishes the queue in QueueRepeatMode.AUTOPLAY, and a fresh
        // queue defaults to OFF. This is the same call /play makes for a
        // guild's first-ever queue (playHandler.ts) — it reads the guild's
        // stored preference (default: on) and flips repeatMode accordingly.
        const { queue } = resolveGuildQueue(client, guildId)
        void runPostPlayBackgroundOps({
            queue,
            guildId,
            track: result.track,
            hadQueueBeforePlay,
            isPlaylist: false,
        }).catch((backgroundOpsError: unknown) => {
            warnLog({
                message: 'Onboarding station post-play background ops failed',
                error: backgroundOpsError,
                data: { guildId, genre: genre.id },
            })
        })

        logStationClick({
            guildId,
            genre: genre.id,
            started: true,
            reason: 'ok',
        })
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createSuccessEmbed(
                        t('music.station.startedTitle'),
                        t('music.station.startedDescription', {
                            genre: t(`music.station.genres.${genre.id}`),
                        }),
                    ),
                ],
                ephemeral: true,
            },
        })
    } catch (error) {
        warnLog({
            message: 'Onboarding station failed to start playback',
            error,
            data: { guildId, genre: genre.id },
        })
        logStationClick({
            guildId,
            genre: genre.id,
            started: false,
            reason: 'playback_error',
        })
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        t('music.station.failedTitle'),
                        t('music.station.failedDescription'),
                    ),
                ],
                ephemeral: true,
            },
        })
    }
}
