import { Player, Track, GuildQueue } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import { CustomClient } from '../types/index';
import { errorLog, infoLog, debugLog } from '../utils/log';
import { constants } from '../config/config';
import { QueueRepeatMode } from "discord-player";
import { QueryType } from "discord-player";
import { EmbedBuilder, TextChannel } from 'discord.js';
import { 
  addTrackToHistory, 
  isDuplicateTrack, 
  getArtistInfo, 
  clearHistory 
} from '../utils/duplicateDetection';
import {
  addTrackToQueue,
  addTracksToQueue,
  replenishQueue
} from '../utils/trackManagement';

// Define the metadata interface
interface QueueMetadata {
  channel: TextChannel;
  client: any;
  requestedBy: any;
}

interface CreatePlayerParams {
  client: CustomClient;
}

// Map to store the last played track for each guild
export const lastPlayedTracks = new Map<string, Track>();

// Map to store autoplay counters for each guild
const autoplayCounters = new Map<string, number>();

// Interface for track history entry
interface TrackHistoryEntry {
  url: string;
  title: string;
  author: string;
  thumbnail?: string;
  timestamp: number;
}

// Map to store recently played tracks for each guild (to avoid repeats)
export const recentlyPlayedTracks = new Map<string, TrackHistoryEntry[]>();

// Map to store the current song info message for each guild
const songInfoMessages = new Map<string, { messageId: string, channelId: string }>();

export const createPlayer = ({ client }: CreatePlayerParams): Player => {
  try {
    infoLog({ message: 'Creating player...' });
    
    // Configure player with improved settings for stability
    const player = new Player(client, {
      ytdlOptions: {
        quality: "highestaudio",
        highWaterMark: 1 << 25, // Increased buffer size
        dlChunkSize: 0, // Disable chunking to prevent issues
        requestOptions: {
          headers: {
            // Add user-agent to avoid some YouTube restrictions
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        }
      },
      connectionTimeout: 120000, // Increased timeout to 120 seconds
      skipFFmpeg: false,
      // Add debug options to filter out unnecessary messages
      debug: {
        enabled: true,
        filter: (message: string) => {
          // Filter out the specific YouTube.js logs about command runs
          return !message.includes('Unable to find matching run for command run');
        }
      },
      // Add custom download options
      downloadOptions: {
        // Use a more reliable download method
        useNativeResolver: true,
        // Increase timeout for downloads
        timeout: 30000,
        // Retry failed downloads
        retries: 3,
        // Use a specific download directory
        outputDirectory: './downloads'
      },
      // Add fallback options
      fallbackOptions: {
        // Try multiple extractors if one fails
        useMultipleExtractors: true,
        // Maximum number of extractors to try
        maxExtractors: 3
      }
    } as any); // Use type assertion to bypass TypeScript errors
    
    // Register YouTubei extractor with detailed logging
    try {
      debugLog({ message: 'Attempting to register YouTubei extractor...' });
      player.extractors.register(YoutubeiExtractor, {});
      infoLog({ message: 'Successfully registered YouTubei extractor' });
    } catch (extractorError) {
      errorLog({ message: 'Failed to register YouTubei extractor:', error: extractorError });
      throw extractorError; // Re-throw to be caught by outer try-catch
    }
    
    // Clear any existing event listeners to prevent duplicates
    player.events.removeAllListeners();
    
    // Handle general errors
    player.events.on('error', (queue: GuildQueue, error: Error) => {
      errorLog({ message: `Error in queue ${queue?.guild?.name || 'unknown'}:`, error });
      
      // Only consider it a connection error if it's a specific type of error
      const isConnectionError = 
        error.message.includes('ECONNRESET') || 
        error.message.includes('ECONNREFUSED') || 
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('Connection reset by peer');
      
      if (isConnectionError) {
        debugLog({ message: 'Detected specific connection error, attempting recovery...' });
        if (queue && queue.connection) {
          try {
            // Only attempt to rejoin if we're actually disconnected
            if (queue.connection.state.status !== 'ready') {
              queue.connection.rejoin();
              infoLog({ message: 'Attempting to recover from connection error' });
            } else {
              debugLog({ message: 'Connection appears to be fine, ignoring error' });
            }
          } catch (recoveryError) {
            errorLog({ message: 'Failed to recover from connection error:', error: recoveryError });
          }
        }
      } else {
        debugLog({ message: 'Non-connection error, no recovery needed' });
      }
    });

    // Handle player-specific errors
    player.events.on('playerError', async (queue: GuildQueue, error: Error) => {
      errorLog({ message: `Player error in queue ${queue.guild.name}:`, error });
      
      // Check for stream extraction errors
      const isStreamExtractionError = 
        error.message.includes('Could not extract stream') || 
        error.message.includes('Streaming data not available') ||
        error.message.includes('chooseFormat');
      
      if (isStreamExtractionError) {
        debugLog({ message: 'Detected stream extraction error, attempting recovery...' });
        
        try {
          // Get the current track
          const currentTrack = queue.currentTrack;
          
          if (currentTrack) {
            // Log the problematic URL
            debugLog({ message: `Problematic URL: ${currentTrack.url}` });
            
            // Try to search for the track again with a different search engine
            debugLog({ message: 'Attempting to re-fetch track with alternative search engine...' });
            
            // Try with a different search engine
            const searchResult = await queue.player.search(currentTrack.title, {
              requestedBy: currentTrack.requestedBy || (queue.metadata as QueueMetadata).requestedBy,
              searchEngine: QueryType.YOUTUBE_SEARCH
            });
            
            if (searchResult && searchResult.tracks.length > 0) {
              // Find a track that's not the same as the current one (to avoid the same problematic track)
              const alternativeTrack = searchResult.tracks.find(track => track.url !== currentTrack.url);
              
              if (alternativeTrack) {
                // Remove the current track
                queue.removeTrack(0);
                
                // Add the alternative track
                addTrackToQueue(queue, alternativeTrack);
                
                // Try to play the new track
                if (!queue.node.isPlaying()) {
                  await queue.node.play();
                  debugLog({ message: 'Successfully recovered from stream extraction error' });
                }
              } else {
                debugLog({ message: 'Could not find alternative track, skipping...' });
                queue.node.skip();
              }
            } else {
              debugLog({ message: 'Could not find alternative track, skipping...' });
              queue.node.skip();
            }
          } else {
            debugLog({ message: 'No current track, skipping...' });
            queue.node.skip();
          }
        } catch (recoveryError) {
          errorLog({ message: 'Failed to recover from stream extraction error:', error: recoveryError });
          // If all recovery attempts fail, skip to the next track
          queue.node.skip();
        }
      }
      // Handle download and streaming errors
      const isDownloadError = 
        error.message.includes('Invalid URL') || 
        error.message.includes('No data received') ||
        error.message.includes('download failed') ||
        error.message.includes('stream failed');
      
      if (isDownloadError) {
        debugLog({ message: 'Detected download/stream error, attempting recovery...' });
        
        try {
          // Get the current track
          const currentTrack = queue.currentTrack;
          
          if (currentTrack) {
            // Log the problematic URL
            debugLog({ message: `Problematic URL: ${currentTrack.url}` });
            
            // Try to search for the track again
            debugLog({ message: 'Attempting to re-fetch track information...' });
            
            const searchResult = await queue.player.search(currentTrack.url, {
              requestedBy: currentTrack.requestedBy || (queue.metadata as QueueMetadata).requestedBy,
              searchEngine: QueryType.YOUTUBE_SEARCH
            });
            
            if (searchResult && searchResult.tracks.length > 0) {
              // Remove the current track
              queue.removeTrack(0);
              
              // Add the new track
              addTrackToQueue(queue, searchResult.tracks[0]);
              
              // Try to play the new track
              if (!queue.node.isPlaying()) {
                await queue.node.play();
                debugLog({ message: 'Successfully recovered from download error' });
              }
            } else {
              debugLog({ message: 'Could not find alternative track, skipping...' });
              queue.node.skip();
            }
          } else {
            debugLog({ message: 'No current track, skipping...' });
            queue.node.skip();
          }
        } catch (recoveryError) {
          errorLog({ message: 'Failed to recover from download error:', error: recoveryError });
          // If all recovery attempts fail, skip to the next track
          queue.node.skip();
        }
      } else {
        // Handle other player errors
        const isStreamError = 
          error.message.includes('stream') || 
          error.message.includes('FFmpeg');
        
        if (isStreamError) {
          debugLog({ message: 'Detected stream error, attempting recovery...' });
          try {
            // Check if we're actually playing before trying to recover
            if (queue.node.isPlaying()) {
              queue.node.pause();
              
              // Wait a bit before trying to resume
              await new Promise(resolve => setTimeout(resolve, 5000));
              
              // Try to resume playback
              if (!queue.node.isPlaying()) {
                await queue.node.resume();
                debugLog({ message: 'Successfully resumed playback after stream error' });
              }
              
              // If still not playing, try to replay the current track
              if (!queue.node.isPlaying() && queue.currentTrack) {
                debugLog({ message: 'Attempting to replay current track...' });
                await queue.node.play();
              }
            } else {
              debugLog({ message: 'Not currently playing, no recovery needed' });
            }
          } catch (recoveryError) {
            errorLog({ message: 'Failed to recover from player error:', error: recoveryError });
          }
        } else {
          debugLog({ message: 'Non-stream error, no recovery needed' });
        }
      }
    });
    
    // Add debug event handlers
    player.events.on('debug', (queue: GuildQueue, message: string) => {
      debugLog({ message: `Player debug from ${queue.guild.name}: ${message}` });
    });
    
    // Add track start event handler
    player.events.on('playerStart', async (queue: GuildQueue, track) => {
      infoLog({ message: `Started playing "${track.title}" in ${queue.guild.name}` });
      
      // Log the download URL for debugging
      debugLog({ message: `Track URL: ${track.url}` });
      
      // Ensure volume is set correctly
      if (queue.node.volume !== constants.VOLUME) {
        queue.node.setVolume(constants.VOLUME);
      }
      
      // Update the message in the channel to show the current track
      try {
        const metadata = queue.metadata as QueueMetadata;
        if (metadata && metadata.channel) {
          const embed = new EmbedBuilder()
            .setColor('#3F51B5')
            .setTitle('🎵 Tocando Agora')
            .setDescription(`**${track.title}** por **${track.author}**`)
            .setTimestamp();
            
            if (track.thumbnail) {
              embed.setThumbnail(track.thumbnail);
            }
            
            // Check if this is an autoplay track
            const isAutoplay = queue.repeatMode === QueueRepeatMode.AUTOPLAY && 
                              autoplayCounters.has(queue.guild.id) && 
                              autoplayCounters.get(queue.guild.id)! > 0;
            
            if (isAutoplay) {
              embed.setFooter({ 
                text: `Autoplay • ${autoplayCounters.get(queue.guild.id)}/${constants.MAX_AUTOPLAY_TRACKS || 50} músicas` 
              });
            }
            
            // Always send a new message
            const message = await metadata.channel.send({ embeds: [embed] });
            
            // Store the message ID and channel ID for reference
            const guildId = queue.guild.id;
            songInfoMessages.set(guildId, {
              messageId: message.id,
              channelId: metadata.channel.id
            });
        }
      } catch (error) {
        errorLog({ message: 'Error sending track message:', error });
      }
    });
    
    // Add playerFinish event handler
    player.events.on('playerFinish', async (queue: GuildQueue) => {
      try {
        // Store the last played track
        if (queue.currentTrack) {
          // Add track to history using the utility function
          addTrackToHistory(queue.currentTrack, queue.guild.id);
        }
        
        // Check and replenish the queue
        await replenishQueue(queue);
      } catch (error) {
        errorLog({ message: 'Error in playerFinish event:', error });
      }
    });
    
    // Add playerSkip event handler
    player.events.on('playerSkip', async (queue: GuildQueue) => {
      try {
        debugLog({ message: 'Track skipped, checking queue...' });
        
        // Add the skipped track to history using the utility function
        if (queue.currentTrack) {
          addTrackToHistory(queue.currentTrack, queue.guild.id);
        }
        
        // Check and replenish the queue
        await replenishQueue(queue);
      } catch (error) {
        errorLog({ message: 'Error in playerSkip event:', error });
      }
    });
    
    // Add track add event handler
    player.events.on('audioTracksAdd', (queue: GuildQueue, tracks) => {
      if (Array.isArray(tracks) && tracks.length > 0) {
        infoLog({ message: `Added "${tracks[0].title}" to queue in ${queue.guild.name}` });
      }
    });
    
    // Add connection create event handler
    player.events.on('connection', (queue: GuildQueue) => {
      infoLog({ message: `Created connection to voice channel in ${queue.guild.name}` });
    });
    
    // Add connection destroy event handler
    player.events.on('connectionDestroyed', (queue: GuildQueue) => {
      infoLog({ message: `Destroyed connection to voice channel in ${queue.guild.name}` });
    });
    
    // Add player empty event handler
    player.events.on('emptyChannel', (queue: GuildQueue) => {
      infoLog({ message: `Channel is empty in ${queue.guild.name}` });
    });
    
    // Add player disconnect event handler
    player.events.on('disconnect', (queue: GuildQueue) => {
      infoLog({ message: `Disconnected from voice channel in ${queue.guild.name}` });
    });
    
    infoLog({ message: 'Player created successfully' });
    return player;
  } catch (error) {
    errorLog({ message: 'Error creating player:', error });
    throw error;
  }
};