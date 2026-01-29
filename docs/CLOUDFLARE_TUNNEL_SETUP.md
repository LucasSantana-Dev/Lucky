# Cloudflare Tunnel, Domain, and DNS for Bot Frontend

This guide configures Cloudflare Tunnel so the LukBot web app (frontend + API) is reachable at a custom domain over HTTPS, without opening ports or exposing your origin IP.

## Overview

- **Cloudflare Tunnel** (`cloudflared`) creates an outbound connection from your machine (or server) to Cloudflare. Traffic to your domain hits Cloudflare first, then is forwarded through the tunnel to your app.
- **Domain & DNS**: Your domain is added to Cloudflare; a CNAME record points the subdomain (e.g. `app.yourdomain.com`) to the tunnel so users reach the web app over HTTPS.

The web app backend serves the frontend in production and listens on `WEBAPP_PORT` (default 3000). The tunnel forwards traffic from your chosen hostname to `http://localhost:WEBAPP_PORT`.

## Prerequisites

- A domain you own (e.g. `yourdomain.com`).
- Cloudflare account: [dash.cloudflare.com](https://dash.cloudflare.com).
- Web app running locally or on a server (e.g. `./scripts/discord-bot.sh start` with `WEBAPP_ENABLED=true`, or `npm run dev:bot` with the webapp enabled).

## 1. Add the domain to Cloudflare

1. In [Cloudflare Dashboard](https://dash.cloudflare.com), go to **Websites** and click **Add a site**.
2. Enter your domain (e.g. `yourdomain.com`) and choose a plan (Free is enough for tunnel + DNS).
3. Cloudflare will scan existing DNS records. Review and continue.
4. **Change your domain’s nameservers** at your registrar to the ones Cloudflare shows (e.g. `ns1.cloudflare.com`, `ns2.cloudflare.com`). Propagation can take up to 24–48 hours.

References:

- [Add a website to Cloudflare](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/)
- [Change nameservers to Cloudflare](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)

## 2. Install cloudflared

Install the Cloudflare Tunnel daemon on the machine where the web app runs:

- **macOS**: `brew install cloudflared`
- **Linux**: [Cloudflare package repo](https://pkg.cloudflare.com/) or [GitHub releases](https://github.com/cloudflare/cloudflared/releases)
- **Windows**: `winget install --id Cloudflare.cloudflared`
- **Docker**: `docker run cloudflare/cloudflared`

Verify:

```bash
cloudflared --version
```

Use a recent release (e.g. 2025.7.0+). See [Install cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/).

## 3. Create a tunnel

You can create a **remotely-managed** tunnel (recommended) from the dashboard, or a **locally-managed** tunnel from the CLI.

### Option A: Remotely-managed tunnel (recommended)

1. In [Cloudflare Dashboard](https://dash.cloudflare.com) → **Zero Trust** (or **Networks** → **Tunnels**), open **Networks** → **Tunnels**.
2. Click **Create a tunnel**. Choose **Cloudflared**.
3. Name it (e.g. `lukbot-webapp`) and save.
4. On **Configure** (or **Route Traffic** → **Published applications**):
   - **Public hostname**: your subdomain + domain (e.g. `lukbot.yourdomain.com`).
   - **Service type**: **HTTP** (the LukBot web app serves HTTP; do not use HTTPS unless your origin has TLS).
   - **URL (Required)**: `http://localhost:3000` (or `http://localhost:YOUR_WEBAPP_PORT`). This is the origin the tunnel forwards to; leave blank causes "url is required".
5. Install the connector using the command shown in the dashboard (it includes the tunnel token). Run that command on the host where the web app is running.

The tunnel will appear as “Connected” when `cloudflared` is running with that token.

### Option B: Locally-managed tunnel

1. Log in and choose the zone (your domain):

   ```bash
   cloudflared tunnel login
   ```

   This opens a browser to authorize; select the zone (e.g. `yourdomain.com`).

2. Create the tunnel:

   ```bash
   cloudflared tunnel create lukbot-webapp
   ```

   Note the tunnel ID from the output.

3. Create a config file (e.g. `~/.cloudflared/config.yml` or project `cloudflared/config.yml`):

   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: /path/to/<TUNNEL_ID>.json

   ingress:
     - hostname: app.yourdomain.com
       service: http://localhost:3000
     - hostname: api.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```

   Use one hostname if frontend and API are on the same origin (recommended). Replace `app.yourdomain.com` and `localhost:3000` with your hostname and port.

4. Route DNS (creates CNAME to the tunnel):

   ```bash
   cloudflared tunnel route dns lukbot-webapp app.yourdomain.com
   ```

5. Run the tunnel:

   ```bash
   cloudflared tunnel run lukbot-webapp
   ```

References:

- [Create a remote tunnel (dashboard)](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)
- [Create a locally-managed tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/)
- [DNS record for the tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/)

## 4. DNS record (if not done by dashboard / CLI)

If you did not use “Route DNS” or the dashboard wizard:

1. In Cloudflare Dashboard → your zone → **DNS** → **Records**.
2. **Add record**:
   - **Type**: CNAME
   - **Name**: `app` (for `app.yourdomain.com`) or your subdomain
   - **Target**: `<TUNNEL_ID>.cfargotunnel.com` (for named tunnels; remote tunnels show the target in the dashboard)
   - **Proxy status**: Proxied (orange cloud) for HTTPS and DDoS protection.

Save. After DNS propagates, `https://app.yourdomain.com` will go through the tunnel to your app.

## 5. Environment variables for production

Set these in `.env` (or your deployment config) so OAuth and frontend URLs match the public URL:

```env
WEBAPP_ENABLED=true
WEBAPP_PORT=3000

# Public URL of the web app (Cloudflare Tunnel / custom domain)
WEBAPP_FRONTEND_URL=https://app.yourdomain.com
WEBAPP_REDIRECT_URI=https://app.yourdomain.com/api/auth/callback
```

Discord OAuth2 redirect URI must match exactly:

1. In [Discord Developer Portal](https://discord.com/developers/applications) → your app → **OAuth2** → **Redirects**, add:
   `https://app.yourdomain.com/api/auth/callback`
2. Use the same value for `WEBAPP_REDIRECT_URI`.

See [WEBAPP_SETUP.md](WEBAPP_SETUP.md) and [DISCORD_OAUTH2_SETUP.md](DISCORD_OAUTH2_SETUP.md) for full OAuth and session configuration.

## 6. Quick tunnel (development only)

For a temporary public URL without a custom domain (e.g. testing OAuth or sharing a dev build):

```bash
cloudflared tunnel --url http://localhost:3000
```

You get a random `*.trycloudflare.com` URL. Limitations: no custom domain, request limits, not for production. Set `WEBAPP_FRONTEND_URL` and Discord redirect to that URL only while testing.

## 7. Running the tunnel in production

- **Remotely-managed**: Run the install command from the dashboard (it includes the token). Use a process manager (e.g. systemd, PM2, Docker) so the tunnel restarts with the app.
- **Locally-managed**: Run `cloudflared tunnel run lukbot-webapp` (or your tunnel name) with the same process manager. Keep credentials and config secure and out of version control.

## Troubleshooting

- **Docker: "Cannot connect to the Docker daemon"**: The Docker daemon is not running. Either start Docker Desktop (or your Docker engine) and re-run the `docker run cloudflare/cloudflared ...` command, or run `cloudflared` natively (e.g. `brew install cloudflared` on macOS) and use the same tunnel token or config—no Docker required.
- **1016 / tunnel not reachable**: Tunnel process not running or wrong hostname/port in ingress. Ensure `cloudflared` is running and the app is listening on the configured port.
- **OAuth redirect mismatch**: `WEBAPP_REDIRECT_URI` and Discord redirects must match exactly (scheme, host, path). No trailing slash unless Discord has it.
- **CORS / cookie issues**: Use a single public hostname for frontend and API (e.g. `app.yourdomain.com`). Ensure `WEBAPP_FRONTEND_URL` matches that origin and cookies use the same domain.
- **Connectivity**: Run [connectivity pre-checks](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/connectivity-prechecks/) if the tunnel does not connect.

## Summary

1. Add domain to Cloudflare and switch nameservers.
2. Install `cloudflared` and create a tunnel (dashboard or CLI).
3. Point a hostname (e.g. `app.yourdomain.com`) to the tunnel and set ingress to `http://localhost:WEBAPP_PORT`.
4. Set `WEBAPP_FRONTEND_URL` and `WEBAPP_REDIRECT_URI` to `https://app.yourdomain.com` (and callback path).
5. Add the same callback URL in the Discord Developer Portal.

After that, the bot frontend is served over HTTPS at your custom domain via Cloudflare Tunnel and DNS.
