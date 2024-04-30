import dotenv from 'dotenv';
dotenv.config()
import fs from 'fs';
import path from 'path';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';

import {
  createClient,
  startClient,
  mapGuildIds,
  setClientProperty
} from './utils/client.js';
import { executeCommand, setCommands } from './utils/createCommands.js';
import { createPlayer } from './utils/player.js';
import { log } from './utils/logs.js';

export const startBot = async () => {
  const client = await createClient();

  await startClient({ client });
  const player = createPlayer({ client });
  setClientProperty({
    client,
    property: 'player',
    value: player
  });
  await setCommands({ client });
  mapGuildIds({ client });

  return { client, player }
}
