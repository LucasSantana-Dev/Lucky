import { join } from 'path';
import { downloadWithYtDlp } from './ytDlpUtils';
import { errorLog, infoLog } from '../../../utils/general/log';
import { unlink } from 'fs/promises';

const downloadFolder = join(process.cwd(), 'downloads');

export async function downloadVideo(
    url: string,
    format: 'video' | 'audio',
    onProgress?: (progress: any) => void
): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
        infoLog({ message: 'Starting yt-dlp download process' });
        // Create a unique filename
        const timestamp = Date.now();
        const extension = format === 'video' ? 'mp4' : 'mp3';
        const filePath = join(downloadFolder, `yt-dlp_${timestamp}.${extension}`);

        const result = await downloadWithYtDlp(url, format, filePath);
        if (result.success) {
            infoLog({ message: 'yt-dlp download succeeded', data: { filePath } });
            return { success: true, filePath };
        } else {
            errorLog({ message: 'yt-dlp download failed', error: result.error });
            return {
                success: false,
                error: result.error || 'Não foi possível baixar este vídeo. O YouTube pode estar bloqueando downloads automáticos ou o vídeo possui restrições.'
            };
        }
    } catch (error) {
        errorLog({ message: 'Error in yt-dlp download process', error });
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido ao baixar o vídeo.'
        };
    }
}

export async function deleteDownloadedFile(filePath: string): Promise<void> {
    try {
        await unlink(filePath);
        infoLog({ message: `Deleted file: ${filePath}` });
    } catch (error) {
        errorLog({ message: 'Error deleting file:', error });
    }
} 