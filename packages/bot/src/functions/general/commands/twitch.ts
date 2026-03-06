import { SlashCommandBuilder } from '@discordjs/builders'
import { PermissionFlagsBits } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { errorEmbed } from '../../../utils/general/embeds'
import { errorLog } from '@lukbot/shared/utils'
import { handleTwitchAdd, handleTwitchRemove, handleTwitchList } from './twitchHandlers'

export default new Command({
  data: new SlashCommandBuilder()
    .setName('twitch')
    .setDescription('Manage Twitch stream-online notifications')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Notify this channel when a Twitch streamer goes live')
        .addStringOption((opt) =>
          opt.setName('username').setDescription('Twitch username (login)').setRequired(true),
        )
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Discord channel to notify (default: this channel)'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Stop notifying when a streamer goes live')
        .addStringOption((opt) =>
          opt.setName('username').setDescription('Twitch username to remove').setRequired(true),
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
      if (subcommand === 'add') return await handleTwitchAdd(interaction)
      if (subcommand === 'remove') return await handleTwitchRemove(interaction)
      if (subcommand === 'list') return await handleTwitchList(interaction)
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
