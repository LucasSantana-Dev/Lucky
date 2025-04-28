/* eslint-disable no-undef */
import { config as dotenvConfig } from 'dotenv';
import { errorLog } from '@utils/log';

// Load environment variables
dotenvConfig();

// Cache for configuration
let configCache: {
  TOKEN: string | undefined;
  CLIENT_ID: string | undefined;
} | null = null;

export const config = () => {
  // Return cached config if available
  if (configCache) {
    return configCache;
  }
  
  const token = process.env.TOKEN || process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  
  if (!token) {
    errorLog({ message: 'TOKEN or DISCORD_TOKEN is not defined in environment variables' });
  }
  
  if (!clientId) {
    errorLog({ message: 'CLIENT_ID is not defined in environment variables' });
  }
  
  // Cache the config
  configCache = {
    TOKEN: token,
    CLIENT_ID: clientId
  };
  
  return configCache;
}

// Function to clear the cache if needed (e.g., for testing)
export const clearConfigCache = (): void => {
  configCache = null;
}

export const constants = {
  VOLUME: 50,
  MAX_AUTOPLAY_TRACKS: 50, // Maximum number of tracks to autoplay before resetting
}
