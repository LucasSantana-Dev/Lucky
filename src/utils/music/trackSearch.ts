import { Track, QueryType, GuildQueue, SearchQueryType } from 'discord-player';
import { User } from 'discord.js';
import { debugLog, errorLog } from '../general/log';
import { isDuplicateTrack, getArtistInfo, TrackMetadata } from './duplicateDetection';
import { youtubePatterns, spotifyPatterns } from '../../config/titlePatterns';

/**
 * Build a search query based on track metadata
 */
function buildRelatedQuery(metadata: TrackMetadata): string {
  const queryParts: string[] = [];
  
  // Always include up to 2 genre tags if available
  const genreTags = metadata.tags.filter(tag => 
    ['rock', 'pop', 'jazz', 'blues', 'country', 'folk', 'rap', 'hip hop',
     'metal', 'classical', 'electronic', 'dance', 'reggae', 'samba', 'forro',
     'sertanejo', 'mpb', 'pagode', 'funk', 'axé', 'gospel'].includes(tag)
  );
  if (genreTags.length > 0) {
    queryParts.push(...genreTags.slice(0, 2));
  }
  
  // 55% chance to include artist if present
  if (metadata.artist && Math.random() < 0.55) {
    queryParts.unshift(metadata.artist); // put artist at the start
  }
  
  // Add "ao vivo" or "acustico" if present in tags
  if (metadata.tags.includes('ao vivo')) {
    queryParts.push('ao vivo');
  } else if (metadata.tags.includes('acustico')) {
    queryParts.push('acustico');
  }
  
  // Build the final query
  return queryParts.join(' ');
}

/**
 * Search for tracks based on a query
 */
export async function searchTracks(
  queue: GuildQueue, 
  query: string, 
  searchEngine: SearchQueryType = QueryType.YOUTUBE_SEARCH,
  requestedBy?: User
): Promise<Track[]> {
  try {
    debugLog({ message: `Searching for tracks with query: ${query}` });
    
    // Search for tracks
    const searchResult = await queue.player.search(query, {
      requestedBy: requestedBy || (queue.metadata as { requestedBy?: User }).requestedBy,
      searchEngine
    });
    
    if (!searchResult || !searchResult.tracks.length) {
      debugLog({ message: 'No tracks found' });
      return [];
    }
    
    return searchResult.tracks;
  } catch (error) {
    errorLog({ message: 'Error searching for tracks:', error });
    return [];
  }
}

/**
 * Filter tracks to remove duplicates
 */
export function filterDuplicateTracks(
  tracks: Track[], 
  guildId: string, 
  currentTrackIds: Set<string>
): Track[] {
  try {
    debugLog({ message: `Filtering ${tracks.length} tracks for duplicates` });
    
    // Filter out duplicates
    const filteredTracks = tracks.filter(track => 
      !isDuplicateTrack(track, guildId, currentTrackIds)
    );
    
    debugLog({ message: `Filtered to ${filteredTracks.length} non-duplicate tracks` });
    return filteredTracks;
  } catch (error) {
    errorLog({ message: 'Error filtering duplicate tracks:', error });
    return [];
  }
}

/**
 * Sort tracks by view count
 */
export function sortTracksByViews(tracks: Track[]): Track[] {
  try {
    debugLog({ message: `Sorting ${tracks.length} tracks by view count` });
    
    // Sort by view count (if available)
    return tracks.sort((a, b) => {
      const aViews = a.views || 0;
      const bViews = b.views || 0;
      return bViews - aViews;
    });
  } catch (error) {
    errorLog({ message: 'Error sorting tracks by views:', error });
    return tracks;
  }
}

/**
 * Search for related tracks based on metadata
 */
export async function searchRelatedTracks(
  queue: GuildQueue,
  trackId: string,
  requestedBy?: any
): Promise<Track[]> {
  try {
    // Get track metadata
    const metadata = getArtistInfo(trackId);
    if (!metadata) {
      debugLog({ message: 'No metadata found for track' });
      return [];
    }
    
    debugLog({ message: 'Searching for related tracks', data: { metadata } });
    
    // Build search query from metadata
    const searchQuery = buildRelatedQuery(metadata);
    
    // Search for related tracks
    const searchResult = await queue.player.search(
      searchQuery,
      {
        requestedBy: requestedBy || (queue.metadata as any).requestedBy,
        searchEngine: QueryType.YOUTUBE_SEARCH
      }
    );
    
    if (!searchResult || !searchResult.tracks.length) {
      debugLog({ message: 'No related tracks found' });
      return [];
    }
    
    // Sort tracks by relevance and views
    const sortedTracks = searchResult.tracks.sort((a, b) => {
      const aMetadata = getArtistInfo(a.id);
      const bMetadata = getArtistInfo(b.id);
      
      // Prioritize tracks with same tags
      const aCommonTags = aMetadata?.tags.filter(tag => metadata.tags.includes(tag)).length || 0;
      const bCommonTags = bMetadata?.tags.filter(tag => metadata.tags.includes(tag)).length || 0;
      
      if (aCommonTags !== bCommonTags) {
        return bCommonTags - aCommonTags;
      }
      
      // If same number of common tags, sort by views
      return (b.views || 0) - (a.views || 0);
    });

    // Filter out tracks that match any YouTube or Spotify variant pattern in the title
    const filteredTracks = sortedTracks.filter(track => {
      const title = track.title.toLowerCase();
      // Exclude if matches any YouTube or Spotify variant pattern
      const isVariant = youtubePatterns.some(pattern => pattern.test(title)) ||
                        spotifyPatterns.some(pattern => pattern.test(title));
      return !isVariant;
    });

    return filteredTracks;
  } catch (error) {
    errorLog({ message: 'Error searching for related tracks:', error });
    return [];
  }
}

/**
 * Get current track IDs from a queue
 */
export function getCurrentTrackIds(queue: GuildQueue): Set<string> {
  const currentTrackIds = new Set<string>();
  
  // Add current track ID
  if (queue.currentTrack?.id) {
    currentTrackIds.add(queue.currentTrack.id);
  }
  
  // Add IDs of tracks in the queue
  const queueTracks = queue.tracks.toArray();
  queueTracks.forEach(track => {
    if (track.id) {
      currentTrackIds.add(track.id);
    }
  });
  
  return currentTrackIds;
} 