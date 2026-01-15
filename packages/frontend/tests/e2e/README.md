# E2E Testing with Playwright

This directory contains end-to-end tests for the LukBot web application, focusing on the Discord OAuth2 authentication flow.

## Prerequisites

- Backend server running on port 3000
- Frontend dev server running on port 5173
- Redis server running and accessible
- Discord OAuth2 credentials configured in `.env`

## Running Tests

### Run all tests
```bash
npm run test:e2e
```

### Run tests in UI mode
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see browser)
```bash
npm run test:e2e:headed
```

### Debug tests
```bash
npm run test:e2e:debug
```

### Run specific test file
```bash
npx playwright test auth-flow.spec.ts
```

### Run tests matching a pattern
```bash
npx playwright test --grep "Login button"
```

## Test Structure

### `auth-flow.spec.ts`
Main OAuth authentication flow tests:
- Login button click and redirect
- OAuth state parameter validation
- Error handling scenarios
- Session management
- Network request verification

### `visual/login-page.spec.ts`
Visual regression tests:
- Login page screenshots
- Error message display
- Button states (hover, loading)

### `performance/auth-performance.spec.ts`
Performance tests:
- Redirect timing
- Session creation timing
- Page load performance
- Network request counts

## Test Helpers

### `helpers/auth-helpers.ts`
Utility functions for authentication testing:
- `waitForAuth()` - Wait for authentication to complete
- `clearSession()` - Clear session cookies and storage
- `verifyOAuthRedirect()` - Verify OAuth redirect parameters
- `verifySessionCookie()` - Check if session cookie is set
- `interceptAuthRequests()` - Mock authentication API responses

### `fixtures/test-data.ts`
Test data constants:
- Mock Discord user data
- Mock OAuth tokens
- Test environment variables

### `fixtures/test-server.ts`
Test fixtures for authenticated pages and server setup.

## Manual Testing with Chrome DevTools

1. Start backend: `npm run dev` (with `WEBAPP_ENABLED=true`)
2. Start frontend: `cd packages/frontend && npm run dev`
3. Open Chrome with DevTools: `npx playwright test --headed --debug`
4. Monitor:
   - **Network tab**: API requests and responses
   - **Console tab**: JavaScript errors and logs
   - **Application tab**: Cookies and session storage

## Test Reports

After running tests, view the HTML report:
```bash
npx playwright show-report
```

Screenshots and videos are saved to `test-results/` directory.

## Troubleshooting

### Tests fail with "Connection refused"
- Ensure backend server is running on port 3000
- Ensure frontend dev server is running on port 5173
- Check that Redis is accessible

### OAuth redirect fails
- Verify `CLIENT_ID` and `CLIENT_SECRET` are set in `.env`
- Verify `WEBAPP_REDIRECT_URI` matches Discord OAuth settings
- Check that redirect URI is whitelisted in Discord Developer Portal

### Session cookie not set
- Verify Redis is running
- Check `WEBAPP_SESSION_SECRET` is configured
- Verify CORS is properly configured

## Writing New Tests

1. Create test file in appropriate directory (`tests/e2e/`)
2. Import test utilities from `helpers/`
3. Use test fixtures from `fixtures/` when needed
4. Follow existing test patterns for consistency

Example:
```typescript
import { test, expect } from '@playwright/test'
import { clearSession, verifyOAuthRedirect } from './helpers/auth-helpers'

test('my test', async ({ page }) => {
  await clearSession(page)
  await page.goto('/')
  // ... test code
})
```
