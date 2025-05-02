import {
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
} from '@discordjs/builders';
import { CustomClient } from '../types';
import { ChatInputCommandInteraction } from 'discord.js';

export type CommandData =
  | SlashCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | SlashCommandOptionsOnlyBuilder;

export interface CommandExecuteParams {
  client: CustomClient;
  interaction: ChatInputCommandInteraction;
}

export type CommandExecute = (options: CommandExecuteParams) => Promise<void>; 