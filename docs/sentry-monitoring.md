# Sentry monitoring

Lucky already initializes Sentry from the shared monitoring layer, and the bot now passes bot-specific identity so issues are easier to group.

Required environment variable:

- `SENTRY_DSN`: project DSN from Sentry project settings

Optional environment variables:

- `SENTRY_ENABLED`: set to `false` to disable Sentry even outside development
- `SENTRY_ENVIRONMENT`: overrides the environment reported to Sentry
- `SENTRY_RELEASE`: release or commit identifier for deploy tracking
- `SENTRY_SERVER_NAME`: hostname or instance name shown in Sentry
- `SENTRY_APP_NAME`: top-level app tag, defaults to the caller-provided app name when set
- `SENTRY_SERVICE_NAME`: service tag, useful when backend and bot share the same org/project
- `SENTRY_TRACES_SAMPLE_RATE`: override performance trace sampling
- `SENTRY_PROFILES_SAMPLE_RATE`: override profile sampling

Docker and host wiring:

- `docker-compose.yml` forwards the supported `SENTRY_*` variables into the production `bot` and `backend` containers.
- `docker-compose.dev.yml` forwards the same variables for local parity, but now defaults `SENTRY_ENABLED=false` so local runs do not imply Sentry is active.
- On the homelab host, add the variables to `/home/luk-server/Lucky/.env` alongside the other compose secrets before restarting the bot.

Example:

```env
SENTRY_DSN=...
SENTRY_ENABLED=true
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=lucky-bot@<git-sha>
SENTRY_SERVER_NAME=<host-name>
SENTRY_APP_NAME=lucky
SENTRY_SERVICE_NAME=bot
```

Behavior:

- **Development**: no events are sent
- `isSentryEnabled()` short-circuits when `NODE_ENV === 'development'`, so simply forwarding `SENTRY_*` variables into the dev compose stack does not enable local event delivery by itself
- **Production/staging**: errors, breadcrumbs, and configured performance telemetry are sent when `SENTRY_DSN` is configured
- **Fatal shutdowns**: Lucky now flushes pending Sentry events before process exit on startup failures and shared fatal error handlers

Bot-specific tags:

- `app: lucky`
- `service: bot`
- `runtime: discord-bot`

One-time verification:

```bash
npm run sentry:test --workspace=packages/bot
```

For the production container after deploy, use the built script instead:

```bash
docker-compose exec bot npm run sentry:test:dist --workspace=packages/bot
```

The script emits a warning-level message with `trigger=manual-sentry-test` and waits for Sentry to flush before exiting. Use it once to confirm the project wiring, then rotate the DSN if it was exposed in screenshots, logs, or shell history.

Dashboard: https://sentry.io/organizations/your-org/projects/

For SDK usage and configuration, see [Sentry Node.js docs](https://docs.sentry.io/platforms/node/).
