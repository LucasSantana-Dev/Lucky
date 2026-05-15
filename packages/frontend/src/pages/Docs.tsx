import { useMemo, type ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import DocsShell, { type DocsNavGroup, type DocsTocItem } from '@/components/DocsShell/DocsShell'

type DocsPage = {
    slug: string
    title: string
    breadcrumb: string
    toc: DocsTocItem[]
    content: () => ReactElement
}

const REPO = 'https://github.com/LucasSantana-Dev/Lucky'
const BOT_INVITE = 'https://discord.com/oauth2/authorize?client_id=962198089161134131&scope=bot%20applications.commands&permissions=8'

const NAV: DocsNavGroup[] = [
    {
        heading: 'Getting started',
        items: [
            { label: 'Overview', href: '/docs?page=overview' },
            { label: 'Quick start', href: '/docs?page=quickstart' },
            { label: 'Self-host', href: '/docs?page=self-host' },
        ],
    },
    {
        heading: 'Using Lucky',
        items: [
            { label: 'Music & autoplay', href: '/docs?page=music' },
            { label: 'Moderation', href: '/docs?page=moderation' },
            { label: 'Custom commands', href: '/docs?page=custom-commands' },
            { label: 'Web dashboard', href: '/docs?page=dashboard' },
        ],
    },
    {
        heading: 'Reference',
        items: [
            { label: 'Command list', href: '/docs?page=commands' },
            { label: 'Permissions', href: '/docs?page=permissions' },
            { label: 'Environment variables', href: '/docs?page=env' },
        ],
    },
    {
        heading: 'External',
        items: [
            { label: 'GitHub repo', href: REPO, external: true },
            { label: 'Changelog', href: '/changelog' },
            { label: 'Discord support', href: 'https://discord.gg/lucky', external: true },
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
        ],
        content: () => (
            <>
                <p>
                    Lucky is an open-source Discord bot. Music, moderation, custom commands, and a web dashboard.
                    Free forever, with no premium tier paywalling the good parts.
                </p>
                <h2 id='what-is-lucky'>What is Lucky</h2>
                <p>
                    Lucky started as a music bot. It now also handles moderation, custom commands, automation, role gating,
                    and reaction roles. The web dashboard at the same domain lets you configure everything without leaving
                    the browser.
                </p>
                <p>
                    The codebase is a TypeScript monorepo published under the Apache 2.0 license. Anyone can fork it,
                    audit it, or self-host their own instance.
                </p>
                <h2 id='two-ways-to-run-it'>Two ways to run it</h2>
                <p>You can use Lucky in either of two ways. Pick whichever fits your situation.</p>
                <ol>
                    <li>
                        <strong>Hosted.</strong> Click <a href={BOT_INVITE} rel='noreferrer noopener' target='_blank'>Add to Discord</a>,
                        pick the server, accept the permissions. The bot joins, you open the dashboard, and you're configuring within a minute.
                    </li>
                    <li>
                        <strong>Self-hosted.</strong> Clone the repo, copy <code>.env.example</code> to <code>.env</code>, run{' '}
                        <code>docker compose up</code>. The bot runs on your box. Your guild data stays on your hardware. See{' '}
                        <a href='/docs?page=self-host'>Self-host</a> for the full setup.
                    </li>
                </ol>
                <h2 id='whats-included'>What's included</h2>
                <ul>
                    <li>Slash commands for music, moderation, and utility (100+ in total).</li>
                    <li>Autoplay with Spotify-fed recommendations and Last.fm scrobbling.</li>
                    <li>Auto-mod for spam, caps, links, and invites with per-server rules.</li>
                    <li>Custom command builder with variable interpolation.</li>
                    <li>Embed builder with live preview and saved templates.</li>
                    <li>Reaction roles, role gating, leveling, and starboard.</li>
                    <li>A React dashboard for configuring everything from your browser.</li>
                </ul>
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
        ],
        content: () => (
            <>
                <p>You'll be running Lucky in your server in under two minutes. No account creation, no payment, no email.</p>
                <h2 id='add-the-bot'>Add the bot</h2>
                <ol>
                    <li>
                        Click <a href={BOT_INVITE} rel='noreferrer noopener' target='_blank'>Add to Discord</a>.
                    </li>
                    <li>Pick the server. You need <code>Manage Server</code> on it.</li>
                    <li>Accept the requested permissions. The bot joins immediately.</li>
                </ol>
                <h2 id='open-the-dashboard'>Open the dashboard</h2>
                <p>
                    Go to the homepage and click <strong>Dashboard</strong> in the top right, or go directly to{' '}
                    <code>/login</code>. Authorize with Discord OAuth. You'll see the server you just added the bot to.
                </p>
                <h2 id='first-commands' >First commands to try</h2>
                <ul>
                    <li>
                        <code>/play tame impala let it happen</code> — join voice and queue a track.
                    </li>
                    <li>
                        <code>/autoplay on</code> — keep music going when the queue ends.
                    </li>
                    <li>
                        <code>/queue</code> — see what's coming up.
                    </li>
                    <li>
                        <code>/cc create welcome &quot;Welcome to {'{server}'}, {'{user}'}!&quot;</code> — make a custom command.
                    </li>
                </ul>
            </>
        ),
    },
    {
        slug: 'self-host',
        title: 'Self-host',
        breadcrumb: 'Docs / Self-host',
        toc: [
            { id: 'requirements', label: 'Requirements' },
            { id: 'discord-app', label: 'Create a Discord app' },
            { id: 'clone-and-configure', label: 'Clone and configure' },
            { id: 'start-the-stack', label: 'Start the stack' },
            { id: 'updating', label: 'Updating' },
        ],
        content: () => (
            <>
                <p>
                    Self-hosting means you run Lucky on your own hardware. Your guild data, autoplay history, custom
                    commands, and moderation log stay on your box. No third-party ToS over your community.
                </p>
                <h2 id='requirements'>Requirements</h2>
                <ul>
                    <li>A Linux server (Debian, Ubuntu, or any docker-compatible distro).</li>
                    <li><code>docker</code> and <code>docker compose</code> v2+ installed.</li>
                    <li>~2 GB RAM, ~5 GB disk. More if you log a lot.</li>
                    <li>A Discord application with a bot token. See below.</li>
                </ul>
                <h2 id='discord-app'>Create a Discord app</h2>
                <ol>
                    <li>Go to <a href='https://discord.com/developers/applications' rel='noreferrer noopener' target='_blank'>Discord Developer Portal</a>.</li>
                    <li>Click <strong>New Application</strong>, name it.</li>
                    <li>Under <strong>Bot</strong>, click <strong>Reset Token</strong> and copy it.</li>
                    <li>Under <strong>OAuth2 / URL Generator</strong>, pick <code>bot</code> + <code>applications.commands</code> scopes and the permissions you want.</li>
                </ol>
                <h2 id='clone-and-configure'>Clone and configure</h2>
                <pre>
                    <code>{`git clone ${REPO}.git lucky
cd lucky
cp .env.example .env
$EDITOR .env`}</code>
                </pre>
                <p>
                    Required env vars: <code>DISCORD_TOKEN</code>, <code>DISCORD_CLIENT_ID</code>, <code>DISCORD_CLIENT_SECRET</code>,{' '}
                    <code>POSTGRES_PASSWORD</code>, <code>SESSION_SECRET</code>. The full list is documented in{' '}
                    <a href='/docs?page=env'>Environment variables</a>.
                </p>
                <h2 id='start-the-stack'>Start the stack</h2>
                <pre>
                    <code>{`docker compose up -d
docker compose ps`}</code>
                </pre>
                <p>
                    You should see <code>lucky-bot</code>, <code>lucky-backend</code>, <code>lucky-frontend</code>,{' '}
                    <code>lucky-nginx</code>, <code>lucky-postgres</code>, and <code>lucky-redis</code> all healthy.
                </p>
                <p>
                    The dashboard is served on port <code>8090</code> by default. Point your reverse proxy at it, or
                    expose it directly. The bot will appear online in any server you invite it to.
                </p>
                <h2 id='updating'>Updating</h2>
                <pre>
                    <code>{`git pull
docker compose pull
docker compose up -d`}</code>
                </pre>
                <p>
                    Or set up the webhook receiver for push-to-deploy. The repo includes a <code>deploy/</code> directory with
                    the webhook config that listens for GitHub Actions builds and pulls the new images automatically.
                </p>
            </>
        ),
    },
    {
        slug: 'music',
        title: 'Music & autoplay',
        breadcrumb: 'Docs / Music & autoplay',
        toc: [
            { id: 'sources', label: 'Sources' },
            { id: 'autoplay-mode', label: 'Autoplay' },
            { id: 'last-fm', label: 'Last.fm scrobbling' },
        ],
        content: () => (
            <>
                <p>
                    Lucky plays from Spotify, YouTube, and SoundCloud. It uses <code>yt-dlp</code> for extraction and
                    bundles its own Opus encoder, so no Lavalink server is required.
                </p>
                <h2 id='sources'>Sources</h2>
                <ul>
                    <li><strong>Spotify.</strong> Paste a track, album, or playlist URL. Lucky resolves and queues it.</li>
                    <li><strong>YouTube.</strong> Paste a video or playlist URL, or search by title.</li>
                    <li><strong>SoundCloud.</strong> Paste a track URL. Useful for sets and bootlegs.</li>
                </ul>
                <h2 id='autoplay-mode'>Autoplay</h2>
                <p>
                    When the queue empties, autoplay picks the next track. It uses Spotify's recommendation engine, scoped
                    to genres and artists already in the queue or in your server's preferred-artists list. Common slop
                    (gospel reggaeton drift, language jumps) is filtered out automatically.
                </p>
                <p>
                    Toggle it with <code>/autoplay on</code> or in the dashboard under <strong>Music settings</strong>.
                </p>
                <h2 id='last-fm'>Last.fm scrobbling</h2>
                <p>
                    Connect a Last.fm account from the dashboard. Lucky scrobbles everything that plays, so your listening
                    history follows you across servers and devices.
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
            { id: 'manual-actions', label: 'Manual actions' },
            { id: 'audit', label: 'Audit log' },
        ],
        content: () => (
            <>
                <p>
                    Configure auto-mod per server. Run <code>/automod</code> in chat or open the <strong>Moderation</strong>{' '}
                    tab in the dashboard.
                </p>
                <h2 id='auto-mod'>Auto-mod rules</h2>
                <ul>
                    <li><strong>Spam.</strong> Detect repeated messages and cross-channel spam.</li>
                    <li><strong>Caps.</strong> Flag messages above a configurable caps ratio.</li>
                    <li><strong>Links.</strong> Allow-list and block-list domains.</li>
                    <li><strong>Invites.</strong> Block Discord invite links not on your allow-list.</li>
                </ul>
                <h2 id='manual-actions'>Manual actions</h2>
                <p>
                    Run <code>/mod ban</code>, <code>/mod kick</code>, <code>/mod tempban</code>, or <code>/mod warn</code>.
                    Each accepts a reason that's sent to the user via DM (if they allow them), written to your audit log,
                    and copied to the Discord audit trail.
                </p>
                <h2 id='audit'>Audit log</h2>
                <p>
                    Open <strong>Moderation / Audit</strong> in the dashboard. Filter by moderator, target, action type, or
                    date range. Export as CSV.
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
            { id: 'permissions', label: 'Permissions' },
        ],
        content: () => (
            <>
                <p>
                    Build slash commands without writing code. Useful for FAQ replies, role toggles, embed posts, and
                    server-specific shortcuts.
                </p>
                <h2 id='create-one'>Create one</h2>
                <pre>
                    <code>{`/cc create rules
> response: "Read the rules in #rules-channel, ${'$'}{user}."`}</code>
                </pre>
                <p>Or use the dashboard: <strong>Custom commands / New</strong>.</p>
                <h2 id='variables'>Variables</h2>
                <ul>
                    <li><code>{'{user}'}</code> — the invoking user's mention.</li>
                    <li><code>{'{user.name}'}</code> — username only.</li>
                    <li><code>{'{server}'}</code> — server name.</li>
                    <li><code>{'{channel}'}</code> — current channel mention.</li>
                    <li><code>{'{arg1}'}</code>, <code>{'{arg2}'}</code> — positional arguments.</li>
                </ul>
                <h2 id='permissions'>Permissions</h2>
                <p>
                    Scope each command to a role or channel. The default is everyone. Useful for staff-only utilities or
                    channel-specific posts.
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
        ],
        content: () => (
            <>
                <p>The dashboard is the configuration surface. Everything the bot does is configurable from here.</p>
                <h2 id='access'>Access</h2>
                <p>
                    Sign in with Discord OAuth at <code>/login</code>. You see every server where you have{' '}
                    <code>Manage Server</code> and where Lucky is present.
                </p>
                <h2 id='modules'>Modules</h2>
                <ul>
                    <li><strong>Overview.</strong> Server stats, recent activity, currently playing.</li>
                    <li><strong>Music.</strong> Queue control, autoplay settings, preferred artists.</li>
                    <li><strong>Moderation.</strong> Auto-mod rules, manual actions, audit log.</li>
                    <li><strong>Custom commands.</strong> Build, edit, and scope custom replies.</li>
                    <li><strong>Reaction roles.</strong> Self-assign roles from emoji reactions.</li>
                    <li><strong>Embed builder.</strong> Compose Discord embeds with live preview.</li>
                </ul>
                <h2 id='rbac'>Role-based access</h2>
                <p>
                    Give different teams different access levels. Server owner has full control. Mods can adjust moderation
                    and custom commands without touching music settings. Read-only for transparency.
                </p>
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
        ],
        content: () => (
            <>
                <p>The complete list is shipped with the bot. Run <code>/help</code> in your server for the live version.</p>
                <h2 id='music-cmds'>Music</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Command</th>
                            <th>What it does</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td><code>/play</code></td><td>Queue a track or playlist.</td></tr>
                        <tr><td><code>/queue</code></td><td>Show the current queue.</td></tr>
                        <tr><td><code>/skip</code></td><td>Skip the current track (vote-skip in larger channels).</td></tr>
                        <tr><td><code>/autoplay</code></td><td>Toggle autoplay.</td></tr>
                        <tr><td><code>/nowplaying</code></td><td>Show the current track and progress.</td></tr>
                        <tr><td><code>/lyrics</code></td><td>Show synced lyrics from Genius.</td></tr>
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
                        <tr><td><code>/mod ban</code></td><td>Permanent ban with reason and audit-log entry.</td></tr>
                        <tr><td><code>/mod kick</code></td><td>Kick from the server.</td></tr>
                        <tr><td><code>/mod tempban</code></td><td>Temporary ban with auto-revoke.</td></tr>
                        <tr><td><code>/mod warn</code></td><td>Warn a user, DM them, log it.</td></tr>
                        <tr><td><code>/automod</code></td><td>Open the auto-mod config.</td></tr>
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
                        <tr><td><code>/cc create</code></td><td>Build a custom command.</td></tr>
                        <tr><td><code>/embed</code></td><td>Send a rich embed.</td></tr>
                        <tr><td><code>/role</code></td><td>Manage role assignments.</td></tr>
                        <tr><td><code>/help</code></td><td>Show the full command list.</td></tr>
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
            { id: 'dashboard-rbac', label: 'Dashboard RBAC' },
        ],
        content: () => (
            <>
                <h2 id='discord-perms'>Discord permissions Lucky needs</h2>
                <ul>
                    <li><strong>Read Messages / Send Messages.</strong> For slash command responses.</li>
                    <li><strong>Connect / Speak.</strong> For voice channel playback.</li>
                    <li><strong>Manage Messages.</strong> For auto-mod deletion.</li>
                    <li><strong>Kick / Ban / Moderate Members.</strong> For moderation commands.</li>
                    <li><strong>Manage Roles.</strong> For reaction roles. Lucky's role must be above any role it manages.</li>
                </ul>
                <h2 id='dashboard-rbac'>Dashboard RBAC</h2>
                <p>
                    The dashboard maps Discord roles to module access. Configure under{' '}
                    <strong>Server settings / Access control</strong>. Common patterns:
                </p>
                <ul>
                    <li>Server owner: full control.</li>
                    <li>Mods: moderation, custom commands, audit log.</li>
                    <li>DJs: music settings, queue, preferred artists.</li>
                    <li>Members: read-only overview.</li>
                </ul>
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
        ],
        content: () => (
            <>
                <p>Used only when self-hosting. The hosted version is preconfigured.</p>
                <h2 id='required'>Required</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Variable</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td><code>DISCORD_TOKEN</code></td><td>Bot token from the Developer Portal.</td></tr>
                        <tr><td><code>DISCORD_CLIENT_ID</code></td><td>Application client ID.</td></tr>
                        <tr><td><code>DISCORD_CLIENT_SECRET</code></td><td>For OAuth on the dashboard.</td></tr>
                        <tr><td><code>POSTGRES_PASSWORD</code></td><td>Set in the compose file or the .env.</td></tr>
                        <tr><td><code>SESSION_SECRET</code></td><td>32+ random bytes. Used for cookie signing.</td></tr>
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
                        <tr><td><code>SPOTIFY_CLIENT_ID</code> / <code>SPOTIFY_CLIENT_SECRET</code></td><td>Enables Spotify-fed autoplay.</td></tr>
                        <tr><td><code>LASTFM_API_KEY</code></td><td>Enables Last.fm scrobbling.</td></tr>
                        <tr><td><code>GENIUS_TOKEN</code></td><td>Enables <code>/lyrics</code>.</td></tr>
                        <tr><td><code>NGINX_PORT</code></td><td>Reverse-proxy port. Default <code>8080</code>.</td></tr>
                    </tbody>
                </table>
            </>
        ),
    },
]

function pageFromSlug(slug: string | null): DocsPage {
    return PAGES.find((p) => p.slug === slug) ?? PAGES[0]!
}

export default function Docs() {
    const [searchParams] = useSearchParams()
    const page = useMemo(() => pageFromSlug(searchParams.get('page')), [searchParams])

    usePageMetadata({
        title: `${page.title} — Lucky docs`,
        description: `${page.title} documentation for Lucky, the open-source self-hostable Discord bot.`,
    })

    const Content = page.content

    return (
        <DocsShell nav={NAV} breadcrumb={page.breadcrumb} title={page.title} toc={page.toc}>
            <Content />
        </DocsShell>
    )
}
