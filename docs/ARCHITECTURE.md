# LukBot Architecture

## Overview

LukBot is structured as a modular monolith with clear separation of concerns across multiple packages.

## Package Structure

```
packages/
├── shared/      # Shared code (config, services, utils, types)
├── bot/         # Discord bot application
├── backend/     # Express API server
└── frontend/    # React web application
```

## Package Dependencies

- **shared**: No dependencies on other packages (base package)
- **bot**: Depends on `@lukbot/shared`
- **backend**: Depends on `@lukbot/shared`
- **frontend**: Independent (React application)

## Communication

- **Bot ↔ Backend**: HTTP API calls (when needed)
- **Frontend ↔ Backend**: HTTP API via Nginx proxy
- **All ↔ Database/Redis**: Direct access via shared services

## Nginx Routing

Nginx acts as a reverse proxy:
- `/api/*` → Backend service (port 3000)
- `/*` → Frontend service (port 80)

## Docker Services

- **postgres**: PostgreSQL database
- **redis**: Redis cache
- **bot**: Discord bot container
- **backend**: Express API container
- **frontend**: React app container (Nginx)
- **nginx**: Reverse proxy container

## Development

Each package can be developed independently:
- `npm run dev:bot` - Start bot in watch mode
- `npm run dev:backend` - Start backend in watch mode
- `npm run dev:frontend` - Start frontend dev server

## Building

Build all packages:
```bash
npm run build
```

Build individual packages:
```bash
npm run build:shared
npm run build:bot
npm run build:backend
npm run build:frontend
```
