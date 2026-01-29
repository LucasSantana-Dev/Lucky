/**
 * Title pattern configurations
 */

export const artistTitlePatterns: RegExp[] = []

export const youtubePatterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/playlist\?list=([^&\n?#]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/channel\/([^&\n?#]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/c\/([^&\n?#]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/user\/([^&\n?#]+)/,
]

export const artistPatterns: RegExp[] = []
