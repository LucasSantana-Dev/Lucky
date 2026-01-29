# Last.fm API integration

LukBot can send **Now Playing** and **Scrobbles** to Last.fm. Users connect their own Last.fm accounts via `/lastfm link`; optionally a global session key in env can be used as fallback for unlinked users.

## Requirements

- A [Last.fm API account](https://www.last.fm/api/account/create) (API key and secret)
- Backend web app running so users can complete the link flow (connect + callback)
- Optional: `LASTFM_SESSION_KEY` in env for global fallback scrobbling

Scrobbling and updateNowPlaying require authentication; see [Last.fm Authentication](https://www.last.fm/api/authentication).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LASTFM_API_KEY` | Yes (when Last.fm enabled) | API key from Last.fm API account |
| `LASTFM_API_SECRET` | Yes (when Last.fm enabled) | API secret from Last.fm API account |
| `LASTFM_SESSION_KEY` | No | Optional global session key (fallback when a user has not linked) |
| `LASTFM_LINK_SECRET` | No | Secret to sign connect links (defaults to `WEBAPP_SESSION_SECRET`) |
| `WEBAPP_REDIRECT_URI` | For /lastfm link | Base URL for backend (e.g. `http://localhost:3000/api/auth/callback`); connect URL is derived from it |

If `LASTFM_API_KEY` or `LASTFM_API_SECRET` are missing, Last.fm integration is disabled (no crash).

## Getting API key and secret

1. Go to [Last.fm API account creation](https://www.last.fm/api/account/create).
2. Fill application name and description.
3. For **Callback URL**, set your backend’s Last.fm callback URL, e.g. `https://your-backend.example.com/api/lastfm/callback`. For local dev use something like `http://localhost:3000/api/lastfm/callback` (must match the URL where your backend is reachable).
4. Create the account, then on your [API accounts page](https://www.last.fm/api/accounts) open the application and copy the **API key** and **secret**. Set them as `LASTFM_API_KEY` and `LASTFM_API_SECRET` in `.env`.

## Per-user linking (recommended)

1. Ensure the backend is running and reachable at the same host/path as `WEBAPP_REDIRECT_URI` (e.g. `http://localhost:3000` for local dev).
2. In Last.fm API application settings, set **Callback URL** to `{your-backend-base}/api/lastfm/callback` (e.g. `http://localhost:3000/api/lastfm/callback`).
3. Users run `/lastfm link` in Discord and open the link they receive. They sign in on Last.fm and authorize; they are redirected back and their account is linked.
4. Tracks **requested by** a linked user are scrobbled to that user’s Last.fm. If the requester has not linked, the bot uses `LASTFM_SESSION_KEY` from env if set; otherwise no scrobble for that play.

## Optional: global session key (fallback)

For a single shared Last.fm account (or when users have not linked), you can set `LASTFM_SESSION_KEY` in `.env`. The bot uses it when the track requester has no linked account.

### Getting a session key

1. Open in a browser (replace `YOUR_API_KEY`):

   ```
   https://www.last.fm/api/auth?api_key=YOUR_API_KEY
   ```

2. Log in to Last.fm and authorize. You are redirected to your **callback URL** with `?token=...`. Copy the `token` value from the address bar (the page does not need to load).

3. Exchange the token for a session key using [auth.getSession](https://www.last.fm/api/show/auth.getSession) (signed with your API secret; see [Signing calls](https://www.last.fm/api/authspec#8-signing-calls)).

4. Set the returned session key as `LASTFM_SESSION_KEY` in `.env`. Session keys are long-lived until the user revokes the application.

Alternatively use [auth.getMobileSession](https://www.last.fm/api/show/auth.getMobileSession) (username + password) only in a secure environment; prefer web auth for production.

## Behaviour

- When a track **starts** playing, LukBot calls Last.fm `track.updateNowPlaying` for the **requester’s** session (linked account or env fallback).
- When a track **finishes** or is **skipped**, LukBot calls `track.scrobble` for the same session.
- The Discord channel still receives the plain-text "Now playing: Artist – Title" message so .fmbot and other channel-based scrobblers continue to work.

## Discord commands

- **`/lastfm link`** — Get a one-time link to connect your Last.fm account (requires backend and callback URL configured).
- **`/lastfm status`** — Check whether your Last.fm account is linked.

## References

- [Last.fm API](https://www.last.fm/api)
- [Authentication](https://www.last.fm/api/authentication)
- [Auth spec (signing)](https://www.last.fm/api/authspec#8-signing-calls)
- [track.updateNowPlaying](https://www.last.fm/api/show/track.updateNowPlaying)
- [track.scrobble](https://www.last.fm/api/show/track.scrobble)
