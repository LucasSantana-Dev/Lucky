import dotenv from 'dotenv'
dotenv.config()
import startBot from './start.js';


export const { client, player } = await startBot();