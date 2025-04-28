import { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from '@discordjs/builders';
import { CustomClient } from '@/types';

interface CommandOptions {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (options: { client: CustomClient; interaction: ChatInputCommandInteraction }) => Promise<void>;
}

export default class Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (options: { client: CustomClient; interaction: ChatInputCommandInteraction }) => Promise<void>;

  constructor(options: CommandOptions) {
    this.data = options.data;
    this.execute = options.execute;
  }
} 