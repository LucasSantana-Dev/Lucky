import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import play from 'play-dl';
import fs from 'fs';
import { ChatInputCommandInteraction } from 'discord.js';
import { deleteContent } from './deleteContent';
import { errorLog, infoLog } from '../../../utils/general/log';
import { interactionReply } from '../../../utils/general/interactionReply';

interface DownloadAudioParams {
  url: string;
  interaction: ChatInputCommandInteraction;
  videoInfo: any;
  outputPath: string;
  outputFileName: string;
  audioPath: string;
  onProgress?: (progress: { stage: 'downloading' | 'compressing', progress: number, current?: number, total?: number }) => void;
}

export const downloadAudio = async ({
  url,
  interaction,
  videoInfo,
  outputPath,
  outputFileName,
  audioPath,
  onProgress
}: DownloadAudioParams): Promise<void> => {
  try {
    const videoLength = videoInfo.videoDetails.lengthSeconds;

    if (videoLength > 600) {
      await interactionReply({ interaction, content: { content: "Only videos under 10 minutes can be downloaded." } });
      return errorLog({ message: 'Video length is higher than 10 minutes.', error: null });
    }

    // Create content directory if it doesn't exist
    const contentDir = path.resolve(__dirname, `../../content`);
    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true });
    }

    // Download audio stream
    infoLog({ message: 'Starting audio download' });
    const audioStream = await play.stream(url, { quality: 0 }); // 0 for audio only
    outputPath = path.resolve(__dirname, `../../content/${outputFileName}`);

    // Create a temporary file for the audio stream
    const tempAudioPath = path.resolve(__dirname, `../../content/temp_${outputFileName}`);
    const writeStream = fs.createWriteStream(tempAudioPath);
    
    let downloadedBytes = 0;
    let totalBytes = 0;
    
    // Estimate total size based on duration
    const estimatedSizePerMinute = 1024 * 1024 / 3; // ~333KB per minute for 128kbps
    const durationInMinutes = videoLength / 60;
    totalBytes = Math.ceil(durationInMinutes * estimatedSizePerMinute);
    
    // Set up progress tracking
    audioStream.stream.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const progress = totalBytes ? (downloadedBytes / totalBytes) * 100 : 0;
      
      onProgress?.({
        stage: 'downloading',
        progress,
        current: downloadedBytes,
        total: totalBytes
      });
    });
    
    await new Promise<void>((resolve, reject) => {
      audioStream.stream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Now use the temporary file with ffmpeg
    infoLog({ message: 'Converting audio to MP3' });
    onProgress?.({ stage: 'compressing', progress: 0 });
    
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempAudioPath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .output(outputPath)
        .on('progress', (progress) => {
          onProgress?.({
            stage: 'compressing',
            progress: progress.percent || 0,
            current: progress.frames,
            total: progress.frames
          });
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    // Clean up the temporary file
    if (fs.existsSync(tempAudioPath)) await deleteContent(tempAudioPath);
    if (fs.existsSync(audioPath)) await deleteContent(audioPath);

    await interactionReply({ interaction, content: { content: "Downloading the audio...", files: [outputPath] } });

    // Clean up stream
    audioStream.stream.destroy();
  } catch (error) {
    errorLog({ message: 'There was an error downloading the audio', error });
    throw error;
  }
} 