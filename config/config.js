/* eslint-disable no-undef */
import dotenv from 'dotenv'

export const config = () => {
  dotenv.config()

  process.env.FFMPEG_PATH = './node_modules/ffmpeg-static/ffmpeg.exe'

  return {
    TOKEN: process.env.TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    DISCORD_TOKEN: process.env.DISCORD_TOKEN
  }
}
