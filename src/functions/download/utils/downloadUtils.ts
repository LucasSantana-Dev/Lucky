import play from 'play-dl';
import { createWriteStream, mkdir, rename } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { unlink } from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { errorLog, infoLog } from '../../../utils/log';

type MediaFormat = 'audio' | 'video';

interface DownloadResult {
    success: boolean;
    title?: string;
    duration?: string;
    quality?: string;
    error?: string;
    filePath?: string;
}

interface DownloadProgress {
    stage: 'downloading' | 'compressing';
    progress: number;
    total?: number;
    current?: number;
}

type ProgressCallback = (progress: DownloadProgress) => void;

const downloadFolder = join(process.cwd(), 'downloads');
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB Discord limit for non-nitro servers
const DOWNLOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutes timeout

export async function downloadVideo(
    url: string, 
    format: MediaFormat,
    onProgress?: ProgressCallback
): Promise<DownloadResult> {
    let tempFilePath = '';
    let finalFilePath = '';
    let fileStream: any = null;
    let downloadTimeout: NodeJS.Timeout;
    let progressInterval: NodeJS.Timeout;
    let streamStarted = false;

    const cleanup = async () => {
        if (fileStream) {
            fileStream.end();
            fileStream = null;
        }
        if (tempFilePath) {
            await deleteDownloadedFile(tempFilePath);
        }
        if (finalFilePath) {
            await deleteDownloadedFile(finalFilePath);
        }
        if (progressInterval) {
            clearInterval(progressInterval);
        }
    };

    try {
        infoLog({ message: 'Starting video download process' });
        
        // Get video info
        infoLog({ message: 'Fetching video info...' });
        const videoInfo = await play.video_info(url);
        if (!videoInfo) {
            errorLog({ message: 'Failed to fetch video info' });
            return {
                success: false,
                error: 'Could not fetch video information.'
            };
        }

        const video = videoInfo.video_details;
        const title = video.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'video';
        const duration = formatDuration(video.durationInSec);
        infoLog({ message: `Video info fetched successfully: ${title}` });

        // Create downloads directory if it doesn't exist
        await promisify(mkdir)(downloadFolder, { recursive: true });
        infoLog({ message: `Created download directory at: ${downloadFolder}` });

        // Create a unique filename
        const timestamp = Date.now();
        const extension = format === 'video' ? 'mp4' : 'mp3';
        tempFilePath = join(downloadFolder, `temp_${title}_${timestamp}.${extension}`);
        finalFilePath = join(downloadFolder, `${title}_${timestamp}.${extension}`);

        // Get the stream with appropriate quality settings
        infoLog({ message: 'Getting video stream...' });
        
        // Use direct download instead of stream for more reliability
        infoLog({ message: 'Using direct download method' });
        
        // For audio, use play-dl's stream_from_info function
        if (format === 'audio') {
            infoLog({ message: 'Downloading audio file...' });
            const audioBuffer = await play.stream_from_info(videoInfo, { quality: 0 });
            
            // Create write stream
            fileStream = createWriteStream(tempFilePath);
            let downloadedBytes = 0;
            let totalBytes = 0;
            
            // Estimate total size based on duration
            const estimatedSizePerMinute = (format as string === 'audio') ? 1024 * 1024 / 3 : 1024 * 1024;
            const durationInMinutes = video.durationInSec / 60;
            totalBytes = Math.ceil(durationInMinutes * estimatedSizePerMinute);
            
            // Set up a progress interval to ensure updates even if no data is flowing
            progressInterval = setInterval(() => {
                if (downloadedBytes > 0) {
                    const progress = totalBytes ? (downloadedBytes / totalBytes) * 100 : 0;
                    onProgress?.({
                        stage: 'downloading',
                        progress,
                        current: downloadedBytes,
                        total: totalBytes
                    });
                }
            }, 1000);

            // Set up completion handler
            return new Promise((resolve, reject) => {
                // Add error handler for the stream
                audioBuffer.stream.on('error', (error) => {
                    errorLog({ message: 'Stream error occurred', error });
                    if (!streamStarted) {
                        errorLog({ message: 'Stream failed to start, trying alternative method' });
                        downloadWithAlternativeMethod(url, format, video, onProgress, tempFilePath)
                            .then(resolve)
                            .catch(reject);
                    }
                });

                fileStream.on('finish', async () => {
                    clearInterval(progressInterval);
                    infoLog({ message: 'Download completed, checking file size...' });
                    try {
                        // Check file size and compress if needed
                        const fileStats = await stat(tempFilePath);
                        infoLog({ message: `Downloaded file size: ${fileStats.size} bytes` });

                        // Check if file is empty
                        if (fileStats.size === 0) {
                            errorLog({ message: 'Downloaded file is empty' });
                            await cleanup();
                            return {
                                success: false,
                                error: 'Failed to download the file. The downloaded file is empty.'
                            };
                        }

                        if (fileStats.size > MAX_FILE_SIZE) {
                            infoLog({ message: 'File too large, starting compression...' });
                            onProgress?.({ stage: 'compressing', progress: 0 });
                            await compressFile(tempFilePath, finalFilePath, format, onProgress);
                            // Clean up temp file
                            await deleteDownloadedFile(tempFilePath);
                        } else {
                            infoLog({ message: 'File size OK, renaming...' });
                            // If no compression needed, just rename the file
                            await promisify(rename)(tempFilePath, finalFilePath);
                            infoLog({ message: `File renamed to: ${finalFilePath}` });
                        }

                        infoLog({ message: 'Process completed successfully' });
                        resolve({
                            success: true,
                            title: video.title,
                            duration,
                            quality: format === 'audio' ? '128kbps' : '480p (compressed)',
                            filePath: finalFilePath
                        });
                    } catch (error) {
                        errorLog({ message: 'Error in file processing', error });
                        await cleanup();
                        reject(error);
                    }
                });
                
                fileStream.on('error', async (error) => {
                    errorLog({ message: 'File stream error occurred', error });
                    await cleanup();
                    reject(error);
                });
                
                // Force the stream to start flowing
                audioBuffer.stream.resume();
                
                // Pipe the stream to the file
                audioBuffer.stream.pipe(fileStream);
                
                // Add a timeout to check if data is flowing
                setTimeout(() => {
                    if (!streamStarted || downloadedBytes === 0) {
                        errorLog({ message: 'No data received after 10 seconds, trying alternative method' });
                        // Try alternative download method
                        downloadWithAlternativeMethod(url, format, video, onProgress, tempFilePath)
                            .then(resolve)
                            .catch(reject);
                    }
                }, 10000);
            });
        } else {
            // For video, use play-dl's stream_from_info function
            infoLog({ message: 'Downloading video file...' });
            const videoBuffer = await play.stream_from_info(videoInfo, { quality: 480 });
            
            // Create write stream
            fileStream = createWriteStream(tempFilePath);
            let downloadedBytes = 0;
            let totalBytes = 0;
            
            // Estimate total size based on duration
            const estimatedSizePerMinute = (format as string === 'audio') ? 1024 * 1024 / 3 : 1024 * 1024;
            const durationInMinutes = video.durationInSec / 60;
            totalBytes = Math.ceil(durationInMinutes * estimatedSizePerMinute);
            
            // Set up a progress interval to ensure updates even if no data is flowing
            progressInterval = setInterval(() => {
                if (downloadedBytes > 0) {
                    const progress = totalBytes ? (downloadedBytes / totalBytes) * 100 : 0;
                    onProgress?.({
                        stage: 'downloading',
                        progress,
                        current: downloadedBytes,
                        total: totalBytes
                    });
                }
            }, 1000);

            // Set up completion handler
            return new Promise((resolve, reject) => {
                // Add error handler for the stream
                videoBuffer.stream.on('error', (error) => {
                    errorLog({ message: 'Stream error occurred', error });
                    if (!streamStarted) {
                        errorLog({ message: 'Stream failed to start, trying alternative method' });
                        downloadWithAlternativeMethod(url, format, video, onProgress, tempFilePath)
                            .then(resolve)
                            .catch(reject);
                    }
                });

                fileStream.on('finish', async () => {
                    clearInterval(progressInterval);
                    infoLog({ message: 'Download completed, checking file size...' });
                    try {
                        // Check file size and compress if needed
                        const fileStats = await stat(tempFilePath);
                        infoLog({ message: `Downloaded file size: ${fileStats.size} bytes` });

                        // Check if file is empty
                        if (fileStats.size === 0) {
                            errorLog({ message: 'Downloaded file is empty' });
                            await cleanup();
                            return {
                                success: false,
                                error: 'Failed to download the file. The downloaded file is empty.'
                            };
                        }

                        if (fileStats.size > MAX_FILE_SIZE) {
                            infoLog({ message: 'File too large, starting compression...' });
                            onProgress?.({ stage: 'compressing', progress: 0 });
                            await compressFile(tempFilePath, finalFilePath, format, onProgress);
                            // Clean up temp file
                            await deleteDownloadedFile(tempFilePath);
                        } else {
                            infoLog({ message: 'File size OK, renaming...' });
                            // If no compression needed, just rename the file
                            await promisify(rename)(tempFilePath, finalFilePath);
                            infoLog({ message: `File renamed to: ${finalFilePath}` });
                        }

                        infoLog({ message: 'Process completed successfully' });
                        resolve({
                            success: true,
                            title: video.title,
                            duration,
                            quality: format === 'video' ? '480p (compressed)' : '128kbps',
                            filePath: finalFilePath
                        });
                    } catch (error) {
                        errorLog({ message: 'Error in file processing', error });
                        await cleanup();
                        reject(error);
                    }
                });
                
                fileStream.on('error', async (error) => {
                    errorLog({ message: 'File stream error occurred', error });
                    await cleanup();
                    reject(error);
                });
                
                // Force the stream to start flowing
                videoBuffer.stream.resume();
                
                // Pipe the stream to the file
                videoBuffer.stream.pipe(fileStream);
                
                // Add a timeout to check if data is flowing
                setTimeout(() => {
                    if (!streamStarted || downloadedBytes === 0) {
                        errorLog({ message: 'No data received after 10 seconds, trying alternative method' });
                        // Try alternative download method
                        downloadWithAlternativeMethod(url, format, video, onProgress, tempFilePath)
                            .then(resolve)
                            .catch(reject);
                    }
                }, 10000);
            });
        }
    } catch (error) {
        errorLog({ message: 'Error in download process', error });
        await cleanup();
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An error occurred while processing the video.'
        };
    }
}

// Alternative download method using play-dl's stream_from_info function
async function downloadWithAlternativeMethod(
    url: string,
    format: MediaFormat,
    video: any,
    onProgress?: ProgressCallback,
    existingTempPath?: string
): Promise<DownloadResult> {
    let downloadedBytes = 0;
    let totalBytes = 0;
    let progressInterval: NodeJS.Timeout;

    try {
        infoLog({ message: 'Using alternative download method' });
        
        const title = video.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'video';
        const duration = formatDuration(video.durationInSec);
        const timestamp = Date.now();
        const extension = format === 'video' ? 'mp4' : 'mp3';
        const tempFilePath = existingTempPath || join(downloadFolder, `temp_${title}_${timestamp}.${extension}`);
        const finalFilePath = join(downloadFolder, `${title}_${timestamp}.${extension}`);
        
        // Use play-dl's stream_from_info function
        infoLog({ message: 'Downloading with play-dl stream_from_info function' });
        
        // Get video info again to ensure we have fresh data
        const videoInfo = await play.video_info(url);
        if (!videoInfo) {
            throw new Error('Could not fetch video information for alternative download method.');
        }
        
        // Create write stream
        const fileStream = createWriteStream(tempFilePath);
        
        // Estimate total size based on duration
        const estimatedSizePerMinute = (format as string === 'audio') ? 1024 * 1024 / 3 : 1024 * 1024;
        const durationInMinutes = video.durationInSec / 60;
        totalBytes = Math.ceil(durationInMinutes * estimatedSizePerMinute);
        
        // Get the stream
        const stream = await play.stream_from_info(videoInfo, {
            quality: format === 'video' ? 480 : 0
        });
        
        // Set up a progress interval to ensure updates even if no data is flowing
        progressInterval = setInterval(() => {
            if (downloadedBytes > 0) {
                const progress = totalBytes ? (downloadedBytes / totalBytes) * 100 : 0;
                onProgress?.({
                    stage: 'downloading',
                    progress,
                    current: downloadedBytes,
                    total: totalBytes
                });
            }
        }, 1000);
        
        // Set up completion handler
        await new Promise<void>((resolve, reject) => {
            fileStream.on('finish', () => resolve());
            fileStream.on('error', (error) => reject(error));
            
            // Force the stream to start flowing
            stream.stream.resume();
            
            // Pipe the stream to the file
            stream.stream.pipe(fileStream);
        });
        
        // Check file size and compress if needed
        const fileStats = await stat(tempFilePath);
        infoLog({ message: `Downloaded file size: ${fileStats.size} bytes` });
        
        if (fileStats.size > MAX_FILE_SIZE) {
            infoLog({ message: 'File too large, starting compression...' });
            onProgress?.({ stage: 'compressing', progress: 0 });
            await compressFile(tempFilePath, finalFilePath, format, onProgress);
            // Clean up temp file
            await deleteDownloadedFile(tempFilePath);
        } else {
            infoLog({ message: 'File size OK, renaming...' });
            // If no compression needed, just rename the file
            await promisify(rename)(tempFilePath, finalFilePath);
            infoLog({ message: `File renamed to: ${finalFilePath}` });
        }
        
        infoLog({ message: 'Process completed successfully with alternative method' });
        return {
            success: true,
            title: video.title,
            duration,
            quality: format === 'video' ? '480p (compressed)' : '128kbps',
            filePath: finalFilePath
        };
    } catch (error) {
        errorLog({ message: 'Error in alternative download method', error });
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An error occurred while processing the video.'
        };
    }
}

async function compressFile(
    inputPath: string, 
    outputPath: string, 
    format: MediaFormat,
    onProgress?: ProgressCallback
): Promise<void> {
    return new Promise((resolve, reject) => {
        infoLog({ message: 'Starting compression process' });
        const command = ffmpeg(inputPath);

        if (format === 'video') {
            command
                .videoCodec('libx264')
                .videoBitrate('800k')
                .size('480x?')
                .audioCodec('aac')
                .audioBitrate('128k')
                .outputOptions([
                    '-preset fast',
                    '-movflags +faststart',
                    '-profile:v baseline',
                    '-level 3.0',
                    '-maxrate 800k',
                    '-bufsize 1600k'
                ]);
        } else {
            command
                .audioCodec('libmp3lame')
                .audioBitrate('128k')
                .outputOptions([
                    '-q:a 0',
                    '-map_metadata -1'
                ]);
        }

        // Track compression progress
        command.on('progress', (progress) => {
            infoLog({ message: `Compression progress: ${progress.percent?.toFixed(2)}%` });
            onProgress?.({
                stage: 'compressing',
                progress: progress.percent || 0,
                current: progress.frames,
                total: progress.frames
            });
        });

        command
            .on('end', () => {
                infoLog({ message: 'Compression completed successfully' });
                resolve();
            })
            .on('error', (error) => {
                errorLog({ message: 'Compression error occurred', error });
                reject(error);
            })
            .save(outputPath);
    });
}

// Helper function to delete a downloaded file
export async function deleteDownloadedFile(filePath: string): Promise<void> {
    try {
        await unlink(filePath);
        infoLog({ message: `Deleted file: ${filePath}` });
    } catch (error) {
        errorLog({ message: 'Error deleting file:', error });
    }
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
} 