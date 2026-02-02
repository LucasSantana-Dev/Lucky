# Sentry monitoring

Set `SENTRY_DSN` (from Sentry project settings) to enable error tracking and performance monitoring. Sentry is disabled when `NODE_ENV=development`.

- **Development**: No events sent.
- **Production**: Full monitoring (errors, performance, breadcrumbs).

Dashboard: https://sentry.io/organizations/your-org/projects/

For SDK usage and configuration, see [Sentry Node.js docs](https://docs.sentry.io/platforms/node/).
