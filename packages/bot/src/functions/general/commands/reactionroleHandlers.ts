import {
	EmbedBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	type Guild,
	type TextChannel,
} from 'discord.js'
import { interactionReply } from '../../../utils/general/interactionReply'
import { reactionRolesService } from '@lukbot/shared/services'
import { errorEmbed, successEmbed } from '../../../utils/general/embeds'

function replyEmbed(interaction: ChatInputCommandInteraction, embed: EmbedBuilder) {
	return interactionReply({ interaction, content: { embeds: [embed], ephemeral: true } })
}

export async function handleCreate(interaction: ChatInputCommandInteraction, guild: Guild) {
	const channel = interaction.options.getChannel('channel', true) as TextChannel
	if (!channel.isTextBased()) {
		await replyEmbed(interaction, errorEmbed('Error', 'The channel must be a text channel.'))
		return
	}

	const title = interaction.options.getString('title', true)
	const description = interaction.options.getString('description', true)
	const rolesString = interaction.options.getString('roles', true)

	const roles = rolesString.split(',').map((roleStr) => {
		const parts = roleStr.trim().split(':')
		if (parts.length < 2) {
			throw new Error(`Invalid role format: ${roleStr}. Use: roleId:label:emoji:style`)
		}
		const roleId = parts[0].trim()
		const label = parts[1].trim()
		const emoji = parts[2]?.trim()
		const styleStr = parts[3]?.trim() ?? 'Primary'

		let style = ButtonStyle.Primary
		if (styleStr === 'Secondary') style = ButtonStyle.Secondary
		else if (styleStr === 'Success') style = ButtonStyle.Success
		else if (styleStr === 'Danger') style = ButtonStyle.Danger

		return { roleId, label, emoji, style }
	})

	const embed = new EmbedBuilder()
		.setTitle(title)
		.setDescription(description)
		.setColor(0x5865f2)
		.setTimestamp()

	const message = await reactionRolesService.createReactionRoleMessage({
		guild, channel, embed, roles,
	})

	if (message) {
		await replyEmbed(interaction, successEmbed('Success', `Reaction role message created in ${channel}!`))
	}
}

export async function handleDelete(interaction: ChatInputCommandInteraction, guild: Guild) {
	const messageId = interaction.options.getString('message_id', true)
	const deleted = await reactionRolesService.deleteReactionRoleMessage(messageId, guild.id)

	if (deleted) {
		await replyEmbed(interaction, successEmbed('Success', 'Reaction role message deleted.'))
	} else {
		await replyEmbed(interaction, errorEmbed(
			'Error', 'Reaction role message not found or you do not have permission to delete it.',
		))
	}
}

export async function handleList(interaction: ChatInputCommandInteraction, guild: Guild) {
	const messages = await reactionRolesService.listReactionRoleMessages(guild.id)

	if (messages.length === 0) {
		await replyEmbed(interaction, errorEmbed('No Messages', 'No reaction role messages found in this server.'))
		return
	}

	const embed = new EmbedBuilder()
		.setTitle('Reaction Role Messages')
		.setColor(0x5865f2)
		.setDescription(
			(messages as Array<{ messageId: string; channelId: string; mappings: Array<unknown> }>)
				.map(
					(msg, index: number) =>
						`${index + 1}. Message ID: \`${msg.messageId}\`\n   Channel: <#${msg.channelId}>\n   Roles: ${msg.mappings.length}`,
				)
				.join('\n\n'),
		)
		.setTimestamp()

	await replyEmbed(interaction, embed)
}
