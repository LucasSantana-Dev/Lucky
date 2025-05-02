# LukBot - Discord Music Bot

A modern Discord bot built with TypeScript that plays music from YouTube and Spotify, and can download YouTube videos.

## Up status

[![CI/CD Pipeline](https://github.com/LukSantana/LukBot/actions/workflows/deploy.yml/badge.svg)](https://github.com/LukSantana/LukBot/actions/workflows/deploy.yml)

## Features

- 🎵 Play music from YouTube and Spotify
- 🔍 Search and play music by name
- ⏭️ Skip, stop, and manage the music queue
- 📥 Download YouTube videos (video/audio)
- 🎮 Slash commands for easy interaction
- 🔄 Hot reloading for development
- 📝 TypeScript support with strict type checking
- 🧹 ESLint and Prettier for code quality

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
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=discord_client_id
TOKEN=your_token_here
COMMAND_CATEGORIES_DISABLED=disabled_commands_categories
```

## Available Scripts

- `npm run build` - Build the TypeScript code
- `npm start` - Start the bot in production mode
- `npm run dev` - Start the bot in development mode
- `npm run dev:watch` - Start the bot with hot reloading
- `npm run lint` - Run ESLint to check code quality
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run type:check` - Run TypeScript type checking

## Project Structure

```
src/
├── config/     # Configuration files
├── events/     # Discord event handlers
├── functions/  # Utility functions
├── handlers/   # Command and event handlers
├── models/     # Data models and interfaces
├── types/      # TypeScript type definitions
├── utils/      # Helper utilities
├── index.ts    # Main entry point
└── register.ts # Command registration
```

## Development

The project uses:
- TypeScript for type safety
- ESLint and Prettier for code formatting
- Module aliases for clean imports
- Hot reloading for faster development

To start development:
```bash
npm run dev:watch
```

## License

ISC
