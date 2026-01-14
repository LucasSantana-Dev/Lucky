# Web Application Setup Guide

This document describes the Discord OAuth web interface for managing bot features.

## Overview

The web application provides a modern React-based interface for:
- Authenticating with Discord OAuth2
- Viewing servers where you are an administrator
- Adding the bot to servers
- Managing feature toggles (both global and per-server)

## Architecture

### Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express.js with TypeScript
- **State Management**: Zustand
- **Styling**: Tailwind CSS with custom dark mode palette
- **HTTP Client**: Axios
- **Session Management**: Redis (via express-session)

### Project Structure

```
src/webapp/
├── server.ts              # Express server
├── middleware/            # Express middleware
│   ├── session.ts        # Session management
│   └── auth.ts           # Authentication middleware
├── routes/               # API routes
│   ├── auth.ts          # OAuth routes
│   ├── guilds.ts        # Guild management
│   └── toggles.ts       # Feature toggle routes
├── services/            # Business logic
│   ├── DiscordOAuthService.ts
│   ├── GuildService.ts
│   └── SessionService.ts
└── frontend/            # React application
    ├── src/
    │   ├── components/   # React components
    │   ├── pages/       # Page components
    │   ├── stores/      # Zustand stores
    │   ├── services/    # API client
    │   └── types/       # TypeScript types
    └── package.json
```

## Environment Variables

Add these to your `.env` file:

```env
# Discord OAuth
CLIENT_ID=your_discord_client_id
CLIENT_SECRET=your_discord_client_secret
WEBAPP_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Web Application
WEBAPP_ENABLED=true
WEBAPP_PORT=3000
WEBAPP_SESSION_SECRET=your_random_session_secret_here

# Developer Access
DEVELOPER_USER_IDS=user_id_1,user_id_2
```

## Development Setup

### Prerequisites

- Node.js 22.x
- Redis (for session storage)
- Discord OAuth2 application configured

### Running the Frontend

```bash
cd src/webapp/frontend
npm install
npm run dev
```

The frontend will run on `http://localhost:5173` with API proxying to `http://localhost:3000`.

### Running the Backend

The web application backend starts automatically when `WEBAPP_ENABLED=true` is set in your `.env` file.

```bash
npm run dev
```

The backend API will be available at `http://localhost:3000`.

## Feature Toggle System

The web interface supports two types of feature toggles:

### Global Developer Toggles

- System-wide toggles that affect all servers
- Only visible/editable by developers (users in `DEVELOPER_USER_IDS`)
- API endpoints: `/api/toggles/global`

### Per-Server Toggles

- Server-specific feature toggles
- Visible/editable by server administrators
- API endpoints: `/api/guilds/:id/features`

## API Endpoints

### Authentication

- `GET /api/auth/discord` - Initiate Discord OAuth flow
- `GET /api/auth/callback` - OAuth callback handler
- `GET /api/auth/logout` - Logout user
- `GET /api/auth/status` - Check authentication status
- `GET /api/auth/user` - Get current user info

### Guilds

- `GET /api/guilds` - List user's admin guilds with bot status
- `GET /api/guilds/:id` - Get specific guild details
- `GET /api/guilds/:id/invite` - Generate bot invite URL

### Feature Toggles

**Global (Developer Only):**
- `GET /api/toggles/global` - List all global toggles
- `GET /api/toggles/global/:name` - Get specific global toggle
- `POST /api/toggles/global/:name` - Update global toggle

**Per-Server:**
- `GET /api/features` - List all available features
- `GET /api/guilds/:id/features` - Get guild-specific toggles
- `POST /api/guilds/:id/features/:name` - Update per-server toggle

## Building for Production

### Frontend

```bash
cd src/webapp/frontend
npm run build
```

The built files will be in `src/webapp/frontend/dist/`.

### Backend

The Express server automatically serves the built frontend in production mode (`NODE_ENV=production`).

## Docker Setup

The frontend can be run in Docker for development:

```bash
cd src/webapp/frontend
docker build -f Dockerfile.dev -t lukbot-frontend-dev .
docker run -p 5173:5173 lukbot-frontend-dev
```

## Troubleshooting

### Session Issues

If sessions aren't persisting, check:
- Redis is running and accessible
- `WEBAPP_SESSION_SECRET` is set
- Cookie settings match your domain

### OAuth Issues

If OAuth isn't working:
- Verify `CLIENT_ID` and `CLIENT_SECRET` are correct
- Check `WEBAPP_REDIRECT_URI` matches Discord OAuth settings
- Ensure redirect URI is whitelisted in Discord Developer Portal

### CORS Issues

The frontend proxy handles CORS automatically in development. In production, ensure:
- Frontend and backend are on the same domain, or
- CORS is properly configured in Express

## Security Considerations

- Always use HTTPS in production
- Keep `WEBAPP_SESSION_SECRET` secure and random
- Regularly rotate session secrets
- Limit `DEVELOPER_USER_IDS` to trusted users only
- Validate all user permissions on the backend
