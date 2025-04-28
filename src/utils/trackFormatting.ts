import { errorLog } from './log';

// Helper function to format duration
export const formatDuration = (duration: string): string => {
    try {
        const match = duration.match(/^(\d+):(\d+)$/);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        return duration;
    } catch (error) {
        errorLog({ message: 'Error formatting duration:', error });
        return 'Desconhecida';
    }
};

// Helper function to safely get track properties
export const getTrackInfo = (track: any) => {
    try {
        return {
            title: track?.title || 'Música desconhecida',
            duration: track?.duration ? formatDuration(track.duration) : 'Desconhecida',
            requestedBy: track?.requestedBy?.username || 'Desconhecido',
            url: track?.url || ''
        };
    } catch (error) {
        errorLog({ message: 'Error getting track info:', error });
        return {
            title: 'Música desconhecida',
            duration: 'Desconhecida',
            requestedBy: 'Desconhecido',
            url: ''
        };
    }
}; 