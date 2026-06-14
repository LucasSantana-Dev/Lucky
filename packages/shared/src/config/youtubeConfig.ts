import type { QueryType } from 'discord-player'
import { ENVIRONMENT_CONFIG } from './config'

// Search-engine identifiers as literal strings rather than `QueryType` enum
// members. The enum is imported as a *type only* (erased at build), so this
// config — loaded transitively by anything importing shared config — no longer
// pulls the heavy `discord-player → discord-voip → @snazzah/davey` chain at
// module load. That native chain registered a `CustomGC` handle that leaked
// into jest workers and caused intermittent suite failures (#1322).
//
// `satisfies readonly \`${QueryType}\`[]` keeps these in lockstep with
// discord-player's QueryType: if an upgrade renames a value, this stops
// compiling. Verified against the installed package (e.g. SOUNDCLOUD_SEARCH ===
// 'soundcloudSearch').
const FALLBACK_ENGINES = [
    'soundcloudSearch',
    'spotifySong',
    'appleMusicSong',
    'auto',
    'youtubeVideo',
    'youtubeSearch',
] as const satisfies readonly `${QueryType}`[]

const YOUTUBE_ENGINES = [
    'youtubeSearch',
    'youtubeVideo',
    'youtubePlaylist',
] as const satisfies readonly `${QueryType}`[]

/**
 * Configuration for YouTube.js error handling and fallback mechanisms
 */
export const youtubeConfig = {
    // Error handling settings
    errorHandling: {
        // Maximum number of retries for YouTube searches
        maxRetries: ENVIRONMENT_CONFIG.YOUTUBE.MAX_RETRIES,

        // Delay between retries in milliseconds
        retryDelay: ENVIRONMENT_CONFIG.YOUTUBE.RETRY_DELAY,

        // Whether to enable fallback search engines
        enableFallbacks: true,

        // Whether to skip tracks on parser errors
        skipOnParserError: true,

        // Whether to log parser errors as warnings instead of errors
        logParserErrorsAsWarnings: true,
    },

    // Fallback search engines in order of preference
    fallbackEngines: FALLBACK_ENGINES,

    // YouTube-specific search engines
    youtubeEngines: YOUTUBE_ENGINES,

    // Error messages for different types of YouTube errors
    errorMessages: {
        compositeVideoError:
            'YouTube está temporariamente indisponível devido a mudanças em sua API. Tente novamente em alguns minutos.',
        hypePointsError:
            'YouTube está temporariamente indisponível devido a mudanças em sua API. Tente novamente em alguns minutos.',
        typeMismatchError:
            'Erro temporário ao processar informações do vídeo. Tente novamente.',
        parserError:
            'Erro temporário no processamento do YouTube. Tente novamente.',
        generalError: 'Erro desconhecido ao processar o vídeo.',
        noResults: 'Nenhum resultado encontrado para a busca.',
        allEnginesFailed: 'Todos os mecanismos de busca falharam.',
    },

    // Debug filter patterns for YouTube.js parser errors
    debugFilterPatterns: [
        'Unable to find matching run for command run',
        'CompositeVideoPrimaryInfo not found',
        'HypePointsFactoid not found',
        'GridShelfView not found',
        'SectionHeaderView not found',
        'Type mismatch',
        'InnertubeError',
        'ParsingError',
    ],

    // Player configuration overrides for better YouTube.js compatibility
    playerOverrides: {
        // Increased timeout for YouTube operations
        connectionTimeout: ENVIRONMENT_CONFIG.YOUTUBE.CONNECTION_TIMEOUT,

        // More retries for downloads
        downloadRetries: ENVIRONMENT_CONFIG.YOUTUBE.MAX_RETRIES,

        // Increased extractor count for better fallback
        maxExtractors: ENVIRONMENT_CONFIG.YOUTUBE.MAX_EXTRACTORS,

        // User agent for better compatibility
        userAgent: ENVIRONMENT_CONFIG.YOUTUBE.USER_AGENT,
    },
} as const

export type YouTubeConfig = typeof youtubeConfig
