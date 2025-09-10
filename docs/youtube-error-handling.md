# YouTube.js Parser Error Handling

This document describes the comprehensive solution implemented to handle YouTube.js parser errors in the LukBot Discord music bot.

## Problem

The bot was experiencing frequent errors due to YouTube.js parser issues:

- `InnertubeError: CompositeVideoPrimaryInfo not found!`
- `InnertubeError: HypePointsFactoid not found!`
- `ParsingError: Type mismatch, got HypePointsFactoid expected Factoid | ViewCountFactoid | UploadTimeFactoid.`

These errors occur when YouTube updates their internal API structure and the YouTube.js library hasn't been updated to handle the new components yet.

## Solution Overview

The solution implements a multi-layered approach to handle these errors gracefully:

1. **Enhanced Error Detection**: Automatically identifies YouTube parser errors
2. **Fallback Search Engines**: Uses alternative search engines when YouTube fails
3. **Retry Mechanisms**: Implements intelligent retry logic with delays
4. **User-Friendly Messages**: Provides clear error messages to users
5. **Configurable Settings**: Centralized configuration for easy maintenance

## Implementation Details

### 1. YouTube Error Handler (`src/utils/music/youtubeErrorHandler.ts`)

Core error analysis and handling logic:

- **`analyzeYouTubeError()`**: Identifies the type of YouTube error
- **`createYouTubeErrorMessage()`**: Generates user-friendly error messages
- **`logYouTubeError()`**: Logs errors with appropriate detail level
- **`isRecoverableYouTubeError()`**: Determines if an error is worth retrying

### 2. Enhanced Search (`src/utils/music/enhancedSearch.ts`)

Robust search functionality with fallback mechanisms:

- **`enhancedSearch()`**: Main search function with retry and fallback logic
- **`enhancedYouTubeSearch()`**: YouTube-specific search with error handling
- **`enhancedAutoSearch()`**: Auto-detection search with fallbacks

### 3. Configuration (`src/config/youtubeConfig.ts`)

Centralized configuration for all YouTube error handling:

```typescript
export const youtubeConfig = {
    errorHandling: {
        maxRetries: 3,
        retryDelay: 1000,
        enableFallbacks: true,
        skipOnParserError: true,
        logParserErrorsAsWarnings: true,
    },
    fallbackEngines: [
        QueryType.AUTO,
        QueryType.YOUTUBE_SEARCH,
        QueryType.SOUNDCLOUD_SEARCH,
        QueryType.SPOTIFY_SONG,
        QueryType.APPLE_MUSIC_SONG,
    ],
    // ... more configuration
}
```

### 4. Updated Player Handler (`src/handlers/playerHandler.ts`)

Enhanced player configuration and error handling:

- **Parser Error Detection**: Automatically detects and handles YouTube parser errors
- **Improved Debug Filtering**: Filters out common parser warnings to reduce noise
- **Enhanced Fallback Options**: Better fallback extractor configuration
- **Configurable Error Handling**: Uses centralized configuration

### 5. Updated Search Utilities

All search functions now use the enhanced search system:

- **`searchContentOnYoutube()`**: Updated to use enhanced search
- **`searchTracks()`**: Enhanced with fallback mechanisms
- **`searchRelatedTracks()`**: Improved error handling

## Error Types Handled

### 1. CompositeVideoPrimaryInfo Error

- **Cause**: YouTube changed their video info structure
- **Response**: Skip track and try fallback engines
- **User Message**: "YouTube está temporariamente indisponível devido a mudanças em sua API. Tente novamente em alguns minutos."

### 2. HypePointsFactoid Error

- **Cause**: YouTube introduced new hype points feature
- **Response**: Skip track and try fallback engines
- **User Message**: "YouTube está temporariamente indisponível devido a mudanças em sua API. Tente novamente em alguns minutos."

### 3. Type Mismatch Error

- **Cause**: YouTube changed expected data types
- **Response**: Retry with different search engines
- **User Message**: "Erro temporário ao processar informações do vídeo. Tente novamente."

## Fallback Strategy

When YouTube search fails, the system tries these engines in order:

1. **QueryType.AUTO** - Automatic engine detection
2. **QueryType.YOUTUBE_SEARCH** - Alternative YouTube search
3. **QueryType.SOUNDCLOUD_SEARCH** - SoundCloud as fallback
4. **QueryType.SPOTIFY_SONG** - Spotify as fallback
5. **QueryType.APPLE_MUSIC_SONG** - Apple Music as fallback

## Configuration Options

### Error Handling Settings

- `maxRetries`: Maximum number of retry attempts (default: 3)
- `retryDelay`: Delay between retries in milliseconds (default: 1000)
- `enableFallbacks`: Whether to use fallback search engines (default: true)
- `skipOnParserError`: Whether to skip tracks on parser errors (default: true)
- `logParserErrorsAsWarnings`: Log parser errors as warnings instead of errors (default: true)

### Player Configuration

- `connectionTimeout`: Connection timeout for YouTube operations (default: 120000ms)
- `downloadRetries`: Number of download retries (default: 3)
- `maxExtractors`: Maximum number of extractors for fallback (default: 5)

## Usage Examples

### Basic Search with Error Handling

```typescript
import { enhancedYouTubeSearch } from "../utils/music/enhancedSearch"

const result = await enhancedYouTubeSearch(
    player,
    "search query",
    user,
    false, // isPlaylist
)

if (result.success) {
    // Use result.result.tracks
} else {
    // Handle error with result.error
}
```

### Error Analysis

```typescript
import { analyzeYouTubeError } from "../utils/music/youtubeErrorHandler"

const errorInfo = analyzeYouTubeError(error)
if (errorInfo.isParserError) {
    // Handle YouTube parser error
}
```

## Testing

A test function is available to verify error handling:

```typescript
import { testYouTubeErrorHandling } from "../utils/music/testYouTubeErrorHandling"

testYouTubeErrorHandling()
```

## Dependencies Updated

- **youtubei.js**: Updated from 14.0.0 to 15.0.1
- **discord-player-youtubei**: Already at latest version 1.5.0

## Benefits

1. **Improved Reliability**: Bot continues working even when YouTube changes their API
2. **Better User Experience**: Clear error messages instead of technical errors
3. **Automatic Recovery**: Intelligent retry and fallback mechanisms
4. **Reduced Noise**: Filtered debug messages for cleaner logs
5. **Configurable**: Easy to adjust settings without code changes
6. **Maintainable**: Centralized configuration and clear separation of concerns

## Monitoring

The system logs YouTube parser errors with appropriate detail levels:

- **Warnings**: For recoverable parser errors (configurable)
- **Errors**: For non-recoverable errors
- **Debug**: For detailed error information and recovery attempts

## Future Improvements

1. **Automatic Parser Updates**: Could implement automatic parser updates when available
2. **Error Metrics**: Track error rates and types for monitoring
3. **Dynamic Configuration**: Allow runtime configuration changes
4. **Enhanced Fallbacks**: Add more fallback search engines as needed

## Troubleshooting

### Common Issues

1. **Still getting parser errors**: Check if youtubei.js needs updating
2. **Fallbacks not working**: Verify fallback engines are properly configured
3. **Too many retries**: Adjust `maxRetries` in configuration
4. **Slow responses**: Increase `retryDelay` or reduce `maxRetries`

### Debug Mode

Enable debug logging to see detailed error handling information:

```typescript
// In player configuration
debug: {
    enabled: true,
    filter: (message: string) => {
        return !youtubeConfig.debugFilterPatterns.some(pattern => message.includes(pattern))
    },
}
```

This solution provides a robust, maintainable approach to handling YouTube.js parser errors while maintaining a good user experience.
