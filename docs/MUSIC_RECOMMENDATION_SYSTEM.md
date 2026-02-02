# Music recommendation system

Autoplay feature that suggests similar tracks using metadata (genre, tags, artist, duration), listening history, similarity scoring, and diversity filtering.

## Features

- Multi-factor similarity (vector, genre, tag, artist, duration)
- Per-guild config and presets (balanced, genre-focused, artist-focused, diverse, similar)
- Discord commands: `/recommendation show`, `/recommendation update`, `/recommendation preset`, `/recommendation reset`
- Integration with autoplay and track history; settings and stats in Redis

## Architecture

- **MusicRecommendationService** – recommendation engine
- **RecommendationConfigService** – config and presets
- **AutoplayManager** – autoplay integration

Enable with `MUSIC_RECOMMENDATIONS=true`. Tune via `/recommendation update` or presets.

## Related

- [LASTFM_SETUP.md](LASTFM_SETUP.md) – scrobbling and now-playing; using Last.fm data for recommendations is a future enhancement.
