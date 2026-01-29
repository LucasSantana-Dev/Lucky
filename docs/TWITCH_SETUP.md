# Twitch stream-online notifications

LukBot can notify a Discord channel when a configured Twitch streamer goes live, using Twitch EventSub over WebSocket.

## Requirements

- A [Twitch developer application](https://dev.twitch.tv/console) (Client ID and Client Secret)
- A **user access token** (and optionally refresh token) for EventSub WebSocket subscriptions

Twitch requires a **user access token** for EventSub WebSocket subscriptions; app-only (client credentials) tokens cannot create WebSocket subscriptions. See [Twitch: Managing Event Subscriptions](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/#create-eventsub-subscription).

## Register your application on Twitch Developer Console

1. Open the [Twitch Developer Console](https://dev.twitch.tv/console), log in with your Twitch account, and go to **Applications**.
2. Click **Register your application** (or **+ Register**).
3. Fill the form:
   - **Name**: Application name (e.g. `LukBot`), 3–100 characters. Shown to users when they authorize the app.
   - **OAuth Redirect URLs**: Add at least one redirect URI. **Must use HTTPS** except for localhost. **What to add now:** add `http://localhost:3000`. After you authorize the app, Twitch will redirect you to that URL with `?code=...` in the query string; you copy the `code` and exchange it for tokens (see "Getting a user access token" below). No callback server is required—you can copy the code from the address bar even if nothing is running on port 3000. Later, if you host a real callback page, add that URL (e.g. `https://yourdomain.com/auth/twitch/callback`) as well.
   - **Category**: Choose the option that best fits (e.g. Application Integration, Bot).
   - **Client type**: Select **Confidential** for a server-side app like LukBot (credentials stay on the server). Use **Public** only for client-side or mobile apps where the secret cannot be kept private.
4. Complete any CAPTCHA and click **Create**.
5. On the app’s **Manage** page, copy the **Client ID** and create/copy a **Client Secret** (e.g. **New Secret**). Set these as `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in your `.env`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWITCH_CLIENT_ID` | Yes (when Twitch enabled) | Application Client ID from Twitch console |
| `TWITCH_CLIENT_SECRET` | Yes (when Twitch enabled) | Application Client Secret |
| `TWITCH_ACCESS_TOKEN` | Yes (when Twitch enabled) | User OAuth access token (for EventSub + Helix) |
| `TWITCH_REFRESH_TOKEN` | Optional | User OAuth refresh token; if set, the bot will refresh the access token before expiry |

If `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, or `TWITCH_ACCESS_TOKEN` are missing, the Twitch service is not started (no crash).

## Getting a user access token

You need one user (e.g. the bot owner) to authorize the app so LukBot can create EventSub subscriptions and call the Helix API.

### Option 1: Authorization code flow

1. In the [Twitch developer console](https://dev.twitch.tv/console), add a redirect URI (e.g. `http://localhost:3000`).
2. Open in a browser (replace `YOUR_CLIENT_ID` and redirect if needed):

   ```
   https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000&scope=&state=random
   ```

   For EventSub and Helix users lookup, no scopes are required for `stream.online`.
3. After authorizing, you are redirected to `redirect_uri?code=...`. Copy the `code`.
4. Exchange the code for tokens (replace placeholders):

   ```bash
   curl -X POST 'https://id.twitch.tv/oauth2/token' \
     -H 'Content-Type: application/x-www-form-urlencoded' \
     -d "client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&code=CODE_FROM_REDIRECT&grant_type=authorization_code&redirect_uri=http://localhost:3000"
   ```

5. Put the returned `access_token` and `refresh_token` into `TWITCH_ACCESS_TOKEN` and `TWITCH_REFRESH_TOKEN`.

### Option 2: Device code flow

For headless or CLI setups, use the [device code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow): request a device code, have the user open the activation URL, then poll for tokens and set `TWITCH_ACCESS_TOKEN` and `TWITCH_REFRESH_TOKEN`.

## Bot usage

- **Add**: `/twitch add <username>` — Notify this (or the chosen) channel when the Twitch user goes live. Optionally set a different Discord channel with the `channel` option.
- **Remove**: `/twitch remove <username>` — Stop notifications for that streamer in this server.
- **List**: `/twitch list` — List Twitch streamers configured for this server.

Only users with **Manage Server** can use these commands.

### Notifying for Criativaria

To receive Discord notifications when the **Criativaria** Twitch channel goes live, run in the Discord channel where you want alerts:

```
/twitch add Criativaria
```

If you prefer a different channel than the one you run the command in, use the `channel` option to select the target channel.

## Behaviour

- On bot ready, if Twitch env is set, LukBot connects to `wss://eventsub.wss.twitch.tv/ws`, receives a session id, and creates `stream.online` subscriptions for each distinct Twitch user id stored in the database.
- When Twitch sends a `stream.online` notification, the bot looks up all configured Discord channels for that streamer and sends an embed (streamer name, link, timestamp).
- Adding or removing a streamer updates the database and refreshes EventSub subscriptions so the WebSocket session stays in sync.

## References

- [Twitch EventSub](https://dev.twitch.tv/docs/eventsub/)
- [EventSub WebSocket transport](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)
- [Managing Event Subscriptions](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/) (user token required for WebSocket)
- [Getting OAuth access tokens](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)
