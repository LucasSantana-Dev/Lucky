
import { createPlayer } from './handlers/playerHandler.js';

import {
  createClient,
  startClient,
  mapGuildIds,
  setClientProperty
} from './handlers/clientHandler.js';

import { setCommands } from './handlers/commandsHandler.js';
import { errorLog } from './utils/log.js';

const startBot = async () => {
  try {
    const client = await createClient();

    await startClient({ client });
    const player = await createPlayer({ client });
    await setClientProperty({
      client,
      property: 'player',
      value: player
    });
    await setCommands({ client });
    mapGuildIds({ client });

    return { client, player };
  } catch (err) {
    return errorLog('Error starting bot:', err)
  }
};

export default startBot;
