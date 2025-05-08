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
    /\s*\(official\s*bootleg\)/gi,
    /\s*\(slowed\)/gi,
    /\s*slowed\s*and\s*reverb\s*/gi,
    /\s*slowed\s*/gi,
    /\s*reverb\s*/gi,
    /\s*rainy\s*/gi,
    /\s*nightcore\s*/gi,
    /\s*8d\s*/gi,
    /\s*phonk\s*/gi,
    /\s*bass\s*boost(ed)?\s*/gi,
    /\s*sped\s*up\s*/gi,
    /\s*speed\s*up\s*/gi,
    /\s*extended\s*/gi,
    /\s*loop(ed)?\s*/gi,
    /\s*cover\s*/gi,
    /\s*remake\s*/gi,
    /\s*remaster(ed)?\s*/gi,
    /\s*edit\s*/gi,
    /\s*remix\s*/gi,
    /\s*instrumental\s*/gi,
    /\s*karaoke\s*/gi,
    /\s*lyric(s)?\s*/gi,
    /\s*version\s*/gi
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

// Spotify title cleanup patterns (for variant detection)
// Note: Acoustic is intentionally NOT filtered out, as per user preference
export const spotifyPatterns = [
    /\s*-\s*remix( version)?/i,
    /\s*\(remix( version)?\)/i,
    /\s*-\s*live( at [^)]+)?/i,
    /\s*\(live( at [^)]+)?\)/i,
    // /\s*-\s*acoustic( version)?/i, // acoustic is allowed
    // /\s*\(acoustic( version)?\)/i, // acoustic is allowed
    /\s*-\s*radio edit/i,
    /\s*\(radio edit\)/i,
    /\s*-\s*extended( mix)?/i,
    /\s*\(extended( mix)?\)/i,
    /\s*-\s*instrumental/i,
    /\s*\(instrumental\)/i,
    /\s*-\s*demo/i,
    /\s*\(demo\)/i,
    /\s*-\s*remaster(ed)?( \d{4})?/i,
    /\s*\(remaster(ed)?( \d{4})?\)/i,
    /\s*-\s*cover/i,
    /\s*\(cover\)/i,
    /\s*-\s*sped up/i,
    /\s*\(sped up\)/i,
    /\s*-\s*slowed/i,
    /\s*\(slowed\)/i,
    /\s*-\s*bonus track/i,
    /\s*\(bonus track\)/i,
    /\s*-\s*deluxe edition/i,
    /\s*\(deluxe edition\)/i,
    /\s*-\s*explicit/i,
    /\s*\(explicit\)/i,
    /\s*-\s*[a-z]+ version/i,
    /\s*\([a-z]+ version\)/i
]; 