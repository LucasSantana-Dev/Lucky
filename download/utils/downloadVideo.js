import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import ytdl from 'ytdl-core';
import fs from 'fs';
import { deleteContent } from './deleteContent.js';

export const downloadVideo = async ({ url, interaction, videoFileName, outputPath, outputFileName, videoInfo, audioPath }) => {
  try {
    const videoPath = path.resolve(fileURLToPath(import.meta.url), `../../content/${videoFileName}`);

    outputPath = path.resolve(fileURLToPath(import.meta.url), `../../content/${outputFileName}`);

    const videoLength = videoInfo.videoDetails.lengthSeconds;

    if (videoLength > 600) {
      await interaction.editReply({
        content: "Somente vídeos com menos de 10 minutos podem ser baixados.",
      });
      return console.error('Video length is higher than 10 minutes.')
    }

    const videoStream = await ytdl(url, { quality: 'highestvideo' });

    await videoStream.pipe(await fs.createWriteStream(videoPath));
    await new Promise((resolve, reject) => {
      videoStream.on('finish', resolve);
      videoStream.on('error', reject);
    });

    const audioStream = await ytdl(url, { quality: 'highestaudio' });

    await audioStream.pipe(await fs.createWriteStream(audioPath));
    await new Promise((resolve, reject) => {
      audioStream.on('finish', resolve);
      audioStream.on('error', reject);
    });

    const videoOutputQuality = videoLength < 500 ? '23' : '26';

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions('-c:v', 'libx264') // video codec
        .outputOptions('-c:a', 'aac') // audio codec
        .outputOptions('-crf', videoOutputQuality) // quality, lower is better
        .outputOptions('-preset', 'ultrafast') // encoding speed/quality. ultrafast gives the fastest encoding but lower quality
        .outputOptions('-movflags', 'frag_keyframe+empty_moov') // required for streaming
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    if (fs.existsSync(videoPath)) await deleteContent(videoPath);
    if (fs.existsSync(audioPath)) await deleteContent(audioPath);

    await interaction.editReply({ // Edit the initial response
      content: "Baixando o vídeo...",
      files: [outputPath]
    });

    audioStream.destroy();
    videoStream.destroy();
  } catch (err) {
    console.error('There was an error downloading the video', err);
  }
}