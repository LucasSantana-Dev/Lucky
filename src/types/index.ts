import { Client, Collection, ChatInputCommandInteraction } from 'discord.js';
import Command from '../models/Command';
import { Player } from 'discord-player';

export interface CustomClient extends Client {
    commands: Collection<string, Command>;
    player: Player;
}

export interface CommandType {
    data: any;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}