import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { autoMessageService, type MessageType } from '@lukbot/shared/services';
import { infoLog } from '@lukbot/shared/utils';
import { interactionReply } from '../../../utils/general/interactionReply.js';

async function getMessageByType(guildId: string, type: MessageType) {
	if (type === 'welcome') return autoMessageService.getWelcomeMessage(guildId);
	if (type === 'leave') return autoMessageService.getLeaveMessage(guildId);
	return null;
}

export async function handleAutoMessageConfig(interaction: ChatInputCommandInteraction, type: MessageType): Promise<void> {
	const enabled = interaction.options.getBoolean('enabled', true);
	const channel = interaction.options.getChannel('channel');
	const message = interaction.options.getString('message');

	if (enabled && !message && !channel) {
		const existing = await getMessageByType(interaction.guild!.id, type);
		if (!existing) {
			await interactionReply({ interaction, content: { content: '❌ Please provide a channel and message to enable this feature.' } });
			return;
		}
	}

	if (enabled && message && channel) {
		const existing = await getMessageByType(interaction.guild!.id, type);
		if (existing) {
			await autoMessageService.updateMessage(existing.id, { enabled: true, message, channelId: channel.id });
		} else {
			await autoMessageService.createMessage(interaction.guild!.id, type, { message }, { channelId: channel.id });
		}
	} else if (enabled && (message || channel)) {
		const existing = await getMessageByType(interaction.guild!.id, type);
		if (existing) {
			await autoMessageService.updateMessage(existing.id, {
				enabled: true, ...(message && { message }), ...(channel && { channelId: channel.id }),
			});
		} else {
			await interactionReply({ interaction, content: { content: '❌ Please provide both channel and message for the first setup.' } });
			return;
		}
	} else if (!enabled) {
		const existing = await getMessageByType(interaction.guild!.id, type);
		if (existing) await autoMessageService.updateMessage(existing.id, { enabled: false });
	}

	const embed = new EmbedBuilder()
		.setColor(enabled ? 0x51cf66 : 0xc92a2a)
		.setTitle(`${enabled ? '✅' : '❌'} ${type === 'welcome' ? 'Welcome' : 'Leave'} Messages ${enabled ? 'Enabled' : 'Disabled'}`)
		.setTimestamp();
	if (enabled && channel) embed.addFields({ name: 'Channel', value: `${channel}` });
	if (enabled && message) embed.addFields({ name: 'Message', value: message.length > 100 ? message.substring(0, 97) + '...' : message });

	await interactionReply({ interaction, content: { embeds: [embed] } });
	infoLog({ message: `${type} messages ${enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag} in ${interaction.guild!.name}` });
}

export async function handleAutoMessageList(interaction: ChatInputCommandInteraction): Promise<void> {
	const welcomeMessages = await autoMessageService.getMessagesByType(interaction.guild!.id, 'welcome');
	const leaveMessages = await autoMessageService.getMessagesByType(interaction.guild!.id, 'leave');
	const allMessages = [...welcomeMessages, ...leaveMessages];

	if (allMessages.length === 0) {
		await interactionReply({ interaction, content: { content: '📋 No auto-messages configured.' } });
		return;
	}

	const embed = new EmbedBuilder()
		.setColor(0x5865f2)
		.setTitle('📋 Auto-Messages')
		.setDescription(
			allMessages
				.map((msg: { enabled: boolean; type: string; channelId: string | null; message: string }) => {
					const status = msg.enabled ? '✅' : '❌';
					const channel = msg.channelId ? `<#${msg.channelId}>` : 'Not set';
					return `${status} **${msg.type.toUpperCase()}**\n└ Channel: ${channel}\n└ Message: ${msg.message.substring(0, 50)}${msg.message.length > 50 ? '...' : ''}`;
				})
				.join('\n\n')
		)
		.setFooter({ text: `Total: ${allMessages.length} auto-messages` })
		.setTimestamp();

	await interactionReply({ interaction, content: { embeds: [embed] } });
}
