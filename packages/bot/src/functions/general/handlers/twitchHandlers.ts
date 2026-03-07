import type { ChatInputCommandInteraction } from 'discord.js'
import { interactionReply } from '../../../utils/general/interactionReply'
import { twitchNotificationService } from '@lukbot/shared/services'
import { getPrismaClient } from '@lukbot/shared/utils'
import { errorEmbed, successEmbed } from '../../../utils/general/embeds'
import { getTwitchUserByLogin } from '../../../twitch/twitchApi'
import { refreshTwitchSubscriptions } from '../../../twitch'

async function ensureGuild(interaction: ChatInputCommandInteraction) {
	const prisma = getPrismaClient()
	let guild = await prisma.guild.findUnique({ where: { discordId: interaction.guild!.id } })
	if (!guild) {
		guild = await prisma.guild.create({
			data: { discordId: interaction.guild!.id, name: interaction.guild!.name, ownerId: interaction.guild!.ownerId },
		})
	}
	return guild
}

async function replyError(interaction: ChatInputCommandInteraction, title: string, description: string) {
	await interactionReply({ interaction, content: { embeds: [errorEmbed(title, description)], ephemeral: true } })
}

async function replySuccess(interaction: ChatInputCommandInteraction, title: string, description: string) {
	await interactionReply({ interaction, content: { embeds: [successEmbed(title, description)], ephemeral: true } })
}

export async function handleTwitchAdd(interaction: ChatInputCommandInteraction): Promise<void> {
	const username = interaction.options.getString('username', true).trim().toLowerCase()
	const channelOption = interaction.options.getChannel('channel')
	const channel = (channelOption && 'id' in channelOption ? channelOption : null) ?? interaction.channel
	if (!channel || !('id' in channel)) {
		await replyError(interaction, 'Error', 'Please specify a text channel.')
		return
	}

	const twitchUser = await getTwitchUserByLogin(username)
	if (!twitchUser) {
		await replyError(interaction, 'Twitch user not found',
			`No Twitch user found for "${username}". Check the username and that Twitch is configured (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_ACCESS_TOKEN).`)
		return
	}

	const guild = await ensureGuild(interaction)
	const success = await twitchNotificationService.add(guild.id, channel.id, twitchUser.id, twitchUser.login)
	if (success) {
		await refreshTwitchSubscriptions()
		await replySuccess(interaction, 'Twitch notification added',
			`This channel will be notified when **${twitchUser.display_name}** goes live on Twitch.`)
	} else {
		await replyError(interaction, 'Error', 'Failed to add Twitch notification.')
	}
}

export async function handleTwitchRemove(interaction: ChatInputCommandInteraction): Promise<void> {
	const username = interaction.options.getString('username', true).trim().toLowerCase()
	const twitchUser = await getTwitchUserByLogin(username)
	if (!twitchUser) {
		await replyError(interaction, 'Twitch user not found', `No Twitch user found for "${username}".`)
		return
	}

	const prisma = getPrismaClient()
	const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guild!.id } })
	if (!guild) {
		await replyError(interaction, 'Not found', 'No Twitch notification for that user in this server.')
		return
	}

	const success = await twitchNotificationService.remove(guild.id, twitchUser.id)
	if (success) {
		await refreshTwitchSubscriptions()
		await replySuccess(interaction, 'Twitch notification removed', `Stopped notifying for **${twitchUser.display_name}**.`)
	} else {
		await replyError(interaction, 'Error', 'Failed to remove Twitch notification.')
	}
}

export async function handleTwitchList(interaction: ChatInputCommandInteraction): Promise<void> {
	const prisma = getPrismaClient()
	const guild = await prisma.guild.findUnique({ where: { discordId: interaction.guild!.id } })
	if (!guild) {
		await replySuccess(interaction, 'Twitch notifications', 'No Twitch streamers configured for this server.')
		return
	}

	const list = await twitchNotificationService.listByGuild(guild.id)
	if (list.length === 0) {
		await replySuccess(interaction, 'Twitch notifications', 'No Twitch streamers configured for this server.')
		return
	}

	const lines = list.map((n) => `• **${n.twitchLogin}** → <#${n.discordChannelId}>`)
	await replySuccess(interaction, 'Twitch notifications', lines.join('\n'))
}
