import dotenv from 'dotenv'
dotenv.config()
import startBot from './start.js';
import { handleInteractions } from './utils/handleInteractions.js';

export const { client, player } = await startBot();
await handleInteractions({ client });