import crypto from 'node:crypto'
import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { errorEmbed, successEmbed } from '../../../utils/general/embeds'
import { isLastFmConfigured } from '../../../lastfm'
import { lastFmLinkService } from '@lukbot/shared/services'

function encodeState(discordId: string, secret: string): string {
  const payload = Buffer.from(discordId, 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(discordId, 'utf8').digest('hex')
  return `${payload}.${sig}`
}

function getConnectUrl(discordId: string): string | null {
  const base = (process.env.WEBAPP_REDIRECT_URI ?? '').replace(/\/api\/auth\/callback\/?$/, '')
  if (!base) return null
  const secret = process.env.LASTFM_LINK_SECRET ?? process.env.WEBAPP_SESSION_SECRET
  if (!secret) return null
  const state = encodeState(discordId, secret)
  return `${base}/api/lastfm/connect?state=${encodeURIComponent(state)}`
}

export default new Command({
  data: new SlashCommandBuilder()
    .setName('lastfm')
    .setDescription('Connect your Last.fm account to scrobble tracks you request')
    .addSubcommand((sub) =>
      sub.setName('link').setDescription('Get a link to connect your Last.fm account'),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Check if your Last.fm account is linked'),
    ),
  category: 'general',
  execute: async ({ interaction }) => {
    const subcommand = interaction.options.getSubcommand()
    const discordId = interaction.user.id

    if (!isLastFmConfigured()) {
      await interactionReply({
        interaction,
        content: {
          embeds: [
            errorEmbed(
              'Last.fm not configured',
              'The bot does not have Last.fm API keys set. Ask the server owner to configure LASTFM_API_KEY and LASTFM_API_SECRET.',
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
              errorEmbed(
                'Cannot generate link',
                'WEBAPP_REDIRECT_URI (or LASTFM_LINK_SECRET / WEBAPP_SESSION_SECRET) is not set. Ask the server owner to configure the web app.',
              ),
            ],
            ephemeral: true,
          },
        })
        return
      }
      await interactionReply({
        interaction,
        content: {
          embeds: [
            successEmbed(
              'Connect your Last.fm account',
              `Click the link below to authorize LukBot with your Last.fm account. After you connect, tracks you request will be scrobbled to your profile.\n\n**[Click here to connect](${url})**\n\nThis link is valid for a short time and is only for you. Do not share it.`,
            ),
          ],
          ephemeral: true,
        },
      })
      return
    }

    if (subcommand === 'status') {
      const link = await lastFmLinkService.getByDiscordId(discordId)
      if (link) {
        await interactionReply({
          interaction,
          content: {
            embeds: [
              successEmbed(
                'Last.fm linked',
                link.lastFmUsername
                  ? `Your account **${link.lastFmUsername}** is connected. Tracks you request will be scrobbled.`
                  : 'Your Last.fm account is connected. Tracks you request will be scrobbled.',
            ),
            ],
            ephemeral: true,
          },
        })
      } else {
        await interactionReply({
          interaction,
          content: {
            embeds: [
              errorEmbed(
                'Not linked',
                'Your Last.fm account is not linked. Use `/lastfm link` to get a connection link.',
              ),
            ],
            ephemeral: true,
          },
        })
      }
    }
  },
})
