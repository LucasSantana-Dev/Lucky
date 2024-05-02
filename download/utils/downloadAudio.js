import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import ytdl from 'ytdl-core';
import fs from 'fs';
import { deleteContent } from './deleteContent.js';

export const downloadAudio = async ({ url, interaction, videoInfo, outputFileName, audioPath }) => {
  try {
    const videoLength = videoInfo.videoDetails.lengthSeconds;

    if (videoLength > 600) {
      await interaction.editReply({
        content: "Somente vídeos com menos de 10 minutos podem ser baixados.",
      });
      return console.error('Video length is higher than 10 minutes.')
    }

    const audioStream = await ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
    const outputPath = path.resolve(fileURLToPath(import.meta.url), `../../content/${outputFileName}.mp3`);

    await new Promise((resolve, reject) => {
      ffmpeg(audioStream)
        .audioCodec('libmp3lame') // audio codec for mp3
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    if (fs.existsSync(audioPath)) await deleteContent(audioPath);

    await interaction.editReply({ // Edit the initial response
      content: "Baixando o áudio...",
      files: [outputPath]
    });

    audioStream.destroy();
  } catch (err) {
    console.error('There was an error downloading the audio', err);
  }
}