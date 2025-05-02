import { Client } from 'discord.js';
import chalk from 'chalk';
import { infoLog } from '../utils/general/log';

export const name = 'ready';
export const once = true;

export function execute(client: Client): void {
    infoLog({ message: `Logged in as ${chalk.white(client.user?.tag)}!` });
} 