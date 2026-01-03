# Music Recommendation System

## Overview

The LukBot Music Recommendation System is an intelligent autoplay feature that uses advanced algorithms to suggest similar songs based on:

- **Audio metadata analysis** (genre, tags, artist, duration)
- **User listening history** and preferences
- **Similarity scoring** using multiple algorithms
- **Diversity filtering** to avoid repetitive recommendations

## Features

### 🎯 Intelligent Recommendations

- **Multi-factor similarity scoring** combining genre, tags, artist, and duration
- **Personalized recommendations** based on user listening history
- **Diversity filtering** to ensure varied music selection
- **Configurable weights** for different similarity factors

### 🧠 Learning Capabilities

- **User preference analysis** from listening history
- **Adaptive recommendations** that improve over time
- **Genre relationship mapping** for better cross-genre suggestions
- **Popularity weighting** based on track views and plays

### ⚙️ Configuration Options

- **Per-guild settings** for customized recommendation behavior
- **Preset configurations** for different music styles
- **Real-time configuration** via Discord commands
- **Statistics tracking** for recommendation performance

## Architecture

### Core Components

1. **MusicRecommendationService** - Main recommendation engine
2. **RecommendationConfigService** - Configuration management
3. **AutoplayManager** - Integration with existing autoplay system
4. **Discord Commands** - User interface for configuration

### Recommendation Algorithm

The system uses a hybrid approach combining multiple similarity metrics:

```typescript
// Similarity Score Calculation
const score =
    vectorSimilarity * 0.3 +
    genreSimilarity * genreWeight +
    tagSimilarity * tagWeight +
    artistSimilarity * artistWeight +
    durationSimilarity * durationWeight
```

#### Similarity Factors

1. **Vector Similarity (30%)** - Cosine similarity of feature vectors
2. **Genre Similarity (40%)** - Genre matching with relationship mapping
3. **Tag Similarity (30%)** - Mood and style tag matching
4. **Artist Similarity (20%)** - Artist name similarity using Levenshtein distance
5. **Duration Similarity (5%)** - Track length similarity

## Usage

### Discord Commands

#### View Current Settings

```
/recommendation show
```

Shows current recommendation settings and statistics.

#### Update Settings

```
/recommendation update [options]
```

Available options:

- `enabled` - Enable/disable recommendations
- `max-recommendations` - Maximum recommendations per session (1-20)
- `similarity-threshold` - Minimum similarity score (0-100%)
- `genre-weight` - Genre importance (0-100%)
- `tag-weight` - Tag importance (0-100%)
- `artist-weight` - Artist importance (0-100%)
- `learning` - Enable learning from history

#### Apply Preset

```
/recommendation preset <preset-name>
```

Available presets:

- `balanced` - Balanced similarity across all factors
- `genre-focused` - Emphasizes genre matching
- `artist-focused` - Emphasizes artist similarity
- `diverse` - Maximizes diversity in recommendations
- `similar` - Focuses on highly similar tracks

#### Reset Settings

```
/recommendation reset
```

Resets all settings to default values.

### Programmatic Usage

#### Basic Recommendation

```typescript
import { MusicRecommendationService } from './services/MusicRecommendationService'

const recommendationService = new MusicRecommendationService({
    maxRecommendations: 10,
    similarityThreshold: 0.4,
    genreWeight: 0.4,
    tagWeight: 0.3,
    artistWeight: 0.2,
})

// Get recommendations based on a seed track
const recommendations = await recommendationService.getRecommendations(
    seedTrack,
    availableTracks,
    excludeIds,
)
```

#### Personalized Recommendations

```typescript
// Get recommendations based on user's listening history
const personalizedRecs =
    await recommendationService.getPersonalizedRecommendations(
        guildId,
        availableTracks,
        limit,
    )
```

## Configuration

### Default Settings

```typescript
{
    enabled: true,
    maxRecommendations: 8,
    similarityThreshold: 0.4,
    genreWeight: 0.4,
    tagWeight: 0.3,
    artistWeight: 0.2,
    durationWeight: 0.05,
    popularityWeight: 0.05,
    diversityFactor: 0.1,
    learningEnabled: true,
    historyWeight: 0.3
}
```

### Preset Configurations

#### Balanced (Default)

- Similarity threshold: 40%
- Genre weight: 40%
- Tag weight: 30%
- Artist weight: 20%
- Diversity factor: 10%

#### Genre-focused

- Similarity threshold: 50%
- Genre weight: 60%
- Tag weight: 20%
- Artist weight: 10%
- Diversity factor: 5%

#### Artist-focused

- Similarity threshold: 30%
- Genre weight: 20%
- Tag weight: 20%
- Artist weight: 50%
- Diversity factor: 15%

#### Diverse

- Similarity threshold: 20%
- Genre weight: 30%
- Tag weight: 30%
- Artist weight: 20%
- Diversity factor: 30%

#### Similar

- Similarity threshold: 60%
- Genre weight: 50%
- Tag weight: 40%
- Artist weight: 10%
- Diversity factor: 0%

## Integration

### With Existing Autoplay System

The recommendation system integrates seamlessly with the existing autoplay functionality:

```typescript
// In trackManagement/index.ts
export const replenishQueue = async (queue: GuildQueue): Promise<void> => {
    if (
        queue.tracks.size === 0 &&
        queue.repeatMode === QueueRepeatMode.AUTOPLAY
    ) {
        const recommendations = await getAutoplayRecommendations(
            queue,
            availableTracks,
            5,
        )

        for (const track of recommendations) {
            queue.addTrack(track)
        }
    }
}
```

### With Track History

The system learns from user behavior by analyzing track history:

```typescript
// Analyze user preferences
const preferences = this.analyzeUserPreferences(history)

// Create virtual seed track
const virtualSeed = this.createVirtualSeedTrack(preferences)

// Get personalized recommendations
const recommendations = await this.getRecommendations(
    virtualSeed,
    availableTracks,
    excludeIds,
)
```

## Performance Considerations

### Optimization Features

1. **Vector Caching** - Track vectors are cached for faster similarity calculations
2. **Batch Processing** - Multiple recommendations calculated in parallel
3. **Diversity Filtering** - Prevents duplicate recommendations efficiently
4. **Memory Management** - Automatic cleanup of old vectors

### Scalability

- **Guild-specific settings** - Each guild can have different configurations
- **Redis integration** - Settings and statistics stored in Redis
- **Efficient algorithms** - Optimized similarity calculations
- **Configurable limits** - Adjustable recommendation limits per guild

## Monitoring and Statistics

### Available Metrics

- **Autoplay count** - Number of autoplay sessions
- **Recommendation accuracy** - Based on user feedback
- **Diversity score** - Measure of recommendation variety
- **Learning progress** - Improvement over time

### Debugging

Enable debug logging to monitor recommendation generation:

```typescript
debugLog({
    message: 'Generated recommendations',
    data: {
        seedTrack: track.title,
        recommendations: recs.length,
        scores: recs.map((r) => r.score),
    },
})
```

## Future Enhancements

### Planned Features

1. **Audio Feature Extraction** - Integration with Essentia for audio analysis
2. **Machine Learning Models** - Advanced ML-based recommendations
3. **Collaborative Filtering** - User-to-user similarity matching
4. **Real-time Learning** - Dynamic weight adjustment based on feedback
5. **A/B Testing** - Framework for testing different algorithms

### Integration Opportunities

1. **Spotify API** - Enhanced metadata and related artists
2. **Last.fm Integration** - User scrobbling data for better recommendations
3. **YouTube Music API** - Access to official music data
4. **Community Features** - Shared playlists and collaborative recommendations

## Troubleshooting

### Common Issues

1. **No recommendations generated**
    - Check similarity threshold settings
    - Verify available tracks are not empty
    - Ensure autoplay is enabled

2. **Poor recommendation quality**
    - Adjust similarity weights
    - Enable learning from history
    - Try different preset configurations

3. **Performance issues**
    - Reduce max recommendations
    - Increase similarity threshold
    - Check Redis connection

### Debug Commands

```bash
# Check recommendation settings
/recommendation show

# Test with different presets
/recommendation preset balanced

# Reset to defaults
/recommendation reset
```

## Contributing

When extending the recommendation system:

1. **Follow the existing architecture** - Use the established service pattern
2. **Add comprehensive tests** - Ensure new features are tested
3. **Update documentation** - Keep this file current
4. **Consider performance** - Optimize for large track libraries
5. **Maintain compatibility** - Don't break existing functionality

## License

This recommendation system is part of the LukBot project and follows the same licensing terms.
