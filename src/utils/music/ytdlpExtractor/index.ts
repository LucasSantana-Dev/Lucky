import { YtDlpExtractorService } from './service'
import type {
    YtDlpExtractorOptions,
    YtDlpExtractorResult,
    YtDlpExtractorConfig,
} from './types'
import type { ExtractorExecutionContext } from 'discord-player'

/**
 * Main yt-dlp extractor service
 */
export class YtDlpExtractor extends YtDlpExtractorService {
    constructor(
        context: ExtractorExecutionContext,
        options?: Partial<YtDlpExtractorOptions>,
    ) {
        super(context, options)
    }
}

// export const ytDlpExtractor = new YtDlpExtractor({}, {})

export const createYtDlpExtractor = (
    context: ExtractorExecutionContext,
    options?: Partial<YtDlpExtractorOptions>,
): YtDlpExtractor => {
    return new YtDlpExtractor(context, options)
}

export type {
    YtDlpExtractorOptions,
    YtDlpExtractorResult,
    YtDlpExtractorConfig,
}
