import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Command from '../../../models/Command.js';
import type { MessageType } from '@lukbot/shared/services';
import { errorLog } from '@lukbot/shared/utils';
import { interactionReply } from '../../../utils/general/interactionReply.js';
import { handleAutoMessageConfig, handleAutoMessageList } from './automessageHandlers.js';

export default new Command({
	data: new SlashCommandBuilder()
		.setName('automessage')
		.setDescription('Configure auto-messages')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) =>
			sub.setName('welcome').setDescription('Configure welcome messages')
				.addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable welcome messages').setRequired(true))
				.addChannelOption((opt) => opt.setName('channel').setDescription('Channel to send welcome messages'))
				.addStringOption((opt) => opt.setName('message').setDescription('Welcome message (use {user}, {server}, {memberCount})').setMaxLength(2000)),
		)
		.addSubcommand((sub) =>
			sub.setName('leave').setDescription('Configure leave messages')
				.addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable leave messages').setRequired(true))
				.addChannelOption((opt) => opt.setName('channel').setDescription('Channel to send leave messages'))
				.addStringOption((opt) => opt.setName('message').setDescription('Leave message (use {user}, {server}, {memberCount})').setMaxLength(2000)),
		)
		.addSubcommand((sub) => sub.setName('list').setDescription('List all auto-messages')),
	category: 'management',
	execute: async ({ interaction }) => {
		if (!interaction.guild) {
			await interactionReply({ interaction, content: { content: '❌ This command can only be used in a server.' } });
			return;
		}

		const subcommand = interaction.options.getSubcommand();

		try {
			if (subcommand === 'welcome' || subcommand === 'leave') {
				return await handleAutoMessageConfig(interaction, subcommand as MessageType);
			}
			if (subcommand === 'list') return await handleAutoMessageList(interaction);
		} catch (error) {
			errorLog({ message: 'Failed to manage auto-message', error: error as Error });
			await interactionReply({ interaction, content: { content: '❌ Failed to manage auto-message. Please try again.' } });
		}
	},
});
