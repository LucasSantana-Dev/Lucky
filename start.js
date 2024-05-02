
import { createPlayer } from './utils/player.js';

import {
  createClient,
  startClient,
  mapGuildIds,
  setClientProperty
} from './utils/client.js';
import { setCommands } from './utils/createCommands.js';

const startBot = async () => {
  try {
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

    return { client, player };
  } catch (err) {
    console.error('Error starting bot:', err);
  }
};

export default startBot;
