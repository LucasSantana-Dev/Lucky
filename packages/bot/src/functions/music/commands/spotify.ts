import crypto from 'node:crypto'
import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createErrorEmbed } from '../../../utils/general/embeds'
import { buildPlatformAttribEmbed } from '../../../utils/general/responseEmbeds'
import { isSpotifyConfigured } from '../../../spotify'
import { spotifyLinkService } from '@lucky/shared/services'

function encodeState(discordId: string, secret: string): string {
    const payload = Buffer.from(discordId, 'utf8').toString('base64url')
    const sig = crypto
        .createHmac('sha256', secret)
        .update(discordId, 'utf8')
        .digest('hex')
    return `${payload}.${sig}`
}

function getAbsoluteOrigin(rawUrl?: string): string | null {
    const value = rawUrl?.trim()
    if (!value) return null
    try {
        const parsed = new URL(value)
        const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:'
        if (!isHttp) return null
        if (parsed.hostname.toLowerCase() === 'nexus.lucassantana.tech') return null
        return parsed.origin
    } catch {
        return null
    }
}

function getConnectUrl(discordId: string): string | null {
    const base =
        getAbsoluteOrigin(process.env.WEBAPP_BACKEND_URL) ||
        getAbsoluteOrigin(process.env.WEBAPP_REDIRECT_URI)
    if (!base) return null
    const secret =
        process.env.SPOTIFY_LINK_SECRET || process.env.WEBAPP_SESSION_SECRET
    if (!secret) return null
    const state = encodeState(discordId, secret)
    return `${base}/api/spotify/connect?state=${encodeURIComponent(state)}`
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('spotify')
        .setDescription(
            'Connect your Spotify account for personalized music recommendations',
        )
        .addSubcommand((sub) =>
            sub
                .setName('link')
                .setDescription('Get a link to connect your Spotify account'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('unlink')
                .setDescription('Disconnect your Spotify account'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('status')
                .setDescription('Check if your Spotify account is linked'),
        ),
    category: 'music',
    execute: async ({ interaction }) => {
        const subcommand = interaction.options.getSubcommand()
        const discordId = interaction.user.id

        if (!isSpotifyConfigured()) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Spotify not configured',
                            'The bot does not have Spotify API keys set. Ask the server owner to configure SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        if (subcommand === 'link') {
            const url = getConnectUrl(discordId)
            if (!url) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Cannot generate link',
                                'WEBAPP_BACKEND_URL (fallback: WEBAPP_REDIRECT_URI) or SPOTIFY_LINK_SECRET / WEBAPP_SESSION_SECRET is not set. Ask the server owner to configure the web app.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }
            const embed = buildPlatformAttribEmbed('spotify', {
                title: 'Connect your Spotify account',
                description: `Click the link below to authorize Lucky with your Spotify account. After you connect, Lucky can provide personalized music recommendations based on your library and listening history.\n\n**[Click here to connect](${url})**\n\nThis link is valid for a short time and is only for you. Do not share it.`,
            })
            await interactionReply({
                interaction,
                content: {
                    embeds: [embed],
                    ephemeral: true,
                },
            })
            return
        }

        if (subcommand === 'unlink') {
            const link = await spotifyLinkService.getByDiscordId(discordId)
            if (!link) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Not linked',
                                'Your Spotify account is not linked.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            const ok = await spotifyLinkService.unlink(discordId)
            if (!ok) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Error',
                                'Failed to disconnect your Spotify account. Try again later.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            const embed = buildPlatformAttribEmbed('spotify', {
                title: 'Disconnected',
                description: 'Your Spotify account has been disconnected.',
            })
            await interactionReply({
                interaction,
                content: {
                    embeds: [embed],
                    ephemeral: true,
                },
            })
            return
        }

        if (subcommand === 'status') {
            const link = await spotifyLinkService.getByDiscordId(discordId)
            if (link) {
                const description = link.spotifyUsername
                    ? `Your Spotify account **${link.spotifyUsername}** is connected. Lucky can access your library and listening history for personalized recommendations.`
                    : 'Your Spotify account is connected. Lucky can access your library and listening history for personalized recommendations.'
                const embed = buildPlatformAttribEmbed('spotify', {
                    title: 'Spotify linked',
                    description,
                })
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [embed],
                        ephemeral: true,
                    },
                })
            } else {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Not linked',
                                'Your Spotify account is not linked. Use `/spotify link` to get a connection link.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
            }
        }
    },
})
