import { Player } from "discord-player";
import { CustomClient } from '../types/index';
import { errorLog, infoLog, debugLog } from '../utils/log';
import { GuildQueue } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import { constants } from '../config/config';

interface CreatePlayerParams {
  client: CustomClient;
}

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
      connectionTimeout: 60000, // Increased timeout
      skipFFmpeg: false
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
    
    // Add error event handlers to the player
    player.events.on('error', (queue: GuildQueue, error: Error) => {
      errorLog({ message: `Player error in queue ${queue.guild.name}:`, error });
      // Try to recover from errors
      if (queue && queue.isPlaying()) {
        try {
          queue.node.pause();
          setTimeout(() => {
            queue.node.resume();
          }, 1000);
        } catch (error) {
          errorLog({ message: 'Failed to recover from player error:', error });
        }
      }
    });
    
    // Add debug event handlers
    player.events.on('debug', (queue: GuildQueue, message: string) => {
      debugLog({ message: `Player debug from ${queue.guild.name}: ${message}` });
    });
    
    // Add connection error handler
    player.events.on('playerError', (queue: GuildQueue, error: Error) => {
      errorLog({ message: `Connection error in queue ${queue.guild.name}:`, error });
      // Try to recover from connection errors
      if (queue && queue.connection) {
        try {
          queue.connection.rejoin();
        } catch (error) {
          errorLog({ message: 'Failed to recover from connection error:', error });
        }
      }
    });
    
    // Add track start event handler
    player.events.on('playerStart', (queue: GuildQueue, track) => {
      infoLog({ message: `Started playing "${track.title}" in ${queue.guild.name}` });
      // Ensure volume is set correctly
      if (queue.node.volume !== constants.VOLUME) {
        queue.node.setVolume(constants.VOLUME);
      }
    });
    
    // Add track end event handler
    player.events.on('playerFinish', (queue: GuildQueue, track) => {
      infoLog({ message: `Finished playing "${track.title}" in ${queue.guild.name}` });
    });
    
    // Add track skip event handler
    player.events.on('playerSkip', (queue: GuildQueue, track) => {
      infoLog({ message: `Skipped "${track.title}" in ${queue.guild.name}` });
    });
    
    // Add queue end event handler
    player.events.on('emptyQueue', (queue: GuildQueue) => {
      infoLog({ message: `Queue is empty in ${queue.guild.name}` });
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
    // Return a minimal player to prevent null reference errors
    return {} as Player;
  }
};