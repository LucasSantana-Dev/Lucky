import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { interactionReply } from '../../../utils/general/interactionReply'
import { roleManagementService } from '@lukbot/shared/services'
import { errorEmbed, successEmbed } from '../../../utils/general/embeds'

async function replyError(interaction: ChatInputCommandInteraction, title: string, desc: string) {
	await interactionReply({ interaction, content: { embeds: [errorEmbed(title, desc)], ephemeral: true } })
}

async function replySuccess(interaction: ChatInputCommandInteraction, title: string, desc: string) {
	await interactionReply({ interaction, content: { embeds: [successEmbed(title, desc)], ephemeral: true } })
}

export async function handleSetExclusive(interaction: ChatInputCommandInteraction): Promise<void> {
	const role = interaction.options.getRole('role', true)
	const excludedRole = interaction.options.getRole('excluded_role', true)

	if (role.id === excludedRole.id) {
		await replyError(interaction, 'Error', 'A role cannot exclude itself.')
		return
	}

	const success = await roleManagementService.setExclusiveRole(interaction.guild!.id, role.id, excludedRole.id)
	if (success) {
		await replySuccess(interaction, 'Success',
			`When users receive ${role.name}, ${excludedRole.name} will be automatically removed.`)
	} else {
		await replyError(interaction, 'Error', 'Failed to set exclusive role rule.')
	}
}

export async function handleRemoveExclusive(interaction: ChatInputCommandInteraction): Promise<void> {
	const role = interaction.options.getRole('role', true)
	const excludedRole = interaction.options.getRole('excluded_role', true)

	const success = await roleManagementService.removeExclusiveRole(interaction.guild!.id, role.id, excludedRole.id)
	if (success) {
		await replySuccess(interaction, 'Success', 'Exclusive role rule removed.')
	} else {
		await replyError(interaction, 'Error', 'Exclusive role rule not found.')
	}
}

export async function handleListExclusive(interaction: ChatInputCommandInteraction): Promise<void> {
	const exclusions = await roleManagementService.listExclusiveRoles(interaction.guild!.id)

	if (exclusions.length === 0) {
		await replyError(interaction, 'No Rules', 'No exclusive role rules found in this server.')
		return
	}

	const embed = new EmbedBuilder()
		.setTitle('Exclusive Role Rules')
		.setColor(0x5865f2)
		.setDescription(
			(exclusions as Array<{ roleId: string; excludedRoleId: string }>)
				.map((ex, i: number) => `${i + 1}. <@&${ex.roleId}> excludes <@&${ex.excludedRoleId}>`)
				.join('\n'),
		)
		.setTimestamp()

	await interactionReply({ interaction, content: { embeds: [embed], ephemeral: true } })
}
