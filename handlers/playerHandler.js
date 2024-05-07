import { Player } from "discord-player";

export const createPlayer = ({ client }) => (
  new Player(client, {
    hasDebugger: true,
    ytdlOptions: {
      quality: "highestaudio",
      highWaterMark: 1 << 100
    }
  })
);