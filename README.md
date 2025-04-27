# LukBot - Discord Music Bot

A modern Discord bot built with TypeScript that plays music from YouTube and Spotify, and can download YouTube videos.

## Features

- 🎵 Play music from YouTube and Spotify
- 🔍 Search and play music by name
- ⏭️ Skip, stop, and manage the music queue
- 📥 Download YouTube videos (video/audio)
- 🎮 Slash commands for easy interaction

## Prerequisites

- Node.js 16.x or higher
- FFmpeg installed on your system
- A Discord Bot Token
- (Optional) Spotify API credentials

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/lukbot.git
cd lukbot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example` and fill in your credentials:
```env
TOKEN=your_discord_bot_token_here
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
```

4. Build the TypeScript code:
```bash
npm run build
```

5. Start the bot:
```bash
npm start
```

## Commands

- `/play <query>` - Play a song from YouTube or Spotify
- `/skip` - Skip the current song
- `/stop` - Stop playing and clear the queue
- `/queue` - Show the current music queue
- `/download <url> <format>` - Download a YouTube video (video/audio)

## Development

To run the bot in development mode with hot reloading:
```bash
npm run dev
```

## License

ISC
