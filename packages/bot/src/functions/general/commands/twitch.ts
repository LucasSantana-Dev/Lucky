import { SlashCommandBuilder } from '@discordjs/builders'
import { PermissionFlagsBits } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { twitchNotificationService } from '@lukbot/shared/services'
import { getPrismaClient } from '@lukbot/shared/utils'
import { errorEmbed, successEmbed } from '../../../utils/general/embeds'
import { errorLog } from '@lukbot/shared/utils'
import { getTwitchUserByLogin } from '../../../twitch/twitchApi'
import { refreshTwitchSubscriptions } from '../../../twitch'

export default new Command({
  data: new SlashCommandBuilder()
    .setName('twitch')
    .setDescription('Manage Twitch stream-online notifications')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Notify this channel when a Twitch streamer goes live')
        .addStringOption((opt) =>
          opt
            .setName('username')
            .setDescription('Twitch username (login)')
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Discord channel to notify (default: this channel)'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Stop notifying when a streamer goes live')
        .addStringOption((opt) =>
          opt
            .setName('username')
            .setDescription('Twitch username to remove')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List Twitch streamers you get notified for'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  category: 'general',
  execute: async ({ interaction }) => {
    if (!(await requireGuild(interaction))) return
    if (!interaction.guild) return

    const subcommand = interaction.options.getSubcommand()

    try {
      if (subcommand === 'add') {
        const username = interaction.options.getString('username', true).trim().toLowerCase()
        const channelOption = interaction.options.getChannel('channel')
        const channel =
          (channelOption && 'id' in channelOption ? channelOption : null) ??
          interaction.channel
        if (!channel || !('id' in channel)) {
          await interactionReply({
            interaction,
            content: {
              embeds: [errorEmbed('Error', 'Please specify a text channel.')],
              ephemeral: true,
            },
          })
          return
        }

        const twitchUser = await getTwitchUserByLogin(username)
        if (!twitchUser) {
          await interactionReply({
            interaction,
            content: {
              embeds: [
                errorEmbed(
                  'Twitch user not found',
                  `No Twitch user found for "${username}". Check the username and that Twitch is configured (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_ACCESS_TOKEN).`,
                ),
              ],
              ephemeral: true,
            },
          })
          return
        }

        const prisma = getPrismaClient()
        let guild = await prisma.guild.findUnique({
          where: { discordId: interaction.guild.id },
        })
        if (!guild) {
          guild = await prisma.guild.create({
            data: {
              discordId: interaction.guild.id,
              name: interaction.guild.name,
              ownerId: interaction.guild.ownerId,
            },
          })
        }

        const success = await twitchNotificationService.add(
          guild.id,
          channel.id,
          twitchUser.id,
          twitchUser.login,
        )
        if (success) {
          await refreshTwitchSubscriptions()
          await interactionReply({
            interaction,
            content: {
              embeds: [
                successEmbed(
                  'Twitch notification added',
                  `This channel will be notified when **${twitchUser.display_name}** goes live on Twitch.`,
                ),
              ],
              ephemeral: true,
            },
          })
        } else {
          await interactionReply({
            interaction,
            content: {
              embeds: [errorEmbed('Error', 'Failed to add Twitch notification.')],
              ephemeral: true,
            },
          })
        }
        return
      }

      if (subcommand === 'remove') {
        const username = interaction.options.getString('username', true).trim().toLowerCase()
        const twitchUser = await getTwitchUserByLogin(username)
        if (!twitchUser) {
          await interactionReply({
            interaction,
            content: {
              embeds: [
                errorEmbed(
                  'Twitch user not found',
                  `No Twitch user found for "${username}".`,
                ),
              ],
              ephemeral: true,
            },
          })
          return
        }

        const prisma = getPrismaClient()
        const guild = await prisma.guild.findUnique({
          where: { discordId: interaction.guild.id },
        })
        if (!guild) {
          await interactionReply({
            interaction,
            content: {
              embeds: [errorEmbed('Not found', 'No Twitch notification for that user in this server.')],
              ephemeral: true,
            },
          })
          return
        }

        const success = await twitchNotificationService.remove(guild.id, twitchUser.id)
        if (success) {
          await refreshTwitchSubscriptions()
          await interactionReply({
            interaction,
            content: {
              embeds: [
                successEmbed(
                  'Twitch notification removed',
                  `Stopped notifying for **${twitchUser.display_name}**.`,
                ),
              ],
              ephemeral: true,
            },
          })
        } else {
          await interactionReply({
            interaction,
            content: {
              embeds: [errorEmbed('Error', 'Failed to remove Twitch notification.')],
              ephemeral: true,
            },
          })
        }
        return
      }

      if (subcommand === 'list') {
        const prisma = getPrismaClient()
        const guild = await prisma.guild.findUnique({
          where: { discordId: interaction.guild.id },
        })
        if (!guild) {
          await interactionReply({
            interaction,
            content: {
              embeds: [
                successEmbed('Twitch notifications', 'No Twitch streamers configured for this server.'),
              ],
              ephemeral: true,
            },
          })
          return
        }

        const list = await twitchNotificationService.listByGuild(guild.id)
        if (list.length === 0) {
          await interactionReply({
            interaction,
            content: {
              embeds: [
                successEmbed('Twitch notifications', 'No Twitch streamers configured for this server.'),
              ],
              ephemeral: true,
            },
          })
          return
        }

        const lines = list.map(
          (n) => `• **${n.twitchLogin}** → <#${n.discordChannelId}>`,
        )
        await interactionReply({
          interaction,
          content: {
            embeds: [
              successEmbed(
                'Twitch notifications',
                lines.join('\n'),
              ),
            ],
            ephemeral: true,
          },
        })
      }
    } catch (err) {
      errorLog({ message: 'Twitch command error', error: err })
      await interactionReply({
        interaction,
        content: {
          embeds: [errorEmbed('Error', 'Something went wrong. Try again later.')],
          ephemeral: true,
        },
      })
    }
  },
})
