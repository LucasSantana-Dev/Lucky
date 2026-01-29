# Infisical Environment Variables

LukBot can load environment variables from [Infisical](https://infisical.com) when the Infisical client is configured. This keeps secrets out of `.env` in production and centralizes them in Infisical.

## Configuration checklist

| Step | Where             | What                                                                                                                                                 |
| ---- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Infisical UI      | Create project (e.g. LukBot), add environments (`dev`, `prod`), create a Machine Identity, copy **Client ID** and **Client Secret**.                 |
| 2    | Infisical UI      | In project **Settings**, copy **Project ID**. Add app secrets (e.g. `DISCORD_TOKEN`, `CLIENT_SECRET`, `DATABASE_URL`) under the desired environment. |
| 3    | Local `.env`      | Add `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`, `INFISICAL_ENV=dev`. Do not commit `.env` (it is in `.gitignore`).     |
| 4    | Cursor (optional) | **Settings → Tools & MCP** → Infisical server → set **Client ID** and **Client Secret** so MCP tools (`list-projects`, `list-secrets`) work.         |

After step 3, the bot and backend load secrets from Infisical at startup when all four vars are set. After step 4, you can use Infisical MCP in Cursor to list or manage secrets. Variable names are listed in `.env.example` (Infisical block).

## How it works

1. `.env` (or `.env.local` in development) is loaded first.
2. If `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`, and `INFISICAL_ENV` are all set, the app fetches secrets from Infisical and overlays them onto `process.env`.
3. Infisical values override any same-named keys already set from `.env`.

The bot and backend entrypoints use `ensureEnvironment()`, which runs this flow. No code changes are needed beyond setting the Infisical env vars.

## Configure .env for LukBot (Infisical)

To have LukBot load secrets from Infisical at runtime, add these to your **local** `.env` (do not commit the secret):

| Variable                  | Where to get it                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `INFISICAL_CLIENT_ID`     | Infisical → LukBot → Access Control → Project Machine Identities → your identity → **Client ID** |
| `INFISICAL_CLIENT_SECRET` | Same screen → Client Secrets (copy once; store securely)                                         |
| `INFISICAL_PROJECT_ID`    | Infisical → LukBot → Settings → Project ID, or from MCP `list-projects` after MCP is configured  |
| `INFISICAL_ENV`           | Environment slug in the project (e.g. `dev`, `prod`)                                             |

Example (replace with your values; never commit `INFISICAL_CLIENT_SECRET`):

```env
INFISICAL_CLIENT_ID=<your-machine-identity-client-id>
INFISICAL_CLIENT_SECRET=<your-machine-identity-client-secret>
INFISICAL_PROJECT_ID=<lukbot-project-id>
INFISICAL_ENV=dev
```

After that, add your app secrets (e.g. `DISCORD_TOKEN`, `CLIENT_SECRET`, `DATABASE_URL`) in the Infisical UI under the same project and environment. They will be loaded at startup and override any same-named keys in `.env`.

## Required env vars for Infisical

| Variable                  | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `INFISICAL_CLIENT_ID`     | Machine Identity client ID from Infisical        |
| `INFISICAL_CLIENT_SECRET` | Machine Identity client secret                   |
| `INFISICAL_PROJECT_ID`    | Infisical project ID                             |
| `INFISICAL_ENV`           | Environment slug (e.g. `dev`, `staging`, `prod`) |

Optional:

| Variable                | Description                                                   |
| ----------------------- | ------------------------------------------------------------- |
| `INFISICAL_SECRET_PATH` | Secret path in the project (default: `/`)                     |
| `INFISICAL_SITE_URL`    | Infisical instance URL (default: `https://app.infisical.com`) |

## Configuring Infisical MCP in Cursor

To use Infisical MCP tools (e.g. list projects, list/create secrets) from Cursor, the Infisical MCP server must be authenticated with a Machine Identity **that has access to the LukBot project**:

1. In Infisical: **LukBot** → **Access Control** → **Project Machine Identities** → add or select an identity (e.g. **MCP**) → grant it **Read** and **Write** (or **Admin**) on secrets → copy **Client ID** and create/copy a **Client Secret**.
2. In Cursor: open MCP settings (e.g. **Settings → Tools & MCP**), select the Infisical server, and set **Client ID** and **Client Secret** in the server configuration (use the values from step 1). Restart Cursor if needed.
3. After that, MCP tools like `list-projects` (with `type: "secret-manager"`) and `list-secrets` / `create-secret` (with LukBot `projectId`, `environmentSlug`) work for LukBot. If you get **403** on LukBot, the identity used by MCP is not attached to LukBot—attach it in step 1. If you get **422** on `list-projects`, use `type: "secret-manager"` (not `"all"`).

Do not paste real client secrets into chat or into the repo; keep them in Cursor MCP config or in local `.env` only.

### LukBot project (Infisical)

LukBot project overview: [Infisical LukBot](https://app.infisical.com/organizations/1843fc0a-2cce-46ca-a6d6-a31929356381/projects/secret-management/fdc73498-94a7-46ba-9ecc-b64956e45af3/overview). Use **Project ID** `fdc73498-94a7-46ba-9ecc-b64956e45af3` for MCP calls and for `INFISICAL_PROJECT_ID` in `.env`.

### Run from Infisical (dev)

Dev secrets are synced from `.env` to LukBot → dev. To run the bot/backend using Infisical instead of local `.env`, add to `.env` (keep `INFISICAL_CLIENT_SECRET` out of version control):

```env
INFISICAL_PROJECT_ID=fdc73498-94a7-46ba-9ecc-b64956e45af3
INFISICAL_ENV=dev
INFISICAL_CLIENT_ID=<from LukBot → Access Control → Machine Identities>
INFISICAL_CLIENT_SECRET=<from same screen; store securely>
```

With `@infisical/sdk` installed in `packages/shared`, the app will load all dev secrets from Infisical at startup.

## Setup in Infisical

1. Create an account and a project in [Infisical](https://app.infisical.com).
2. Create environments (e.g. `dev`, `prod`) in the project.
3. Create a [Machine Identity](https://infisical.com/docs/documentation/platform/identities/machine-identities) and attach it to the project with permission to read secrets.
4. Use the client ID and client secret for `INFISICAL_CLIENT_ID` and `INFISICAL_CLIENT_SECRET` in `.env` and/or in Cursor MCP config.
5. In the project settings, copy the project ID into `INFISICAL_PROJECT_ID`.
6. Add your app secrets (e.g. `DISCORD_TOKEN`, `CLIENT_SECRET`, `DATABASE_URL`) in the Infisical UI for the desired environment.

## Using Infisical MCP (Cursor)

With the Infisical MCP server configured with a Machine Identity that has access to LukBot:

- **List projects**: `list-projects` with `type: "secret-manager"` (API accepts `secret-manager`, `cert-manager`, `kms`, `ssh`, etc.; not `"all"`).
- **List secrets**: `list-secrets` with `projectId` (e.g. LukBot `fdc73498-94a7-46ba-9ecc-b64956e45af3`) and `environmentSlug` (e.g. `dev`).
- **Create/update secrets**: `create-secret`, `update-secret` with same `projectId`, `environmentSlug`; use `secretPath: "/"` for root.
- **Create project/environment**: `create-project`, `create-environment` for initial setup.

## Dependency

Infisical support is optional. Install the SDK when you use Infisical:

```bash
cd packages/shared && npm install @infisical/sdk
```

It is listed under `optionalDependencies` in `packages/shared/package.json`. If the SDK is not installed and Infisical env vars are set, the app logs a debug message and continues without Infisical secrets.

## Local development

- Use `.env` or `.env.local` with real values for local runs (Infisical optional).
- Or set only the four Infisical vars in `.env` and store the rest of the secrets in Infisical for that project/environment.

## Docker

In Docker, pass Infisical env vars (or a minimal `.env` that only contains them) and ensure the container can reach Infisical (e.g. `INFISICAL_SITE_URL` for self-hosted). The rest of the config can live in Infisical.
