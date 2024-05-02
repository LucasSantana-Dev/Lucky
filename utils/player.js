import { Player } from "discord-player";

export const createPlayer = ({ client }) => {
  try {
    new Player(client, {
      hasDebugger: true,
      ytdlOptions: {
        quality: "highestaudio",
        highWaterMark: 1 << 25
      }
    })
  } catch (err) {
    console.error('Error creating player:', err);
  }
};