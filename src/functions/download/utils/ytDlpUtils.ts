import { spawn } from 'child_process';
import { unlink } from 'fs/promises';

interface YtDlpDownloadResult {
    success: boolean;
    filePath?: string;
    error?: string;
}

export async function downloadWithYtDlp(url: string, format: 'video' | 'audio', outputPath: string): Promise<YtDlpDownloadResult> {
    return new Promise((resolve) => {
        const args = [
            url,
            '-o', outputPath,
            '--no-playlist',
        ];
        if (format === 'audio') {
            args.push('-x', '--audio-format', 'mp3');
        } else {
            args.push('-f', 'mp4');
        }

        const ytDlp = spawn('yt-dlp', args);
        let errorMsg = '';

        ytDlp.stderr.on('data', (data) => {
            errorMsg += data.toString();
        });

        ytDlp.on('close', async (code) => {
            if (code === 0) {
                resolve({ success: true, filePath: outputPath });
            } else {
                // Cleanup if file was partially created
                try { await unlink(outputPath); } catch {}
                resolve({ success: false, error: errorMsg || 'yt-dlp failed with code ' + code });
            }
        });
    });
} 