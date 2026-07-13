import { useMemo, type ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import DocsShell, {
    type DocsNavGroup,
    type DocsTocItem,
} from '@/components/DocsShell/DocsShell'

type DocsPage = {
    slug: string
    title: string
    breadcrumb: string
    toc: DocsTocItem[]
    content: () => ReactElement
}

const REPO = 'https://github.com/LucasSantana-Dev/Lucky'
const BOT_INVITE =
    'https://discord.com/oauth2/authorize?client_id=962198089161134131&scope=bot%20applications.commands&permissions=8'

const NAV: DocsNavGroup[] = [
    {
        heading: 'Getting started',
        items: [
            { label: 'Overview', href: '/docs?page=overview' },
            { label: 'Quick start', href: '/docs?page=quickstart' },
            { label: 'Architecture', href: '/docs?page=architecture' },
        ],
    },
    {
        heading: 'Self-hosting',
        items: [
            { label: 'Self-host setup', href: '/docs?page=self-host' },
            { label: 'Configuration', href: '/docs?page=configuration' },
            { label: 'Updating & deploys', href: '/docs?page=updating' },
            { label: 'Backups', href: '/docs?page=backups' },
            { label: 'Troubleshooting', href: '/docs?page=troubleshooting' },
        ],
    },
    {
        heading: 'Using Lucky',
        items: [
            { label: 'Music & autoplay', href: '/docs?page=music' },
            { label: 'Moderation', href: '/docs?page=moderation' },
            { label: 'Custom commands', href: '/docs?page=custom-commands' },
            { label: 'Reaction roles & levels', href: '/docs?page=engagement' },
            { label: 'Web dashboard', href: '/docs?page=dashboard' },
        ],
    },
    {
        heading: 'Reference',
        items: [
            { label: 'Command list', href: '/docs?page=commands' },
            { label: 'Permissions', href: '/docs?page=permissions' },
            { label: 'Environment variables', href: '/docs?page=env' },
            { label: 'Integrations', href: '/docs?page=integrations' },
            { label: 'FAQ', href: '/docs?page=faq' },
        ],
    },
    {
        heading: 'External',
        items: [
            { label: 'GitHub repo', href: REPO, external: true },
            { label: 'Changelog', href: '/changelog' },
            {
                label: 'Discord support',
                href: 'https://discord.gg/lucky',
                external: true,
            },
        ],
    },
]

const PAGES: DocsPage[] = [
    {
        slug: 'overview',
        title: 'Overview',
        breadcrumb: 'Docs / Overview',
        toc: [
            { id: 'what-is-lucky', label: 'What is Lucky' },
            { id: 'two-ways-to-run-it', label: 'Two ways to run it' },
            { id: 'whats-included', label: "What's included" },
            { id: 'project-status', label: 'Project status' },
            { id: 'how-this-is-built', label: 'How this is built' },
        ],
        content: () => (
            <>
                <p>
                    Lucky is an open-source Discord bot. Music, moderation,
                    custom commands, automation, and a web dashboard. Free
                    forever, with no premium tier paywalling the good parts.
                </p>
                <h2 id='what-is-lucky'>What is Lucky</h2>
                <p>
                    Lucky started as a music bot for a friend's server. It now
                    also handles moderation, custom commands, leveling, reaction
                    roles, embed building, automation, and starboards. The web
                    dashboard at the same domain lets you configure everything
                    without leaving the browser — no <code>/config</code> chat
                    commands to memorize.
                </p>
                <p>
                    The whole project is a TypeScript monorepo published under
                    the ISC license. Anyone can fork it, audit it, contribute,
                    or self-host their own instance. There are no closed-source
                    plugins, no enterprise tier, and no telemetry phoned home
                    from self-hosted deployments.
                </p>
                <h2 id='two-ways-to-run-it'>Two ways to run it</h2>
                <p>
                    You can use Lucky in either of two ways. Pick whichever fits
                    your situation.
                </p>
                <ol>
                    <li>
                        <strong>Hosted.</strong> Click{' '}
                        <a
                            href={BOT_INVITE}
                            rel='noreferrer noopener'
                            target='_blank'
                        >
                            Add to Discord
                        </a>
                        , pick the server, accept the permissions. The bot
                        joins, you open the dashboard, and you're configuring
                        within a minute. Good fit for small-to-medium servers
                        that don't want to babysit infrastructure.
                    </li>
                    <li>
                        <strong>Self-hosted.</strong> Clone the repo, copy{' '}
                        <code>.env.example</code> to <code>.env</code>, run{' '}
                        <code>docker compose up -d</code>. The bot runs on your
                        box. Your guild data, moderation logs, and autoplay
                        history all stay on your hardware. See{' '}
                        <a href='/docs?page=self-host'>Self-host setup</a> for
                        the full walkthrough.
                    </li>
                </ol>
                <p>
                    The hosted and self-hosted versions are byte-identical —
                    same commands, same dashboard, same permissions model. The
                    only difference is who runs the server.
                </p>
                <h2 id='whats-included'>What's included</h2>
                <ul>
                    <li>
                        Slash commands for music, moderation, and utility (100+
                        commands across all modules).
                    </li>
                    <li>
                        Autoplay with Spotify-fed recommendations and Last.fm
                        scrobbling.
                    </li>
                    <li>
                        Auto-mod for spam, caps, links, and invites with
                        per-server rules and per-channel overrides.
                    </li>
                    <li>
                        Custom command builder with variable interpolation, role
                        gating, and channel scoping.
                    </li>
                    <li>
                        Embed builder with live preview, saved templates, and
                        one-click resend.
                    </li>
                    <li>
                        Reaction roles, role gating, leveling with XP curves,
                        and starboard with per-channel thresholds.
                    </li>
                    <li>
                        Scheduled and triggered automations (welcome messages,
                        periodic reminders, auto-archives).
                    </li>
                    <li>
                        A React dashboard for configuring everything from your
                        browser.
                    </li>
                    <li>
                        Optional Last.fm and Twitch integrations for richer
                        music context and stream notifications.
                    </li>
                </ul>
                <h2 id='project-status'>Project status</h2>
                <p>
                    Lucky is under active development. The current line is the{' '}
                    <code>2.x</code> release train. Releases follow{' '}
                    <a
                        href='https://semver.org/spec/v2.0.0.html'
                        rel='noreferrer noopener'
                        target='_blank'
                    >
                        SemVer
                    </a>
                    : breaking changes bump the major, new features bump the
                    minor, fixes bump the patch. Every release is tagged on
                    GitHub and described in the{' '}
                    <a href='/changelog'>Changelog</a>.
                </p>
                <p>
                    Production runs on a homelab behind Cloudflare Tunnel. The
                    same compose stack you'd run locally is what's running in
                    production.
                </p>
                <h2 id='how-this-is-built'>How this is built</h2>
                <p>
                    Lucky is six services: <code>bot</code> (discord.js v14),{' '}
                    <code>backend</code> (Express + Prisma),{' '}
                    <code>frontend</code> (React 19 + Vite + Tailwind v4),{' '}
                    <code>postgres</code>, <code>redis</code>, and{' '}
                    <code>nginx</code>. All six are orchestrated with a single
                    <code>docker-compose.yml</code>. See{' '}
                    <a href='/docs?page=architecture'>Architecture</a> for the
                    full diagram and rationale.
                </p>
            </>
        ),
    },
    {
        slug: 'quickstart',
        title: 'Quick start',
        breadcrumb: 'Docs / Quick start',
        toc: [
            { id: 'add-the-bot', label: 'Add the bot' },
            { id: 'open-the-dashboard', label: 'Open the dashboard' },
            { id: 'first-commands', label: 'First commands to try' },
            { id: 'common-first-steps', label: 'Common first-day setup' },
            { id: 'next', label: 'Next steps' },
        ],
        content: () => (
            <>
                <p>
                    You'll be running Lucky in your server in under two minutes.
                    No account creation, no payment, no email.
                </p>
                <h2 id='add-the-bot'>Add the bot</h2>
                <ol>
                    <li>
                        Click{' '}
                        <a
                            href={BOT_INVITE}
                            rel='noreferrer noopener'
                            target='_blank'
                        >
                            Add to Discord
                        </a>
                        .
                    </li>
                    <li>
                        Pick the server. You need <code>Manage Server</code> on
                        it.
                    </li>
                    <li>
                        Accept the requested permissions. Lucky uses{' '}
                        <a href='/docs?page=permissions'>only what it needs</a>{' '}
                        — you can deny anything you'd rather configure later.
                        Re-invite changes the grant.
                    </li>
                    <li>
                        The bot joins immediately and slash commands are
                        registered within a few seconds.
                    </li>
                </ol>
                <h2 id='open-the-dashboard'>Open the dashboard</h2>
                <p>
                    Go to the homepage and click <strong>Dashboard</strong> in
                    the top right, or go directly to <code>/login</code>.
                    Authorize with Discord OAuth — Lucky only requests{' '}
                    <code>identify</code> and <code>guilds</code> scopes. You'll
                    see the server you just added the bot to.
                </p>
                <p>
                    If you don't see your server, refresh the guild cache from{' '}
                    <strong>Profile menu / Refresh servers</strong>. Discord
                    doesn't push membership changes — Lucky re-fetches on login
                    and on demand.
                </p>
                <h2 id='first-commands'>First commands to try</h2>
                <ul>
                    <li>
                        <code>/play tame impala let it happen</code> — join
                        voice and queue a track. Works with Spotify, YouTube,
                        and SoundCloud URLs too.
                    </li>
                    <li>
                        <code>/autoplay on</code> — keep music going when the
                        queue ends. Lucky pulls recommendations from what you've
                        been queuing.
                    </li>
                    <li>
                        <code>/queue</code> — see what's coming up. Use{' '}
                        <code>/skip</code>, <code>/pause</code>,{' '}
                        <code>/resume</code>, <code>/loop</code> to control
                        playback.
                    </li>
                    <li>
                        <code>
                            /cc create welcome &quot;Welcome to {'{server}'},{' '}
                            {'{user}'}!&quot;
                        </code>{' '}
                        — make a custom command. Run <code>/welcome</code> to
                        test it.
                    </li>
                    <li>
                        <code>/help</code> — full command list, scoped to what
                        you have access to.
                    </li>
                </ul>
                <h2 id='common-first-steps'>Common first-day setup</h2>
                <ol>
                    <li>
                        <strong>Set a music channel.</strong> Dashboard / Music
                        / Settings. Restricts <code>/play</code> to that channel
                        so it doesn't leak into general chat.
                    </li>
                    <li>
                        <strong>Wire auto-mod.</strong> Dashboard / Moderation /
                        Auto-mod. Spam + invite-link rules are the highest-ROI
                        first picks. Caps and link allow-listing come later.
                    </li>
                    <li>
                        <strong>Set up RBAC.</strong> Dashboard / Server
                        settings / Access control. Map your existing Discord
                        roles to dashboard modules so mods don't accidentally
                        change music settings.
                    </li>
                    <li>
                        <strong>Reaction roles.</strong> Dashboard / Reaction
                        roles / New. Stick one in
                        <code>#welcome</code> for self-assigned ping roles.
                    </li>
                </ol>
                <h2 id='next'>Next steps</h2>
                <p>
                    Read <a href='/docs?page=music'>Music & autoplay</a>,{' '}
                    <a href='/docs?page=moderation'>Moderation</a>, and{' '}
                    <a href='/docs?page=custom-commands'>Custom commands</a> for
                    the feature deep dives, or jump to{' '}
                    <a href='/docs?page=commands'>Command list</a> for the full
                    reference.
                </p>
            </>
        ),
    },
    {
        slug: 'architecture',
        title: 'Architecture',
        breadcrumb: 'Docs / Architecture',
        toc: [
            { id: 'services', label: 'Services' },
            { id: 'data', label: 'Data stores' },
            { id: 'network', label: 'Network & ports' },
            { id: 'request-path', label: 'Request path' },
            { id: 'why-this-shape', label: 'Why this shape' },
        ],
        content: () => (
            <>
                <p>
                    Lucky is a TypeScript monorepo with six services
                    orchestrated by a single Docker Compose stack. Same
                    composition runs locally, in CI, and in production.
                </p>
                <h2 id='services'>Services</h2>
                <ul>
                    <li>
                        <strong>bot</strong> — discord.js v14 client. Handles
                        slash commands, voice connections, autoplay, moderation
                        actions. Talks to <code>backend</code> for persistence,
                        to <code>redis</code> for session state and rate
                        limiting.
                    </li>
                    <li>
                        <strong>backend</strong> — Express + Prisma. Owns the
                        database schema and exposes a REST API consumed by both
                        the dashboard and the bot.
                    </li>
                    <li>
                        <strong>frontend</strong> — React 19 + Vite + Tailwind
                        v4. The dashboard SPA. Built into a static bundle and
                        served by nginx.
                    </li>
                    <li>
                        <strong>nginx</strong> — reverse proxy. Routes{' '}
                        <code>/api/*</code> to backend, everything else to the
                        static frontend. Terminates internal HTTP on{' '}
                        <code>:8080</code>; TLS is handled upstream by
                        Cloudflare Tunnel.
                    </li>
                    <li>
                        <strong>postgres</strong> — primary data store. Prisma
                        migrations, no manual DDL.
                    </li>
                    <li>
                        <strong>redis</strong> — session store, rate-limit
                        counters, Spotify token cache, autoplay scratch space.
                    </li>
                </ul>
                <h2 id='data'>Data stores</h2>
                <p>
                    Postgres holds guild settings, custom commands, moderation
                    cases, levels, embed templates, reaction-role configs, and
                    the linked-account table. Redis holds anything ephemeral:
                    web sessions, OAuth state, Spotify tokens, and per-guild
                    autoplay history.
                </p>
                <p>
                    All schema changes ship as Prisma migrations under{' '}
                    <code>packages/backend/prisma/migrations/</code>. On{' '}
                    <code>docker compose up</code> the backend runs pending
                    migrations before serving traffic.
                </p>
                <h2 id='network'>Network & ports</h2>
                <ul>
                    <li>
                        <code>:8080</code> — nginx. The only port you should
                        expose to anything outside the host.
                    </li>
                    <li>
                        <code>:3000</code> — backend (internal). Reachable only
                        from inside the compose network.
                    </li>
                    <li>
                        <code>:5173</code> — frontend dev server (only in dev
                        compose override).
                    </li>
                    <li>
                        <code>:5432</code> — postgres (internal).
                    </li>
                    <li>
                        <code>:6379</code> — redis (internal).
                    </li>
                </ul>
                <h2 id='request-path'>Request path</h2>
                <p>
                    A dashboard API call: browser → CDN (optional) → Cloudflare
                    Tunnel → nginx:8080 → backend:3000 → postgres / redis. The
                    bot path skips nginx entirely: discord gateway → bot →
                    backend:3000.
                </p>
                <h2 id='why-this-shape'>Why this shape</h2>
                <p>
                    Each service is replaceable in isolation. The bot can
                    restart without taking the dashboard down. A schema
                    migration runs on the backend without bouncing the bot.
                    nginx handles the boring stuff (gzip, caching, security
                    headers) so the backend stays minimal. The whole stack fits
                    comfortably on a 2 GB VPS.
                </p>
            </>
        ),
    },
    {
        slug: 'self-host',
        title: 'Self-host setup',
        breadcrumb: 'Docs / Self-host setup',
        toc: [
            { id: 'requirements', label: 'Requirements' },
            { id: 'discord-app', label: 'Create a Discord app' },
            { id: 'clone-and-configure', label: 'Clone and configure' },
            { id: 'start-the-stack', label: 'Start the stack' },
            { id: 'reverse-proxy', label: 'Reverse proxy & TLS' },
            { id: 'register-commands', label: 'Register slash commands' },
            { id: 'verify', label: 'Verify the install' },
        ],
        content: () => (
            <>
                <p>
                    Self-hosting means you run Lucky on your own hardware. Your
                    guild data, autoplay history, custom commands, and
                    moderation log stay on your box. No third-party ToS over
                    your community, no rate-limited tier.
                </p>
                <h2 id='requirements'>Requirements</h2>
                <ul>
                    <li>
                        A Linux server (Debian, Ubuntu, or any docker-compatible
                        distro). Tested on Debian 12.
                    </li>
                    <li>
                        <code>docker</code> 24+ and <code>docker compose</code>{' '}
                        v2+ installed.
                    </li>
                    <li>
                        ~2 GB RAM and ~5 GB disk at idle. More if you log a lot
                        or serve large guilds.
                    </li>
                    <li>
                        A public domain or Cloudflare Tunnel (optional, but
                        needed for OAuth callbacks if you want the dashboard
                        exposed).
                    </li>
                    <li>A Discord application with a bot token. See below.</li>
                </ul>
                <h2 id='discord-app'>Create a Discord app</h2>
                <ol>
                    <li>
                        Open{' '}
                        <a
                            href='https://discord.com/developers/applications'
                            rel='noreferrer noopener'
                            target='_blank'
                        >
                            Discord Developer Portal
                        </a>
                        .
                    </li>
                    <li>
                        Click <strong>New Application</strong>, name it (this
                        name appears in the OAuth screen).
                    </li>
                    <li>
                        Under <strong>Bot</strong>, click{' '}
                        <strong>Reset Token</strong> and copy the token. You'll
                        only see it once.
                    </li>
                    <li>
                        Under <strong>Bot / Privileged Gateway Intents</strong>,
                        enable <code>Server Members Intent</code> and{' '}
                        <code>Message Content Intent</code>. Lucky needs both
                        for moderation and custom-command triggers.
                    </li>
                    <li>
                        Under <strong>OAuth2 / Redirects</strong>, add{' '}
                        <code>
                            https://your-domain/api/auth/discord/callback
                        </code>
                        .
                    </li>
                    <li>
                        Under <strong>OAuth2 / URL Generator</strong>, pick{' '}
                        <code>bot</code> + <code>applications.commands</code>{' '}
                        scopes and the permissions you want. Copy the URL —
                        that's your invite link.
                    </li>
                </ol>
                <h2 id='clone-and-configure'>Clone and configure</h2>
                <pre>
                    <code>{`git clone ${REPO}.git lucky
cd lucky
cp .env.example .env
$EDITOR .env`}</code>
                </pre>
                <p>
                    Required env vars: <code>DISCORD_TOKEN</code>,{' '}
                    <code>DISCORD_CLIENT_ID</code>,{' '}
                    <code>DISCORD_CLIENT_SECRET</code>,{' '}
                    <code>POSTGRES_PASSWORD</code>, <code>SESSION_SECRET</code>,{' '}
                    <code>DASHBOARD_URL</code>. Optional integrations like
                    Spotify and Last.fm get their own keys. The full list with
                    notes lives in{' '}
                    <a href='/docs?page=env'>Environment variables</a>.
                </p>
                <p>
                    <code>SESSION_SECRET</code> must be 32+ random bytes.
                    Generate one with <code>openssl rand -hex 32</code>.
                    Rotating it invalidates every dashboard session, so pick
                    once and store it in a secrets manager.
                </p>
                <h2 id='start-the-stack'>Start the stack</h2>
                <pre>
                    <code>{`docker compose pull
docker compose up -d
docker compose ps`}</code>
                </pre>
                <p>
                    You should see <code>lucky-bot</code>,{' '}
                    <code>lucky-backend</code>, <code>lucky-frontend</code>,{' '}
                    <code>lucky-nginx</code>, <code>lucky-postgres</code>, and{' '}
                    <code>lucky-redis</code> all healthy. Healthchecks take
                    10–30 seconds on first boot while postgres applies
                    migrations.
                </p>
                <h2 id='reverse-proxy'>Reverse proxy & TLS</h2>
                <p>
                    nginx in the stack terminates plain HTTP on{' '}
                    <code>:8080</code>. For TLS, put something in front:
                </p>
                <ul>
                    <li>
                        <strong>Cloudflare Tunnel</strong> — easiest, no public
                        IP needed. Install <code>cloudflared</code> on the host,
                        point the tunnel at <code>http://localhost:8080</code>.
                    </li>
                    <li>
                        <strong>Caddy</strong> — drop a one-liner Caddyfile:{' '}
                        <code>
                            your-domain {`{ reverse_proxy localhost:8080 }`}
                        </code>
                        . Caddy handles ACME automatically.
                    </li>
                    <li>
                        <strong>Traefik / nginx-proxy / your own nginx</strong>{' '}
                        — point at <code>localhost:8080</code> and terminate TLS
                        in your own way.
                    </li>
                </ul>
                <h2 id='register-commands'>Register slash commands</h2>
                <p>
                    The bot registers commands automatically on first start,
                    both globally and per-guild for testing. If new commands
                    don't show up, force re-registration with:
                </p>
                <pre>
                    <code>{`docker compose exec bot npm run register-commands`}</code>
                </pre>
                <h2 id='verify'>Verify the install</h2>
                <ol>
                    <li>
                        Open <code>https://your-domain</code>. You should see
                        the landing page.
                    </li>
                    <li>
                        Click <strong>Dashboard</strong>, log in with Discord.
                        You see your guilds.
                    </li>
                    <li>
                        Invite the bot to a test server, run <code>/help</code>.
                        You see the command list.
                    </li>
                    <li>
                        Optional: run <code>/play</code> in a voice channel. If
                        audio works, autoplay and yt-dlp are correctly wired.
                    </li>
                </ol>
                <p>
                    If something fails, jump to{' '}
                    <a href='/docs?page=troubleshooting'>Troubleshooting</a>.
                </p>
            </>
        ),
    },
    {
        slug: 'configuration',
        title: 'Configuration',
        breadcrumb: 'Docs / Configuration',
        toc: [
            { id: 'env-vs-dashboard', label: 'Env vs dashboard' },
            { id: 'feature-toggles', label: 'Feature toggles' },
            { id: 'per-guild', label: 'Per-guild settings' },
            { id: 'global-admin', label: 'Global admin controls' },
        ],
        content: () => (
            <>
                <h2 id='env-vs-dashboard'>Env vs dashboard</h2>
                <p>
                    Two layers of configuration. Env variables are
                    deployment-wide: tokens, ports, secret keys, integration
                    keys. They require a restart. Dashboard settings are
                    per-guild: feature toggles, music rules, auto-mod
                    thresholds, custom commands. They're hot-reloaded.
                </p>
                <p>
                    Rule of thumb: if it'd be the same across every server you
                    run, it's an env var. If you'd set it differently per
                    server, it's in the dashboard.
                </p>
                <h2 id='feature-toggles'>Feature toggles</h2>
                <p>
                    Self-hosters control which modules are even visible in the
                    dashboard via the global toggles in{' '}
                    <strong>Admin / Feature toggles</strong>. Useful if you run
                    a music-only instance or want to hide leveling from your
                    community. Toggles flow through Redis so changes take effect
                    within seconds without restart.
                </p>
                <h2 id='per-guild'>Per-guild settings</h2>
                <p>
                    Every server has its own configuration row: music channel
                    allow-list, auto-mod thresholds, RBAC mapping, autoplay
                    genre seeds, embed templates. Find them under{' '}
                    <strong>Server settings</strong> in the dashboard.
                </p>
                <p>
                    Settings inherit a sane default and are upserted on first
                    write. You don't have to seed defaults — the first time you
                    save anything on a fresh guild, Lucky creates the row and
                    merges your change in.
                </p>
                <h2 id='global-admin'>Global admin controls</h2>
                <p>
                    Add your Discord user ID to <code>ADMIN_USER_IDS</code>{' '}
                    (comma-separated) in the env. Admin users see an extra{' '}
                    <strong>Admin</strong> tab in the dashboard with global
                    feature toggles, a cross-guild override panel, and the Redis
                    cache controls.
                </p>
            </>
        ),
    },
    {
        slug: 'updating',
        title: 'Updating & deploys',
        breadcrumb: 'Docs / Updating & deploys',
        toc: [
            { id: 'manual-pull', label: 'Manual pull' },
            { id: 'webhook', label: 'Webhook deploy' },
            { id: 'rollback', label: 'Rolling back' },
            { id: 'migrations', label: 'Database migrations' },
        ],
        content: () => (
            <>
                <h2 id='manual-pull'>Manual pull</h2>
                <p>For ad-hoc updates:</p>
                <pre>
                    <code>{`git pull
docker compose pull
docker compose up -d`}</code>
                </pre>
                <p>
                    <code>compose up -d</code> only restarts services whose
                    image hash changed, so postgres and redis stay up if only
                    the bot was updated.
                </p>
                <h2 id='webhook'>Webhook deploy</h2>
                <p>
                    Lucky ships a webhook receiver that pulls and restarts on a
                    GitHub Actions ping. The recipe lives in{' '}
                    <code>deploy/</code>. Wire it once, then every push to{' '}
                    <code>main</code> deploys automatically:
                </p>
                <ol>
                    <li>
                        Generate a webhook secret (
                        <code>openssl rand -hex 32</code>).
                    </li>
                    <li>
                        Set the secret in two places: the <code>webhook</code>{' '}
                        service's env, and the
                        <code>DEPLOY_WEBHOOK_URL</code> +{' '}
                        <code>DEPLOY_WEBHOOK_SECRET</code> repo secrets on
                        GitHub.
                    </li>
                    <li>
                        Point the deploy workflow (
                        <code>.github/workflows/deploy.yml</code>) at the
                        webhook URL — whatever the publicly reachable address of
                        the receiver is.
                    </li>
                    <li>
                        Optionally route through a Cloudflare Tunnel so the
                        receiver isn't directly exposed. nginx rewrites{' '}
                        <code>/webhook/*</code> to <code>/hooks/*</code> before
                        proxying.
                    </li>
                </ol>
                <h2 id='rollback'>Rolling back</h2>
                <p>Roll back to a specific tag:</p>
                <pre>
                    <code>{`docker compose pull <service>:<old-tag>
docker compose up -d <service>`}</code>
                </pre>
                <p>
                    Or pin a version in <code>docker-compose.yml</code> and
                    re-up. The bot, backend, and frontend are independently
                    versioned — you can roll back just one.
                </p>
                <h2 id='migrations'>Database migrations</h2>
                <p>
                    Backend runs <code>prisma migrate deploy</code> on every
                    boot. Forward-only — there is no rollback migration. If a
                    release contains a destructive migration the release notes
                    call it out.
                </p>
                <p>
                    To preview migrations before they run, exec into the backend
                    container:{' '}
                    <code>
                        docker compose exec backend npx prisma migrate status
                    </code>
                    .
                </p>
            </>
        ),
    },
    {
        slug: 'backups',
        title: 'Backups',
        breadcrumb: 'Docs / Backups',
        toc: [
            { id: 'what-to-back-up', label: 'What to back up' },
            { id: 'postgres-dump', label: 'Postgres dumps' },
            { id: 'volume-snapshots', label: 'Volume snapshots' },
            { id: 'restore', label: 'Restore' },
        ],
        content: () => (
            <>
                <p>
                    The only durable state is Postgres. Redis is ephemeral by
                    design. Frontend and backend images are rebuildable from
                    git. Back up Postgres and you can recreate everything else
                    from scratch.
                </p>
                <h2 id='what-to-back-up'>What to back up</h2>
                <ul>
                    <li>
                        <strong>Postgres data volume</strong> — the whole guild
                        config, moderation logs, custom commands.
                    </li>
                    <li>
                        <strong>
                            <code>.env</code>
                        </strong>{' '}
                        — your tokens and secrets. Store in a password manager,
                        not in the backup.
                    </li>
                    <li>
                        <strong>
                            <code>docker-compose.override.yml</code>
                        </strong>{' '}
                        if you've customized it.
                    </li>
                </ul>
                <h2 id='postgres-dump'>Postgres dumps</h2>
                <pre>
                    <code>{`docker compose exec postgres pg_dump -U lucky -Fc lucky > backup-$(date +%F).dump`}</code>
                </pre>
                <p>
                    Run from cron or a Healthchecks-pinged script. The custom
                    format (<code>-Fc</code>) is faster to restore and supports
                    parallel restore on large datasets.
                </p>
                <h2 id='volume-snapshots'>Volume snapshots</h2>
                <p>
                    If your host supports snapshots (ZFS, LVM, btrfs, cloud-disk
                    snapshots), snapshot the Docker volume directly. Faster than
                    dumping for very large databases and lets you point-in-time
                    restore.
                </p>
                <h2 id='restore'>Restore</h2>
                <pre>
                    <code>{`docker compose exec -T postgres pg_restore -U lucky -d lucky --clean < backup-2026-05-15.dump`}</code>
                </pre>
                <p>
                    Restart the bot and backend after a restore so they
                    re-establish connections. The frontend doesn't need a
                    restart.
                </p>
            </>
        ),
    },
    {
        slug: 'troubleshooting',
        title: 'Troubleshooting',
        breadcrumb: 'Docs / Troubleshooting',
        toc: [
            { id: 'bot-offline', label: "Bot doesn't come online" },
            { id: 'no-audio', label: 'No audio in voice' },
            { id: 'oauth-fails', label: 'Dashboard OAuth fails' },
            { id: 'commands-missing', label: 'Slash commands missing' },
            { id: 'logs', label: 'Where to look in logs' },
        ],
        content: () => (
            <>
                <h2 id='bot-offline'>Bot doesn't come online</h2>
                <ul>
                    <li>
                        Check <code>docker compose logs bot</code>.
                        Authentication errors print clearly.
                    </li>
                    <li>
                        Verify the <code>DISCORD_TOKEN</code> isn't truncated
                        (Developer Portal tokens are ~70 chars).
                    </li>
                    <li>
                        Confirm Privileged Gateway Intents are enabled in the
                        Developer Portal — missing intents shut the bot down at
                        boot.
                    </li>
                </ul>
                <h2 id='no-audio'>No audio in voice</h2>
                <ul>
                    <li>
                        Most "no audio" issues are yt-dlp. Run{' '}
                        <code>docker compose exec bot yt-dlp --version</code> —
                        should print a date.
                    </li>
                    <li>
                        Update yt-dlp inside the container if it's stale:{' '}
                        <code>
                            docker compose exec bot pip install -U yt-dlp
                        </code>
                        . Lucky now retries failed extractions with exponential
                        backoff, but a multi-month-old yt-dlp still hits walls.
                    </li>
                    <li>
                        Check the bot's voice permissions in your channel (
                        <code>Connect</code>, <code>Speak</code>).
                    </li>
                </ul>
                <h2 id='oauth-fails'>Dashboard OAuth fails</h2>
                <ul>
                    <li>
                        The OAuth redirect URI in the Developer Portal must
                        exactly match{' '}
                        <code>DASHBOARD_URL/api/auth/discord/callback</code>.
                    </li>
                    <li>
                        If you change <code>DASHBOARD_URL</code>, restart the
                        backend so it re-reads the env.
                    </li>
                    <li>
                        Behind a reverse proxy: set <code>trust proxy</code>{' '}
                        upstream so the backend sees the right scheme.
                    </li>
                </ul>
                <h2 id='commands-missing'>Slash commands missing</h2>
                <ul>
                    <li>
                        Global slash command propagation can take up to an hour
                        after registration.
                    </li>
                    <li>
                        Force re-register:{' '}
                        <code>
                            docker compose exec bot npm run register-commands
                        </code>
                        .
                    </li>
                    <li>
                        Per-guild registration is instant. Set{' '}
                        <code>DEV_GUILD_ID</code> in the env if you're
                        iterating.
                    </li>
                </ul>
                <h2 id='logs'>Where to look in logs</h2>
                <ul>
                    <li>
                        <code>docker compose logs -f bot</code> — slash command
                        errors, voice connection, autoplay.
                    </li>
                    <li>
                        <code>docker compose logs -f backend</code> — API
                        errors, Prisma issues, OAuth.
                    </li>
                    <li>
                        <code>docker compose logs -f nginx</code> — 4xx/5xx with
                        paths.
                    </li>
                    <li>
                        <code>docker compose logs -f postgres</code> —
                        migrations, connection pressure.
                    </li>
                </ul>
            </>
        ),
    },
    {
        slug: 'music',
        title: 'Music & autoplay',
        breadcrumb: 'Docs / Music & autoplay',
        toc: [
            { id: 'sources', label: 'Sources' },
            { id: 'queue-control', label: 'Queue control' },
            { id: 'autoplay-mode', label: 'Autoplay' },
            { id: 'preferred-artists', label: 'Preferred artists' },
            { id: 'last-fm', label: 'Last.fm scrobbling' },
            { id: 'spotify-link', label: 'Linking Spotify' },
            { id: 'filters', label: 'Filters & shaping' },
        ],
        content: () => (
            <>
                <p>
                    Lucky plays from Spotify, YouTube, and SoundCloud. It uses{' '}
                    <code>yt-dlp</code> for extraction and bundles its own Opus
                    encoder, so no Lavalink server or external audio service is
                    required.
                </p>
                <h2 id='sources'>Sources</h2>
                <ul>
                    <li>
                        <strong>Spotify.</strong> Paste a track, album, or
                        playlist URL. Lucky resolves the metadata through the
                        Spotify API, then streams audio from a matched source.
                    </li>
                    <li>
                        <strong>YouTube.</strong> Paste a video or playlist URL,
                        or search by title and artist. Returns the top result.
                    </li>
                    <li>
                        <strong>SoundCloud.</strong> Paste a track URL. Useful
                        for sets, bootlegs, and unreleased mixes.
                    </li>
                    <li>
                        <strong>Search.</strong>{' '}
                        <code>/play tame impala let it happen</code> — searches
                        across sources and queues the best match.
                    </li>
                </ul>
                <h2 id='queue-control'>Queue control</h2>
                <ul>
                    <li>
                        <code>/queue</code> — show the queue with pagination.
                    </li>
                    <li>
                        <code>/skip</code> — skip current. Vote-skip kicks in
                        above a configurable channel size.
                    </li>
                    <li>
                        <code>/skipto &lt;n&gt;</code> — skip to the Nth queued
                        track.
                    </li>
                    <li>
                        <code>/pause</code> / <code>/resume</code>.
                    </li>
                    <li>
                        <code>/loop track|queue|off</code> — loop the current
                        track, the whole queue, or disable.
                    </li>
                    <li>
                        <code>/shuffle</code> — shuffle the remainder of the
                        queue.
                    </li>
                    <li>
                        <code>/remove &lt;n&gt;</code> — remove a specific
                        entry.
                    </li>
                    <li>
                        <code>/clear</code> — wipe the queue without leaving
                        voice.
                    </li>
                </ul>
                <h2 id='autoplay-mode'>Autoplay</h2>
                <p>
                    When the queue empties, autoplay picks the next track. It
                    uses Spotify's recommendation engine, scoped to genres and
                    artists already in the queue or in your server's
                    preferred-artists list. Common slop (gospel-reggaeton drift,
                    language jumps mid-session) is filtered out automatically
                    based on the genre fingerprint of recent plays.
                </p>
                <p>
                    Toggle it with <code>/autoplay on</code> or in the dashboard
                    under <strong>Music settings / Autoplay</strong>. Tunable
                    knobs:
                </p>
                <ul>
                    <li>
                        <strong>Genre seeds</strong> — comma-separated Spotify
                        genre slugs the recommender prefers.
                    </li>
                    <li>
                        <strong>Block list</strong> — genres or artists never
                        queued by autoplay.
                    </li>
                    <li>
                        <strong>Recent-skip sensitivity</strong> — how strongly
                        a recent skip biases away from similar tracks.
                    </li>
                    <li>
                        <strong>Language lock</strong> — pin autoplay to the
                        dominant language of the seed track.
                    </li>
                </ul>
                <h2 id='preferred-artists'>Preferred artists</h2>
                <p>
                    Per-server allow-list of artists autoplay prefers. Add via{' '}
                    <strong>Music / Preferred artists</strong> in the dashboard,
                    or with <code>/preferred add</code>. Useful for keeping a
                    server's musical identity intact without micromanaging every
                    play.
                </p>
                <h2 id='last-fm'>Last.fm scrobbling</h2>
                <p>
                    Connect a Last.fm account from the dashboard under{' '}
                    <strong>Integrations / Last.fm</strong>. Lucky scrobbles
                    everything that plays, so your listening history follows you
                    across servers and devices. Per-user, not per-server — each
                    Discord user links their own Last.fm.
                </p>
                <h2 id='spotify-link'>Linking Spotify</h2>
                <p>
                    Linking Spotify unlocks personalized autoplay: Lucky pulls
                    your top tracks and recent saves as additional seeds. Auth
                    is per-user via OAuth; the bot only requests{' '}
                    <code>user-top-read</code> and{' '}
                    <code>user-library-read</code>.
                </p>
                <h2 id='filters'>Filters & shaping</h2>
                <p>
                    Audio filters are off by default. Available via{' '}
                    <code>/filter</code>: bass boost, nightcore, karaoke.
                    Filters apply to the live stream, so you can toggle
                    mid-track. Heavier filters add ~50ms of latency.
                </p>
            </>
        ),
    },
    {
        slug: 'moderation',
        title: 'Moderation',
        breadcrumb: 'Docs / Moderation',
        toc: [
            { id: 'auto-mod', label: 'Auto-mod rules' },
            { id: 'thresholds', label: 'Thresholds & exceptions' },
            { id: 'manual-actions', label: 'Manual actions' },
            { id: 'cases', label: 'Cases & appeals' },
            { id: 'audit', label: 'Audit log' },
            { id: 'logging', label: 'Logging channel' },
        ],
        content: () => (
            <>
                <p>
                    Configure auto-mod per server. Run <code>/automod</code> in
                    chat or open the <strong>Moderation</strong> tab in the
                    dashboard.
                </p>
                <h2 id='auto-mod'>Auto-mod rules</h2>
                <ul>
                    <li>
                        <strong>Spam.</strong> Detects repeated messages,
                        cross-channel spam, and join-spam from new accounts.
                    </li>
                    <li>
                        <strong>Caps.</strong> Flags messages above a
                        configurable caps ratio (default 70%) with a minimum
                        length floor.
                    </li>
                    <li>
                        <strong>Links.</strong> Allow-list and block-list
                        domains. URL shorteners are expanded before checking.
                    </li>
                    <li>
                        <strong>Invites.</strong> Blocks Discord invite links
                        not on your allow-list.
                    </li>
                    <li>
                        <strong>Mentions.</strong> Caps role and user pings per
                        message; punishes mass-ping raids.
                    </li>
                </ul>
                <h2 id='thresholds'>Thresholds & exceptions</h2>
                <p>
                    Each rule has a strikes-to-action map. Default escalation is{' '}
                    <code>warn → mute (10m) → mute (1h) → kick → ban</code>.
                    Tune per rule under{' '}
                    <strong>Moderation / Auto-mod / Escalation</strong>.
                </p>
                <p>
                    Per-rule exceptions: skip a channel, skip a role, or skip a
                    user. Useful for staff channels and bot-account
                    allow-listing.
                </p>
                <h2 id='manual-actions'>Manual actions</h2>
                <p>
                    Run <code>/mod ban</code>, <code>/mod kick</code>,{' '}
                    <code>/mod tempban</code>, <code>/mod warn</code>, or{' '}
                    <code>/mod mute</code>. Each accepts a reason that's sent to
                    the user via DM (if they allow them), written to your audit
                    log, and copied to the Discord audit trail.
                </p>
                <pre>
                    <code>{`/mod tempban @user 7d reason: "raiding from alt account"
/mod warn @user reason: "first warning for caps"`}</code>
                </pre>
                <h2 id='cases'>Cases & appeals</h2>
                <p>
                    Every manual action creates a numbered case. Users can run{' '}
                    <code>/case &lt;id&gt;</code> to see their own case detail,
                    or moderators can run <code>/case @user</code> to see a
                    user's case history. Cases can be edited (
                    <code>/case edit</code>) and appealed (
                    <code>/case appeal</code>).
                </p>
                <h2 id='audit'>Audit log</h2>
                <p>
                    Open <strong>Moderation / Audit</strong> in the dashboard.
                    Filter by moderator, target, action type, or date range.
                    Export as CSV for compliance or community reports.
                </p>
                <h2 id='logging'>Logging channel</h2>
                <p>
                    Set a logging channel under{' '}
                    <strong>Server settings / Logging</strong> and Lucky mirrors
                    every moderation action and auto-mod hit into it. Useful for
                    transparency. Granular toggles let you log only deletions,
                    only bans, or everything.
                </p>
            </>
        ),
    },
    {
        slug: 'custom-commands',
        title: 'Custom commands',
        breadcrumb: 'Docs / Custom commands',
        toc: [
            { id: 'create-one', label: 'Create one' },
            { id: 'variables', label: 'Variables' },
            { id: 'embeds', label: 'Embed responses' },
            { id: 'permissions', label: 'Permissions & scope' },
            { id: 'examples', label: 'Patterns & examples' },
        ],
        content: () => (
            <>
                <p>
                    Build slash commands without writing code. Useful for FAQ
                    replies, role toggles, embed posts, server-specific
                    shortcuts, and quick info lookups.
                </p>
                <h2 id='create-one'>Create one</h2>
                <pre>
                    <code>{`/cc create rules
> response: "Read the rules in #rules-channel, ${'$'}{user}."`}</code>
                </pre>
                <p>
                    Or use the dashboard: <strong>Custom commands / New</strong>
                    . The dashboard form lets you preview the response live with
                    sample variable values.
                </p>
                <h2 id='variables'>Variables</h2>
                <ul>
                    <li>
                        <code>{'{user}'}</code> — the invoking user's mention.
                    </li>
                    <li>
                        <code>{'{user.name}'}</code> — username only.
                    </li>
                    <li>
                        <code>{'{user.id}'}</code> — snowflake ID.
                    </li>
                    <li>
                        <code>{'{user.joinedAt}'}</code> — formatted join date.
                    </li>
                    <li>
                        <code>{'{server}'}</code> — server name.
                    </li>
                    <li>
                        <code>{'{server.memberCount}'}</code> — total members.
                    </li>
                    <li>
                        <code>{'{channel}'}</code> — current channel mention.
                    </li>
                    <li>
                        <code>{'{arg1}'}</code>, <code>{'{arg2}'}</code> ... —
                        positional arguments.
                    </li>
                    <li>
                        <code>{'{args}'}</code> — everything after the command
                        name as one string.
                    </li>
                </ul>
                <h2 id='embeds'>Embed responses</h2>
                <p>
                    Custom commands can return rich embeds. In the dashboard,
                    toggle <strong>Embed mode</strong> on the command and use
                    the embed builder — title, description, color, fields,
                    footer. Variables interpolate inside embed fields too.
                </p>
                <h2 id='permissions'>Permissions & scope</h2>
                <ul>
                    <li>
                        <strong>Role gate.</strong> Restrict who can invoke.
                        Default is everyone.
                    </li>
                    <li>
                        <strong>Channel gate.</strong> Restrict where it can be
                        invoked.
                    </li>
                    <li>
                        <strong>Cooldown.</strong> Per-user or per-channel.
                    </li>
                    <li>
                        <strong>Ephemeral.</strong> Response only visible to the
                        invoker (useful for self-service info).
                    </li>
                </ul>
                <h2 id='examples'>Patterns & examples</h2>
                <p>
                    <strong>Welcome reply</strong>
                </p>
                <pre>
                    <code>{`/cc create welcome
> response: "Welcome to {server}, {user}! Read #rules and grab a role in #pick-roles."`}</code>
                </pre>
                <p>
                    <strong>Repeatable info card</strong> with an embed:
                </p>
                <pre>
                    <code>{`/cc create faq
> embed
> title: "Server FAQ"
> description: "Common questions answered here. {server.memberCount} members and growing."
> color: pink`}</code>
                </pre>
                <p>
                    <strong>Mod-only utility</strong> with a role gate:
                </p>
                <pre>
                    <code>{`/cc create staff-ping
> response: "Heads up @Staff — {user} is asking for help in {channel}."
> roles: [Moderator]`}</code>
                </pre>
            </>
        ),
    },
    {
        slug: 'engagement',
        title: 'Reaction roles & levels',
        breadcrumb: 'Docs / Reaction roles & levels',
        toc: [
            { id: 'reaction-roles', label: 'Reaction roles' },
            { id: 'self-roles', label: 'Self-role panels' },
            { id: 'levels', label: 'Leveling' },
            { id: 'xp-curve', label: 'XP curve & rewards' },
            { id: 'starboard', label: 'Starboard' },
        ],
        content: () => (
            <>
                <h2 id='reaction-roles'>Reaction roles</h2>
                <p>
                    Pin a message and let users self-assign roles by reacting.
                    Configure under <strong>Reaction roles / New</strong>. Each
                    row maps an emoji to a role. Lucky watches the reaction
                    add/remove events and updates membership.
                </p>
                <h2 id='self-roles'>Self-role panels</h2>
                <p>
                    For larger role lists, dashboard panels render as button-row
                    embeds instead of emoji reactions. More accessible and works
                    on mobile without long-press to find emoji.
                </p>
                <h2 id='levels'>Leveling</h2>
                <p>
                    Lucky awards XP for messages and voice activity, with
                    anti-spam dampening (one bucket per minute per user). Check
                    your level with <code>/level</code> or the top scorers with{' '}
                    <code>/leaderboard</code>.
                </p>
                <h2 id='xp-curve'>XP curve & rewards</h2>
                <p>
                    The default curve doubles XP-to-next-level every five
                    levels. Configure the slope under{' '}
                    <strong>Levels / Curve</strong>. Map roles to level
                    thresholds (e.g. <em>Regular</em> at level 10,{' '}
                    <em>Veteran</em> at level 50) so progression is visible
                    without users having to check.
                </p>
                <h2 id='starboard'>Starboard</h2>
                <p>
                    A starboard mirrors popular messages to a dedicated channel.
                    Configure the trigger emoji and minimum reaction count under{' '}
                    <strong>Starboard / Settings</strong>. Per-channel
                    thresholds let you keep meme channels noisy but require more
                    stars in serious channels.
                </p>
            </>
        ),
    },
    {
        slug: 'dashboard',
        title: 'Web dashboard',
        breadcrumb: 'Docs / Web dashboard',
        toc: [
            { id: 'access', label: 'Access' },
            { id: 'modules', label: 'Modules' },
            { id: 'rbac', label: 'Role-based access' },
            { id: 'embed-builder', label: 'Embed builder' },
            { id: 'audit-views', label: 'Audit & history views' },
        ],
        content: () => (
            <>
                <p>
                    The dashboard is the configuration surface. Everything the
                    bot does is configurable from here.
                </p>
                <h2 id='access'>Access</h2>
                <p>
                    Sign in with Discord OAuth at <code>/login</code>. You see
                    every server where you have <code>Manage Server</code> and
                    where Lucky is present. Sessions last 30 days, signed with
                    the server's <code>SESSION_SECRET</code>.
                </p>
                <h2 id='modules'>Modules</h2>
                <ul>
                    <li>
                        <strong>Overview.</strong> Server stats, recent
                        activity, currently playing.
                    </li>
                    <li>
                        <strong>Music.</strong> Queue control, autoplay
                        settings, preferred artists, Spotify link, Last.fm link.
                    </li>
                    <li>
                        <strong>Moderation.</strong> Auto-mod rules, manual
                        actions, audit log, cases.
                    </li>
                    <li>
                        <strong>Custom commands.</strong> Build, edit, and scope
                        custom replies. Live preview.
                    </li>
                    <li>
                        <strong>Reaction roles.</strong> Self-assign roles from
                        emoji reactions or button panels.
                    </li>
                    <li>
                        <strong>Embed builder.</strong> Compose Discord embeds
                        with live preview and saved templates.
                    </li>
                    <li>
                        <strong>Levels.</strong> Curve config, reward roles,
                        leaderboard.
                    </li>
                    <li>
                        <strong>Automation.</strong> Welcome messages, scheduled
                        posts, auto-archives.
                    </li>
                    <li>
                        <strong>Integrations.</strong> Twitch stream
                        notifications, Last.fm linking, Spotify auth.
                    </li>
                </ul>
                <h2 id='rbac'>Role-based access</h2>
                <p>
                    Give different teams different access levels. Server owner
                    has full control. Mods can adjust moderation and custom
                    commands without touching music settings. Read-only access
                    is useful for transparency.
                </p>
                <p>
                    Map under <strong>Server settings / Access control</strong>.
                    Three modes per module: <em>none</em>, <em>view</em>,{' '}
                    <em>edit</em>. Inheritance: a user with edit on a parent
                    module automatically has edit on its children.
                </p>
                <h2 id='embed-builder'>Embed builder</h2>
                <p>
                    Build Discord embeds visually. Title, description, color, up
                    to 25 fields, images, footer, timestamp. Templates are saved
                    per-server and re-sendable with one click. The send target
                    can be any channel Lucky has post access in.
                </p>
                <h2 id='audit-views'>Audit & history views</h2>
                <p>Three views worth knowing:</p>
                <ul>
                    <li>
                        <strong>Moderation audit</strong> — every manual + auto
                        action, filterable and CSV-exportable.
                    </li>
                    <li>
                        <strong>Track history</strong> — every track played per
                        server, with who queued it. Powers leaderboards.
                    </li>
                    <li>
                        <strong>Server logs</strong> — bot-level events: errors,
                        rate limits, deploy events, restarts.
                    </li>
                </ul>
            </>
        ),
    },
    {
        slug: 'commands',
        title: 'Command list',
        breadcrumb: 'Docs / Command list',
        toc: [
            { id: 'music-cmds', label: 'Music' },
            { id: 'mod-cmds', label: 'Moderation' },
            { id: 'utility-cmds', label: 'Utility' },
            { id: 'social-cmds', label: 'Social & engagement' },
            { id: 'admin-cmds', label: 'Admin' },
        ],
        content: () => (
            <>
                <p>
                    The complete list is shipped with the bot. Run{' '}
                    <code>/help</code> in your server for the live version,
                    scoped to your permissions.
                </p>
                <h2 id='music-cmds'>Music</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Command</th>
                            <th>What it does</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <code>/play &lt;query&gt;</code>
                            </td>
                            <td>Queue a track or playlist from any source.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/queue</code>
                            </td>
                            <td>Show the current queue with pagination.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/skip</code>
                            </td>
                            <td>
                                Skip the current track (vote-skip in larger
                                channels).
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <code>/skipto &lt;n&gt;</code>
                            </td>
                            <td>Skip to the Nth queued track.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/pause</code> / <code>/resume</code>
                            </td>
                            <td>Pause and resume playback.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/loop track|queue|off</code>
                            </td>
                            <td>Configure looping.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/shuffle</code>
                            </td>
                            <td>Shuffle the remainder of the queue.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/remove &lt;n&gt;</code>
                            </td>
                            <td>Remove a specific entry.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/clear</code>
                            </td>
                            <td>Empty the queue (stays in voice).</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/autoplay on|off</code>
                            </td>
                            <td>Toggle autoplay.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/nowplaying</code>
                            </td>
                            <td>Show the current track and progress.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/lyrics</code>
                            </td>
                            <td>Show synced lyrics from Genius.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/artist &lt;name&gt;</code>
                            </td>
                            <td>Artist info, top tracks, related artists.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/album &lt;name&gt;</code>
                            </td>
                            <td>Album info with track listings.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/filter &lt;name&gt;</code>
                            </td>
                            <td>
                                Apply audio filters (bass, nightcore, karaoke).
                            </td>
                        </tr>
                    </tbody>
                </table>
                <h2 id='mod-cmds'>Moderation</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Command</th>
                            <th>What it does</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <code>/mod ban</code>
                            </td>
                            <td>
                                Permanent ban with reason and audit-log entry.
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <code>/mod kick</code>
                            </td>
                            <td>Kick from the server.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/mod tempban</code>
                            </td>
                            <td>Temporary ban with auto-revoke.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/mod mute</code>
                            </td>
                            <td>Discord timeout with duration.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/mod warn</code>
                            </td>
                            <td>Warn a user, DM them, log it.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/case &lt;id|user&gt;</code>
                            </td>
                            <td>Look up moderation cases.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/automod</code>
                            </td>
                            <td>Open the auto-mod config in chat.</td>
                        </tr>
                    </tbody>
                </table>
                <h2 id='utility-cmds'>Utility</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Command</th>
                            <th>What it does</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <code>/cc create</code>
                            </td>
                            <td>Build a custom command.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/cc edit</code>
                            </td>
                            <td>Edit an existing custom command.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/cc delete</code>
                            </td>
                            <td>Delete a custom command.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/embed</code>
                            </td>
                            <td>Send a rich embed via the builder.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/role</code>
                            </td>
                            <td>Manage role assignments.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/help</code>
                            </td>
                            <td>Show the full command list.</td>
                        </tr>
                    </tbody>
                </table>
                <h2 id='social-cmds'>Social & engagement</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Command</th>
                            <th>What it does</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <code>/level</code>
                            </td>
                            <td>Show your level and XP toward the next.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/leaderboard</code>
                            </td>
                            <td>Top members by XP, tracks, or artists.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/birthday set</code>
                            </td>
                            <td>Set your birthday (month + day only).</td>
                        </tr>
                        <tr>
                            <td>
                                <code>
                                    /social hug|pat|kiss|dance|bonk|wave
                                </code>
                            </td>
                            <td>Roleplay reaction commands.</td>
                        </tr>
                    </tbody>
                </table>
                <h2 id='admin-cmds'>Admin</h2>
                <p>
                    Visible only to users in <code>ADMIN_USER_IDS</code>{' '}
                    (self-hosted) or server owners.
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>Command</th>
                            <th>What it does</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <code>/admin toggle &lt;feature&gt;</code>
                            </td>
                            <td>Global feature toggle.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/admin cache flush</code>
                            </td>
                            <td>Flush the Redis cache.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>/admin reload</code>
                            </td>
                            <td>Reload guild config from the database.</td>
                        </tr>
                    </tbody>
                </table>
            </>
        ),
    },
    {
        slug: 'permissions',
        title: 'Permissions',
        breadcrumb: 'Docs / Permissions',
        toc: [
            { id: 'discord-perms', label: 'Discord permissions Lucky needs' },
            { id: 'principle', label: 'Principle of least privilege' },
            { id: 'dashboard-rbac', label: 'Dashboard RBAC' },
            { id: 'admin-tier', label: 'Admin tier' },
        ],
        content: () => (
            <>
                <h2 id='discord-perms'>Discord permissions Lucky needs</h2>
                <ul>
                    <li>
                        <strong>Read Messages / Send Messages.</strong> For
                        slash command responses.
                    </li>
                    <li>
                        <strong>Embed Links.</strong> For embed-builder posts
                        and rich responses.
                    </li>
                    <li>
                        <strong>Attach Files.</strong> For exporting CSVs,
                        lyrics, and album art.
                    </li>
                    <li>
                        <strong>Connect / Speak.</strong> For voice channel
                        playback.
                    </li>
                    <li>
                        <strong>Use Voice Activity / Priority Speaker.</strong>{' '}
                        Quality-of-life for music.
                    </li>
                    <li>
                        <strong>Manage Messages.</strong> For auto-mod deletion.
                    </li>
                    <li>
                        <strong>Kick / Ban / Moderate Members.</strong> For
                        moderation commands.
                    </li>
                    <li>
                        <strong>Manage Roles.</strong> For reaction roles and
                        role-rewards on level-up. Lucky's role must be above any
                        role it manages.
                    </li>
                    <li>
                        <strong>Read Message History.</strong> For starboard and
                        audit features.
                    </li>
                    <li>
                        <strong>Add Reactions.</strong> For starboard mirroring
                        and self-role panels.
                    </li>
                </ul>
                <h2 id='principle'>Principle of least privilege</h2>
                <p>
                    The OAuth invite asks for what Lucky <em>can</em> use, not
                    what it <em>requires</em>. If you don't use moderation, deny{' '}
                    <code>Kick / Ban</code>. If you don't use reaction roles,
                    deny <code>Manage Roles</code>. Re-invite at any time to
                    change the grant.
                </p>
                <h2 id='dashboard-rbac'>Dashboard RBAC</h2>
                <p>
                    The dashboard maps Discord roles to module access. Configure
                    under <strong>Server settings / Access control</strong>.
                    Three modes per module: <em>none</em>, <em>view</em>,{' '}
                    <em>edit</em>. Common patterns:
                </p>
                <ul>
                    <li>
                        <strong>Server owner</strong> — full control.
                    </li>
                    <li>
                        <strong>Mods</strong> — edit on moderation + custom
                        commands + audit. View on music.
                    </li>
                    <li>
                        <strong>DJs</strong> — edit on music + preferred
                        artists. None elsewhere.
                    </li>
                    <li>
                        <strong>Members</strong> — view on overview, none
                        elsewhere.
                    </li>
                </ul>
                <h2 id='admin-tier'>Admin tier</h2>
                <p>
                    Self-hosters can mark Discord user IDs as global admins via{' '}
                    <code>ADMIN_USER_IDS</code>. Admins bypass per-guild RBAC
                    and see global feature toggles. The hosted Lucky has zero
                    admin user IDs in production — there is no behind-the-scenes
                    peek into your server.
                </p>
            </>
        ),
    },
    {
        slug: 'env',
        title: 'Environment variables',
        breadcrumb: 'Docs / Environment variables',
        toc: [
            { id: 'required', label: 'Required' },
            { id: 'optional', label: 'Optional' },
            { id: 'tuning', label: 'Tuning & operational' },
            { id: 'rotating-secrets', label: 'Rotating secrets' },
        ],
        content: () => (
            <>
                <p>
                    Used only when self-hosting. The hosted Lucky is
                    preconfigured.
                </p>
                <h2 id='required'>Required</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Variable</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <code>DISCORD_TOKEN</code>
                            </td>
                            <td>Bot token from the Developer Portal.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>DISCORD_CLIENT_ID</code>
                            </td>
                            <td>Application client ID.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>DISCORD_CLIENT_SECRET</code>
                            </td>
                            <td>For OAuth on the dashboard.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>POSTGRES_PASSWORD</code>
                            </td>
                            <td>Set in compose or the .env.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>SESSION_SECRET</code>
                            </td>
                            <td>
                                32+ random bytes.{' '}
                                <code>openssl rand -hex 32</code>.
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <code>DASHBOARD_URL</code>
                            </td>
                            <td>
                                Public URL of the dashboard. Used for OAuth
                                redirects and CORS.
                            </td>
                        </tr>
                    </tbody>
                </table>
                <h2 id='optional'>Optional</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Variable</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <code>SPOTIFY_CLIENT_ID</code> /{' '}
                                <code>SPOTIFY_CLIENT_SECRET</code>
                            </td>
                            <td>
                                Enables Spotify-fed autoplay and per-user
                                Spotify linking.
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <code>LASTFM_API_KEY</code>
                            </td>
                            <td>Enables Last.fm scrobbling.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>GENIUS_TOKEN</code>
                            </td>
                            <td>
                                Enables <code>/lyrics</code>.
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <code>TWITCH_CLIENT_ID</code> /{' '}
                                <code>TWITCH_CLIENT_SECRET</code>
                            </td>
                            <td>Enables Twitch stream notifications.</td>
                        </tr>
                        <tr>
                            <td>
                                <code>ADMIN_USER_IDS</code>
                            </td>
                            <td>
                                Comma-separated Discord IDs that get global
                                admin in the dashboard.
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <code>DEV_GUILD_ID</code>
                            </td>
                            <td>
                                Guild for instant slash-command registration
                                during development.
                            </td>
                        </tr>
                    </tbody>
                </table>
                <h2 id='tuning'>Tuning & operational</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Variable</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <code>NGINX_PORT</code>
                            </td>
                            <td>
                                Reverse-proxy port. Default <code>8080</code>.
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <code>BOT_SHARDS</code>
                            </td>
                            <td>
                                Shard count for very large deployments. Default
                                auto.
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <code>LOG_LEVEL</code>
                            </td>
                            <td>
                                <code>debug</code>, <code>info</code>,{' '}
                                <code>warn</code>, <code>error</code>. Default{' '}
                                <code>info</code>.
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <code>NODE_ENV</code>
                            </td>
                            <td>
                                <code>production</code> for self-hosted
                                deployments.
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <code>DEPLOY_WEBHOOK_SECRET</code>
                            </td>
                            <td>
                                For the auto-deploy receiver. See{' '}
                                <a href='/docs?page=updating'>Updating</a>.
                            </td>
                        </tr>
                    </tbody>
                </table>
                <h2 id='rotating-secrets'>Rotating secrets</h2>
                <ul>
                    <li>
                        <strong>SESSION_SECRET</strong> — rotates invalidate
                        every dashboard session. Pick a quiet hour.
                    </li>
                    <li>
                        <strong>DISCORD_TOKEN</strong> — rotates kick the bot
                        off the gateway. Bot will reconnect on restart.
                    </li>
                    <li>
                        <strong>POSTGRES_PASSWORD</strong> — rotate inside
                        postgres first (<code>ALTER USER</code>), then update
                        the env and restart backend + bot.
                    </li>
                </ul>
            </>
        ),
    },
    {
        slug: 'integrations',
        title: 'Integrations',
        breadcrumb: 'Docs / Integrations',
        toc: [
            { id: 'spotify', label: 'Spotify' },
            { id: 'lastfm', label: 'Last.fm' },
            { id: 'twitch', label: 'Twitch' },
            { id: 'genius', label: 'Genius (lyrics)' },
        ],
        content: () => (
            <>
                <h2 id='spotify'>Spotify</h2>
                <p>
                    Spotify powers autoplay recommendations and lets users link
                    their account for personalized autoplay seeds. Get keys from{' '}
                    <a
                        href='https://developer.spotify.com/dashboard'
                        rel='noreferrer noopener'
                        target='_blank'
                    >
                        Spotify for Developers
                    </a>
                    . Add the redirect URI{' '}
                    <code>DASHBOARD_URL/api/integrations/spotify/callback</code>{' '}
                    to the app settings.
                </p>
                <h2 id='lastfm'>Last.fm</h2>
                <p>
                    Last.fm scrobbles every track Lucky plays for users who've
                    linked their account. Get an API key from{' '}
                    <a
                        href='https://www.last.fm/api/account/create'
                        rel='noreferrer noopener'
                        target='_blank'
                    >
                        last.fm/api
                    </a>
                    . No callback URL needed — auth is via username + session
                    token.
                </p>
                <h2 id='twitch'>Twitch</h2>
                <p>
                    Twitch integration pushes stream-start notifications into a
                    Discord channel. Configure under{' '}
                    <strong>Integrations / Twitch</strong>. Get keys from{' '}
                    <a
                        href='https://dev.twitch.tv/console/apps'
                        rel='noreferrer noopener'
                        target='_blank'
                    >
                        Twitch Developer Console
                    </a>
                    .
                </p>
                <h2 id='genius'>Genius (lyrics)</h2>
                <p>
                    Enables synced lyrics via <code>/lyrics</code>. Get a token
                    from{' '}
                    <a
                        href='https://genius.com/api-clients'
                        rel='noreferrer noopener'
                        target='_blank'
                    >
                        Genius API clients
                    </a>
                    . No callback or per-user linking — one server-wide key
                    powers the lookups.
                </p>
            </>
        ),
    },
    {
        slug: 'faq',
        title: 'FAQ',
        breadcrumb: 'Docs / FAQ',
        toc: [
            { id: 'cost', label: 'Is Lucky really free?' },
            { id: 'limits', label: 'Are there server-size limits?' },
            { id: 'data', label: 'What data does Lucky collect?' },
            { id: 'voice-quality', label: 'Why does my voice quality differ?' },
            { id: 'lavalink', label: 'Do I need Lavalink?' },
            { id: 'contribute', label: 'Can I contribute?' },
        ],
        content: () => (
            <>
                <h2 id='cost'>Is Lucky really free?</h2>
                <p>
                    Yes. ISC source. No premium tier on the hosted instance, no
                    paywalled features, no "supporter" perks. If you self-host,
                    you pay for your own hardware and that's it.
                </p>
                <h2 id='limits'>Are there server-size limits?</h2>
                <p>
                    No hard limits. The hosted Lucky has been tested on servers
                    up to ~50k members. Beyond that, you'll want to self-host
                    with sharding (<code>BOT_SHARDS</code>) for headroom.
                </p>
                <h2 id='data'>What data does Lucky collect?</h2>
                <p>
                    The minimum needed to function — see the{' '}
                    <a href='/privacy'>Privacy Policy</a>. On the hosted
                    instance: Discord identifiers, guild IDs, configuration
                    data, moderation cases, optional integration data. On
                    self-hosted: same data, but it lives in your Postgres, not
                    ours.
                </p>
                <h2 id='voice-quality'>Why does my voice quality differ?</h2>
                <p>
                    Voice quality follows Discord's per-channel bitrate setting.
                    Lucky encodes at the channel bitrate up to 96 kbps. Boost
                    the channel's bitrate (Channel settings / Bitrate) for
                    higher fidelity.
                </p>
                <h2 id='lavalink'>Do I need Lavalink?</h2>
                <p>
                    No. Lucky ships its own Opus encoder via prebuilt binaries,
                    so there's no Java sidecar to run. That means a smaller
                    stack, less to monitor, and faster local dev.
                </p>
                <h2 id='contribute'>Can I contribute?</h2>
                <p>
                    Yes — issues, PRs, and feature requests are welcome at{' '}
                    <a href={REPO} rel='noreferrer noopener' target='_blank'>
                        {REPO}
                    </a>
                    . Read <code>CONTRIBUTING.md</code> for the local dev setup
                    and code style.
                </p>
            </>
        ),
    },
]

function pageFromSlug(slug: string | null): DocsPage {
    return PAGES.find((p) => p.slug === slug) ?? PAGES[0]!
}

export default function Docs() {
    const [searchParams] = useSearchParams()
    const page = useMemo(
        () => pageFromSlug(searchParams.get('page')),
        [searchParams],
    )

    usePageMetadata({
        title: `${page.title} — Lucky docs`,
        description: `${page.title} documentation for Lucky, the open-source self-hostable Discord bot.`,
    })

    const Content = page.content

    return (
        <DocsShell
            nav={NAV}
            breadcrumb={page.breadcrumb}
            title={page.title}
            toc={page.toc}
        >
            <Content />
        </DocsShell>
    )
}
