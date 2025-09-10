import { QueryType } from "discord-player"

/**
 * Configuration for YouTube.js error handling and fallback mechanisms
 */
export const youtubeConfig = {
    // Error handling settings
    errorHandling: {
        // Maximum number of retries for YouTube searches
        maxRetries: 3,

        // Delay between retries in milliseconds
        retryDelay: 1000,

        // Whether to enable fallback search engines
        enableFallbacks: true,

        // Whether to skip tracks on parser errors
        skipOnParserError: true,

        // Whether to log parser errors as warnings instead of errors
        logParserErrorsAsWarnings: true,
    },

    // Fallback search engines in order of preference
    fallbackEngines: [
        QueryType.SOUNDCLOUD_SEARCH,
        QueryType.SPOTIFY_SONG,
        QueryType.APPLE_MUSIC_SONG,
        QueryType.AUTO,
        QueryType.YOUTUBE_VIDEO,
        QueryType.YOUTUBE_SEARCH,
    ],

    // YouTube-specific search engines
    youtubeEngines: [
        QueryType.YOUTUBE_SEARCH,
        QueryType.YOUTUBE_VIDEO,
        QueryType.YOUTUBE_PLAYLIST,
    ],

    // Error messages for different types of YouTube errors
    errorMessages: {
        compositeVideoError:
            "YouTube está temporariamente indisponível devido a mudanças em sua API. Tente novamente em alguns minutos.",
        hypePointsError:
            "YouTube está temporariamente indisponível devido a mudanças em sua API. Tente novamente em alguns minutos.",
        typeMismatchError:
            "Erro temporário ao processar informações do vídeo. Tente novamente.",
        parserError:
            "Erro temporário no processamento do YouTube. Tente novamente.",
        generalError: "Erro desconhecido ao processar o vídeo.",
        noResults: "Nenhum resultado encontrado para a busca.",
        allEnginesFailed: "Todos os mecanismos de busca falharam.",
    },

    // Debug filter patterns for YouTube.js parser errors
    debugFilterPatterns: [
        "Unable to find matching run for command run",
        "CompositeVideoPrimaryInfo not found",
        "HypePointsFactoid not found",
        "GridShelfView not found",
        "SectionHeaderView not found",
        "Type mismatch",
        "InnertubeError",
        "ParsingError",
    ],

    // Player configuration overrides for better YouTube.js compatibility
    playerOverrides: {
        // Increased timeout for YouTube operations
        connectionTimeout: 120000,

        // More retries for downloads
        downloadRetries: 3,

        // Increased extractor count for better fallback
        maxExtractors: 5,

        // User agent for better compatibility
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
} as const

export type YouTubeConfig = typeof youtubeConfig
