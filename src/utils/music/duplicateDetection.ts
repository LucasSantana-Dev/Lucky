import { Track } from 'discord-player';
import { debugLog } from '../general/log';

// Interface for track history entry
export interface TrackHistoryEntry {
  url: string;
  title: string;
  author: string;
  thumbnail?: string;
  timestamp: number;
}

// Map to store recently played tracks for each guild (to avoid repeats)
export const recentlyPlayedTracks = new Map<string, TrackHistoryEntry[]>();
const MAX_HISTORY_SIZE = 50; // Maximum number of tracks to remember

// Map to store track IDs for faster duplicate checking
export const trackIdSet = new Map<string, Set<string>>();

// Map to store the last played track for each guild
export const lastPlayedTracks = new Map<string, Track>();

// Map to store artist and genre information for autoplay
export interface TrackMetadata {
  artist: string;
  genre?: string;
  tags: string[];
  views: number;
}

export const artistGenreMap = new Map<string, TrackMetadata>();

/**
 * Extract tags from track title and description
 */
function extractTags(track: Track): string[] {
  const tags: Set<string> = new Set();
  
  try {
    // Extract genre-related words from title
    const titleWords = track.title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3); // Filter out short words
    
    // Common music genres and styles
    const genreKeywords = [
      'rock', 'pop', 'jazz', 'blues', 'country', 'folk', 'rap', 'hip hop',
      'metal', 'classical', 'electronic', 'dance', 'reggae', 'samba', 'forro',
      'sertanejo', 'mpb', 'pagode', 'funk', 'axé', 'gospel'
    ];
    
    // Add genre tags
    titleWords.forEach(word => {
      if (genreKeywords.some(genre => word.includes(genre))) {
        tags.add(word);
      }
    });
    
    // Add artist name as tag
    if (track.author) {
      tags.add(track.author.toLowerCase());
    }
    
    // Add year if present in title
    const yearMatch = track.title.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      tags.add(yearMatch[0]);
    }
    
    // Add live/acoustic tags if applicable
    if (track.title.toLowerCase().includes('ao vivo') || 
        track.title.toLowerCase().includes('live')) {
      tags.add('ao vivo');
    }
    if (track.title.toLowerCase().includes('acustic')) {
      tags.add('acustico');
    }
    
  } catch (error) {
    debugLog({ message: 'Error extracting tags:', error });
  }
  
  return Array.from(tags);
}

/**
 * Add a track to the history to prevent it from being played again soon
 */
export function addTrackToHistory(track: Track, guildId: string): void {
  try {
    // Update recently played tracks
    const guildHistory = recentlyPlayedTracks.get(guildId) || [];
    guildHistory.unshift({
      url: track.url,
      title: track.title,
      author: track.author,
      thumbnail: track.thumbnail,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (guildHistory.length > MAX_HISTORY_SIZE) {
      guildHistory.pop();
    }
    
    recentlyPlayedTracks.set(guildId, guildHistory);
    
    // Add track ID to the set
    if (track.id) {
      if (!trackIdSet.has(guildId)) {
        trackIdSet.set(guildId, new Set<string>());
      }
      trackIdSet.get(guildId)?.add(track.id);
      
      // Store enhanced metadata for autoplay
      const tags = extractTags(track);
      artistGenreMap.set(track.id, {
        artist: track.author,
        tags: tags,
        views: track.views || 0
      });
    }
    
    // Store the last played track
    lastPlayedTracks.set(guildId, track);
    
    debugLog({ message: `Added track "${track.title}" to history for guild ${guildId}` });
  } catch (error) {
    debugLog({ message: `Error adding track to history:`, error });
  }
}

/**
 * Calculate similarity between two strings (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = (s1: string, s2: string): number => {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };

  const longerLength = longer.length;
  const distance = editDistance(longer, shorter);
  return (longerLength - distance) / longerLength;
}

/**
 * Clean title for comparison
 */
function cleanTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    // Remove common suffixes and prefixes
    .replace(/(official|video|audio|music|lyric|lyrics|visualizer|hq|hd|\(.*?\)|\[.*?\])/g, '')
    // Remove special characters
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * Check if a track is a duplicate or too similar to recently played tracks
 */
export function isDuplicateTrack(track: Track, guildId: string, currentTrackIds: Set<string>): boolean {
  try {
    // Skip tracks without IDs
    if (!track.id) return true;
    
    // Check if track ID is in the current queue
    if (currentTrackIds.has(track.id)) return true;
    
    // Check if track ID is in the history
    if (trackIdSet.get(guildId)?.has(track.id)) return true;
    
    // Check if track URL is in the recently played tracks
    if (recentlyPlayedTracks.get(guildId)?.some(t => t.url === track.url)) return true;
    
    // Clean and compare titles
    const cleanedNewTitle = cleanTitle(track.title);
    
    // Check if track title is similar to any recently played track
    const isTitleSimilar = recentlyPlayedTracks.get(guildId)?.some(t => {
      const cleanedHistoryTitle = cleanTitle(t.title);
      
      // Skip very short titles
      if (cleanedNewTitle.length < 5 || cleanedHistoryTitle.length < 5) return false;
      
      // Calculate similarity
      const similarity = calculateSimilarity(cleanedNewTitle, cleanedHistoryTitle);
      return similarity > 0.8; // 80% similarity threshold
    });
    
    if (isTitleSimilar) {
      debugLog({ message: `Skipping similar track: ${track.title}` });
      return true;
    }
    
    // Check if artist is the same as the last played track
    const lastTrack = lastPlayedTracks.get(guildId);
    if (lastTrack && lastTrack.author && track.author) {
      const normalizedLastArtist = lastTrack.author.toLowerCase().trim();
      const normalizedCurrentArtist = track.author.toLowerCase().trim();
      
      // If the artists are the same, only allow it if it's been a while since we played this artist
      if (normalizedLastArtist === normalizedCurrentArtist) {
        // Check if we've played this artist recently
        const recentTracks = recentlyPlayedTracks.get(guildId) || [];
        const recentArtistTracks = recentTracks.filter(t => 
          t.author.toLowerCase().trim() === normalizedLastArtist
        );
        
        // If we've played this artist recently, skip this track
        if (recentArtistTracks.length > 0) {
          debugLog({ message: `Skipping track from recently played artist: ${track.author}` });
          return true;
        }
      }
    }
    
    // Track passed all checks
    return false;
  } catch (error) {
    debugLog({ message: `Error checking if track is duplicate:`, error });
    return true; // Assume it's a duplicate if there's an error
  }
}

/**
 * Get the artist information for a track
 */
export function getArtistInfo(trackId: string): TrackMetadata | undefined {
  return artistGenreMap.get(trackId);
}

/**
 * Clear the history for a guild
 */
export function clearHistory(guildId: string): void {
  recentlyPlayedTracks.delete(guildId);
  trackIdSet.delete(guildId);
  lastPlayedTracks.delete(guildId);
  debugLog({ message: `Cleared history for guild ${guildId}` });
} 