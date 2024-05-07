/* eslint-disable no-undef */
import ffmpeg from 'fluent-ffmpeg'

export const config = () => {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH)

  return {
    TOKEN: process.env.TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    DISCORD_TOKEN: process.env.DISCORD_TOKEN
  }
}
