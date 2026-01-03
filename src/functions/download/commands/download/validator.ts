import {
    isSupportedPlatformUrl,
    getPlatformFromUrl,
} from '../../utils/downloadHelpers'
import type { DownloadValidation, PlatformInfo, DownloadOptions } from './types'

/**
 * Download validation utilities
 */
export class DownloadValidator {
    static validateUrl(url: string): DownloadValidation {
        if (!url || typeof url !== 'string') {
            return {
                isValid: false,
                error: 'Invalid URL provided',
            }
        }

        if (!isSupportedPlatformUrl(url)) {
            return {
                isValid: false,
                error: 'Unsupported platform. Only YouTube, SoundCloud, and other supported platforms are allowed.',
            }
        }

        const platform = getPlatformFromUrl(url)
        return {
            isValid: true,
            platform,
        }
    }

    async validateDownload(
        options: DownloadOptions,
    ): Promise<DownloadValidation> {
        const urlValidation = DownloadValidator.validateUrl(options.url)
        if (!urlValidation.isValid) {
            return urlValidation
        }

        if (!DownloadValidator.validateFormat(options.format)) {
            return {
                isValid: false,
                error: "Invalid format. Only 'audio' or 'video' are supported.",
            }
        }

        return {
            isValid: true,
            platform: urlValidation.platform,
        }
    }

    static validateFormat(format: string): boolean {
        return format === 'audio' || format === 'video'
    }

    static validateQuality(quality: string): boolean {
        const validQualities = ['low', 'medium', 'high', 'best']
        return validQualities.includes(quality.toLowerCase())
    }

    static validateDuration(duration: number, maxDuration?: number): boolean {
        if (maxDuration === undefined || maxDuration <= 0) return true
        return duration <= maxDuration
    }

    static validateFileSize(fileSize: number, maxFileSize?: number): boolean {
        if (maxFileSize === undefined || maxFileSize <= 0) return true
        return fileSize <= maxFileSize
    }

    static getPlatformInfo(platform: string): PlatformInfo {
        const platformConfigs: Record<string, PlatformInfo> = {
            youtube: {
                name: 'YouTube',
                supported: true,
                maxDuration: 3600, // 1 hour
                maxFileSize: 100 * 1024 * 1024, // 100MB
            },
            soundcloud: {
                name: 'SoundCloud',
                supported: true,
                maxDuration: 1800, // 30 minutes
                maxFileSize: 50 * 1024 * 1024, // 50MB
            },
            default: {
                name: 'Unknown',
                supported: false,
            },
        }

        return platformConfigs[platform] ?? platformConfigs['default']
    }
}
