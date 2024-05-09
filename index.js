import dotenv from 'dotenv'
dotenv.config()
await config();
import { config } from './config/config.js';
import { handleInteractions } from './handlers/interactionHandler.js';
import startBot from './start.js';

export const { client, player } = await startBot();
await handleInteractions({ client });