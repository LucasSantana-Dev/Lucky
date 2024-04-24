import { Player } from "discord-player";
import { client } from '../index.js'

const FFMPEG_ARGUMENTS = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '4', '-analyzeduration', '0', '-loglevel', '0', '-f', 's16le', '-ar', '48000', '-ac', '2'];

export const createPlayer = () => (
  new Player(client, {
    hasDebugger: true,
    ytdlOptions: {
      quality: "highestaudio",
      highWaterMark: 1 << 25
    }
  })
)