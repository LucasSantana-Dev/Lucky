// Artist-title separation patterns
export const artistTitlePatterns = [
    /^(.+?)\s*[-–]\s*(.+)$/,  // Artist - Title
    /^(.+?)\s*:\s*(.+)$/,     // Artist: Title
    /^(.+?)\s*by\s*(.+)$/,    // Title by Artist
    /^(.+?)\s*from\s*(.+)$/,  // Title from Artist
    /^(.+?)\s*\((.+?)\)/,     // Title (Artist)
    /^\[(.+?)\]\s*(.+)$/,     // [Artist] Title
    /^(.+?)\s*ft\.?\s*(.+)$/, // Artist ft. Title
    /^(.+?)\s*feat\.?\s*(.+)$/ // Artist feat. Title
];

// YouTube title cleanup patterns
export const youtubePatterns = [
    /\s*\(official\s*(music\s*)?video\)/gi,
    /\s*\(lyrics?\)/gi,
    /\s*\(with\s*lyrics?\)/gi,
    /\s*\(audio\s*only\)/gi,
    /\s*\(official\s*audio\)/gi,
    /\s*\(official\s*visualizer\)/gi,
    /\s*\(official\s*performance\s*video\)/gi,
    /\s*\(official\s*lyric\s*video\)/gi,
    /\s*\(official\s*teaser\)/gi,
    /\s*\(official\s*preview\)/gi,
    /\s*\(official\s*trailer\)/gi,
    /\s*\(official\s*clip\)/gi,
    /\s*\(official\s*version\)/gi,
    /\s*\(official\s*release\)/gi,
    /\s*\(official\s*remix\)/gi,
    /\s*\(official\s*edit\)/gi,
    /\s*\(official\s*mix\)/gi,
    /\s*\(official\s*extended\s*version\)/gi,
    /\s*\(official\s*clean\s*version\)/gi,
    /\s*\(official\s*explicit\s*version\)/gi,
    /\s*\(official\s*radio\s*edit\)/gi,
    /\s*\(official\s*single\s*version\)/gi,
    /\s*\(official\s*album\s*version\)/gi,
    /\s*\(official\s*live\s*version\)/gi,
    /\s*\(official\s*acoustic\s*version\)/gi,
    /\s*\(official\s*instrumental\)/gi,
    /\s*\(official\s*backing\s*track\)/gi,
    /\s*\(official\s*karaoke\s*version\)/gi,
    /\s*\(official\s*cover\s*version\)/gi,
    /\s*\(official\s*parody\)/gi,
    /\s*\(official\s*mashup\)/gi,
    /\s*\(official\s*bootleg\)/gi
];

// Artist name cleanup patterns
export const artistPatterns = [
    /\s*-\s*by\s*/gi,
    /\s*by\s*/gi,
    /\s*ft\.?\s*/gi,
    /\s*feat\.?\s*/gi,
    /\s*featuring\s*/gi,
    /\s*prod\.?\s*/gi,
    /\s*produced\s*by\s*/gi
];

// Duration format patterns
export const durationPatterns = {
    timeFormat: /^(\d+):(\d+)$/  // MM:SS format
}; 