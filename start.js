
import { createPlayer } from './utils/player.js';

import {
  createClient,
  startClient,
  mapGuildIds,
  setClientProperty
} from './utils/client.js';
import { executeCommand, setCommands } from './utils/createCommands.js';

const startBot = async () => {
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

  await client.on("interactionCreate", async interaction => executeCommand({ interaction, client }));

  return { client, player };
};

export default startBot;
