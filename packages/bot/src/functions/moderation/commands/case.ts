import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Command from '../../../models/Command.js';
import { errorLog } from '@lukbot/shared/utils';
import { interactionReply } from '../../../utils/general/interactionReply.js';
import { handleCaseView, handleCaseUpdate, handleCaseDelete } from './caseHandlers.js';

export default new Command({
	data: new SlashCommandBuilder()
		.setName('case')
		.setDescription('Manage moderation cases')
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.addSubcommand((sub) =>
			sub.setName('view').setDescription('View details of a specific case')
				.addIntegerOption((opt) => opt.setName('case_number').setDescription('The case number to view').setRequired(true).setMinValue(1)),
		)
		.addSubcommand((sub) =>
			sub.setName('update').setDescription('Update the reason for a case')
				.addIntegerOption((opt) => opt.setName('case_number').setDescription('The case number to update').setRequired(true).setMinValue(1))
				.addStringOption((opt) => opt.setName('reason').setDescription('New reason for the case').setRequired(true)),
		)
		.addSubcommand((sub) =>
			sub.setName('delete').setDescription('Delete a case (requires Administrator)')
				.addIntegerOption((opt) => opt.setName('case_number').setDescription('The case number to delete').setRequired(true).setMinValue(1)),
		),
	category: 'moderation',
	execute: async ({ interaction }) => {
		if (!interaction.guild) {
			await interactionReply({ interaction, content: { content: '❌ This command can only be used in a server.' } });
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		const caseNumber = interaction.options.getInteger('case_number', true);

		try {
			if (subcommand === 'view') return await handleCaseView(interaction, caseNumber);
			if (subcommand === 'update') return await handleCaseUpdate(interaction, caseNumber);
			if (subcommand === 'delete') return await handleCaseDelete(interaction, caseNumber);
		} catch (error) {
			errorLog({ message: `Failed to ${subcommand} case`, error: error as Error });
			await interactionReply({ interaction, content: { content: `❌ Failed to ${subcommand} case. Please try again.` } });
		}
	},
});
