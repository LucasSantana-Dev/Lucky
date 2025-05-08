import { EmbedBuilder, ColorResolvable } from 'discord.js';

// Color constants for different types of messages
export const EMBED_COLORS = {
  SUCCESS: '#4CAF50', // Green
  ERROR: '#F44336',   // Red
  INFO: '#2196F3',    // Blue
  WARNING: '#FFC107', // Amber
  NEUTRAL: '#9E9E9E', // Grey
  MUSIC: '#9C27B0',   // Purple
  QUEUE: '#3F51B5',   // Indigo
  AUTOPLAY: '#009688' // Teal
};

// Emoji constants for different types of messages
export const EMOJIS = {
  SUCCESS: '✅',
  ERROR: '❌',
  INFO: 'ℹ️',
  WARNING: '⚠️',
  NEUTRAL: '⚪',
  MUSIC: '🎵',
  AUDIO: '🎧',
  VIDEO: '🎥',
  QUEUE: '📋',
  AUTOPLAY: '🔄',
  PLAY: '▶️',
  PAUSE: '⏸️',
  STOP: '⏹️',
  SKIP: '⏭️',
  VOLUME: '🔊',
  LOOP: '🔁',
  SHUFFLE: '🔀',
  DOWNLOAD: '⬇️',
  EXIT: '🚪'
};

interface CreateEmbedOptions {
  title?: string;
  description?: string;
  color?: ColorResolvable;
  emoji?: string;
  footer?: string;
  thumbnail?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: boolean;
}

/**
 * Creates a consistent embed with the specified options
 */
export function createEmbed(options: CreateEmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder();
  
  // Set color (default to neutral if not specified)
  embed.setColor(options.color || EMBED_COLORS.NEUTRAL as ColorResolvable);
  
  // Set title with emoji if provided
  if (options.title) {
    embed.setTitle(options.emoji ? `${options.emoji} ${options.title}` : options.title);
  }
  
  // Set description
  if (options.description) {
    embed.setDescription(options.description);
  }
  
  // Set thumbnail
  if (options.thumbnail) {
    embed.setThumbnail(options.thumbnail);
  }
  
  // Set fields
  if (options.fields && options.fields.length > 0) {
    embed.addFields(options.fields);
  }
  
  // Set footer
  if (options.footer) {
    embed.setFooter({ text: options.footer });
  }
  
  // Set timestamp
  if (options.timestamp) {
    embed.setTimestamp();
  }
  
  return embed;
}

/**
 * Creates a success embed
 */
export function successEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed({
    title,
    description,
    color: EMBED_COLORS.SUCCESS as ColorResolvable,
    emoji: EMOJIS.SUCCESS
  });
}

/**
 * Creates an error embed
 */
export function errorEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed({
    title,
    description,
    color: EMBED_COLORS.ERROR as ColorResolvable,
    emoji: EMOJIS.ERROR
  });
}

/**
 * Creates an info embed
 */
export function infoEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed({
    title,
    description,
    color: EMBED_COLORS.INFO as ColorResolvable,
    emoji: EMOJIS.INFO
  });
}

/**
 * Creates a warning embed
 */
export function warningEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed({
    title,
    description,
    color: EMBED_COLORS.WARNING as ColorResolvable,
    emoji: EMOJIS.WARNING
  });
}

/**
 * Creates a music embed
 */
export function musicEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed({
    title,
    description,
    color: EMBED_COLORS.MUSIC as ColorResolvable,
    emoji: EMOJIS.MUSIC
  });
}

/**
 * Creates a queue embed
 */
export function queueEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed({
    title,
    description,
    color: EMBED_COLORS.QUEUE as ColorResolvable,
    emoji: EMOJIS.QUEUE
  });
}

/**
 * Creates an autoplay embed
 */
export function autoplayEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed({
    title,
    description,
    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
    emoji: EMOJIS.AUTOPLAY
  });
} 