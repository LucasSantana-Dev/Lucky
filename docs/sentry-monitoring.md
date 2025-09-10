# Sentry Monitoring and Logging Guide

## Overview

This project uses Sentry for centralized logging, error tracking, and performance monitoring. Sentry provides a comprehensive platform for monitoring application health, tracking errors, and analyzing performance metrics.

## Configuration

### Environment Variables

To enable Sentry in your environment, you need to set the following environment variables:

```env
# Required
SENTRY_DSN=your_sentry_dsn_here  # Get this from your Sentry project settings

# Optional but recommended
NODE_ENV=development  # Set to 'production' in production environments
```

### Development Environment Suppression

**Important**: Sentry monitoring is automatically disabled in development environments (`NODE_ENV=development`). This prevents development logs from cluttering your Sentry dashboard and reduces noise during development.

- **Development**: Sentry is completely disabled, no events are sent
- **Production**: Sentry is fully enabled with all monitoring features
- **Other environments**: Sentry is enabled (you can set `NODE_ENV` to any other value to enable Sentry)

### Sentry Dashboard

After setting up the environment variables, you can access your Sentry dashboard at:

```
https://sentry.io/organizations/your-org/projects/
```

Replace `your-org` with your organization name in Sentry.

## Features

### Error Tracking

All errors and exceptions are automatically captured and sent to Sentry with contextual information, including:

- Error stack traces
- User information (when available)
- Guild/server information (when available)
- Command context (for command-related errors)

### Performance Monitoring

The application includes performance monitoring for:

- Command execution times
- API request durations
- Function performance
- Overall application performance

### Logging Levels

The application uses the following logging levels, all of which integrate with Sentry:

- **ERROR** (Level 0): Critical errors that affect functionality
- **WARN** (Level 1): Warnings that don't stop functionality but indicate issues
- **INFO** (Level 2): Informational messages about normal operation
- **SUCCESS** (Level 3): Success messages for completed operations
- **DEBUG** (Level 4): Detailed debug information

**Note**: All Sentry integration is automatically disabled in development environments (`NODE_ENV=development`).

## Usage

### Basic Logging

Use the logging functions from `src/utils/general/log.ts`:

```typescript
import {
    errorLog,
    warnLog,
    infoLog,
    successLog,
    debugLog,
} from "../utils/general/log"

// Log an error with optional error object and data
errorLog({
    message: "Failed to process command",
    error: new Error("Invalid input"),
    data: { commandName: "play" },
})

// Log a warning
warnLog({ message: "Rate limit approaching", data: { remaining: 5 } })

// Log info
infoLog({ message: "Command executed successfully" })

// Log success
successLog({ message: "Music playback started" })

// Log debug information
debugLog({ message: "Processing options", data: { options } })
```

### Performance Monitoring

Use the utility functions from `src/utils/monitoring` to monitor performance:

```typescript
import {
    withSentryMonitoring,
    createSpan,
    setUserContext,
    addBreadcrumb,
} from "../utils/monitoring"

// Monitor a function's performance
await withSentryMonitoring(
    "searchYouTube",
    async () => {
        // Your code here
        return await searchForVideos(query)
    },
    { query, filters },
)

// Create a span for a specific operation
const span = createSpan("processQueue", { guildId })
try {
    // Your code here
    span?.setStatus("ok")
} catch (error) {
    span?.setStatus("error")
    throw error
} finally {
    span?.finish()
}

// Set user context
setUserContext(user.id, user.username, { isAdmin: user.isAdmin })

// Add breadcrumb for tracking user actions
addBreadcrumb("music", "User skipped track", "info", { trackName })
```

## Best Practices

1. **Always include context**: Add relevant data to logs to make debugging easier
2. **Use appropriate log levels**: Use the correct log level for each message
3. **Monitor performance**: Use transactions and spans for performance-critical code
4. **Add user context**: Set user context when available to track user-specific issues
5. **Add breadcrumbs**: Use breadcrumbs to track the sequence of events leading to an error

## Troubleshooting

### Sentry Not Receiving Events

1. Verify your `SENTRY_DSN` is correct
2. Check that Sentry is properly initialized in `src/index.ts`
3. Ensure your network allows outbound connections to Sentry

### High Event Volume

If you're seeing too many events in Sentry:

1. Adjust the `tracesSampler` in `src/index.ts` to reduce sampling rate
2. Review your logging to ensure you're not logging unnecessarily
3. Configure Sentry filters in the Sentry dashboard

## Additional Resources

- [Sentry Documentation](https://docs.sentry.io/)
- [Sentry Node.js SDK](https://docs.sentry.io/platforms/node/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)
