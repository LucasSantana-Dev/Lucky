import { SUPPORT_SERVER_INVITE_URL } from '@lucky/shared/constants'
import DocsShell, { type DocsTocItem } from '@/components/DocsShell/DocsShell'
import { LEGAL_NAV } from '@/components/DocsShell/legalNav'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { metaFor } from '@/lib/seo/routeMeta'

const ISSUES_URL = 'https://github.com/LucasSantana-Dev/Lucky/issues'
const DELETION_DOC_URL =
    'https://github.com/LucasSantana-Dev/Lucky/blob/main/docs/DATA_RETENTION.md'

const TOC: DocsTocItem[] = [
    { id: 'scope', label: 'Scope and controller' },
    { id: 'data', label: 'Data we collect' },
    { id: 'cookies', label: 'Cookies and storage' },
    { id: 'use', label: 'How we use data' },
    { id: 'legal-basis', label: 'Legal basis' },
    { id: 'self-host', label: 'Self-hosted instances' },
    { id: 'third-party', label: 'Processors and third parties' },
    { id: 'transfers', label: 'International transfers' },
    { id: 'retention', label: 'Retention and deletion' },
    { id: 'rights', label: 'Your rights' },
    { id: 'security', label: 'Security' },
    { id: 'updates', label: 'Policy updates' },
    { id: 'contact', label: 'Contact' },
]

function ExternalLink({ href, children }: { href: string; children: string }) {
    return (
        <a href={href} target='_blank' rel='noreferrer'>
            {children}
        </a>
    )
}

export default function PrivacyPolicyPage() {
    usePageMetadata(metaFor('/privacy-policy'))

    return (
        <DocsShell
            nav={LEGAL_NAV}
            toc={TOC}
            breadcrumb='Legal / Privacy'
            title='Privacy Policy'
            lastUpdated='November 20, 2026'
        >
            <p>
                This policy explains how Lucky collects, uses, and protects data
                when you use the Discord bot and web dashboard.
            </p>

            <h2 id='scope'>Scope and controller</h2>
            <p>
                It applies to authentication, server configuration, moderation
                features, music and integrations, and operational security. The
                maintainers of the hosted Lucky instance act as the data
                controller for that deployment. Self-hosted operators are
                controllers for their own deployments.
            </p>

            <h2 id='data'>Data we collect</h2>
            <p>We process the minimum data needed to operate the service.</p>
            <h3>Dashboard</h3>
            <ul>
                <li>
                    Your Discord user id, username and avatar, received when you
                    sign in with Discord
                </li>
                <li>
                    A login session stored on our server, including the Discord
                    access token used to list the servers you manage
                </li>
                <li>Bot configuration you save for your servers</li>
                <li>
                    Optional integrations, only when you connect them: your
                    Last.fm username and session key, or your Spotify user id,
                    username and access tokens
                </li>
            </ul>
            <h3>Bot</h3>
            <ul>
                <li>
                    Server (guild) ids, names and icons, and channel and role
                    references used by your configuration
                </li>
                <li>
                    Moderation cases: the member&apos;s id and username, the
                    moderator, the action, reason and any evidence entered
                </li>
                <li>
                    Member features a server enables: XP and level, birthdays
                    (month and day), AFK status and reason, reminders
                </li>
                <li>
                    Music: track history (track details and who requested them),
                    recommendations, and per-member track and artist feedback
                </li>
                <li>
                    Server logs, only when a server turns them on: member joins
                    and leaves, bans, role and channel changes, and message
                    deletions (author and channel, not the message text). Lucky
                    does not request access to message content.
                </li>
                <li>
                    Command usage events: your user id, the command and its
                    outcome, used to measure reliability
                </li>
                <li>
                    Feedback and support reports you submit, including any text
                    and screenshot you attach
                </li>
                <li>top.gg votes: your user id, last vote time and streak</li>
                <li>
                    Premium subscriptions: the Stripe customer and subscription
                    ids and status for the server. Card details are handled by
                    Stripe and never reach Lucky.
                </li>
            </ul>

            <h2 id='cookies'>Cookies and storage</h2>
            <p>
                Lucky uses only strictly necessary cookies and browser storage.
                There are no advertising or cross-site tracking cookies.
            </p>
            <div className='overflow-x-auto'>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Purpose</th>
                            <th>Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <code>sessionId</code>
                            </td>
                            <td>Cookie</td>
                            <td>Keeps you signed in to the dashboard</td>
                            <td>7 days, renewed on each visit</td>
                        </tr>
                        <tr>
                            <td>
                                <code>spotify_state</code>,{' '}
                                <code>lastfm_state</code>
                            </td>
                            <td>Cookie</td>
                            <td>
                                Protects the Spotify or Last.fm connection flow
                                against forged requests
                            </td>
                            <td>10 minutes</td>
                        </tr>
                        <tr>
                            <td>
                                <code>lucky-auth</code>
                            </td>
                            <td>Local storage</td>
                            <td>
                                Caches your signed-in profile so the dashboard
                                loads without a flash
                            </td>
                            <td>Until you sign out or clear site data</td>
                        </tr>
                        <tr>
                            <td>
                                <code>lucky-language</code>
                            </td>
                            <td>Local storage</td>
                            <td>Remembers your language choice</td>
                            <td>Until you clear site data</td>
                        </tr>
                        <tr>
                            <td>
                                <code>auth_redirect_ts</code>
                            </td>
                            <td>Session storage</td>
                            <td>Prevents a sign-in redirect loop</td>
                            <td>Until the tab is closed</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p>
                Fonts are served from our own domain, so loading the site does
                not contact a font provider.
            </p>

            <h2 id='use'>How we use data</h2>
            <p>
                Data is used to authenticate access, enforce role-based
                permissions, persist server settings, run bot commands, provide
                dashboard features, and protect platform reliability and
                security.
            </p>
            <p>Lucky does not sell or share personal data for advertising.</p>

            <h2 id='legal-basis'>Legal basis</h2>
            <p>Under the LGPD (Art. 7) and the GDPR (Art. 6), we rely on:</p>
            <ul>
                <li>
                    Providing the service you or your server asked for: sign-in,
                    bot features and saved configuration
                </li>
                <li>
                    Legitimate interests: security, abuse prevention, error
                    monitoring and reliability measurement
                </li>
                <li>
                    Consent: optional integrations (Last.fm, Spotify), which you
                    can disconnect at any time
                </li>
                <li>Legal obligations: billing records for paid plans</li>
            </ul>

            <h2 id='self-host'>Self-hosted instances</h2>
            <p>
                Lucky is open source. If you run your own instance, the project
                maintainers do not receive any of your guild or user data. It
                stays in your Postgres and Redis. This policy applies to the
                hosted bot only; your self-hosted privacy terms are whatever you
                write for your community.
            </p>

            <h2 id='third-party'>Processors and third parties</h2>
            <ul>
                <li>
                    <strong>Discord</strong>: identity, server context, and the
                    Discord CDN, from which your browser loads avatars, server
                    icons and emoji
                </li>
                <li>
                    <strong>Sentry</strong>: error reports and a sample of
                    performance traces from the dashboard, the API and the bot,
                    plus browser security-policy violation reports. Bot error
                    reports carry the Discord user id of whoever triggered them,
                    never a username or email.
                </li>
                <li>
                    <strong>Cloudflare</strong>: network delivery and the tunnel
                    that carries traffic to our servers
                </li>
                <li>
                    <strong>Last.fm, Spotify and Twitch</strong>: only when you
                    or your server enable those integrations
                </li>
                <li>
                    <strong>top.gg</strong>: vote notifications when you vote
                    for Lucky
                </li>
                <li>
                    <strong>Stripe</strong>: payment processing for premium
                    subscriptions
                </li>
            </ul>
            <p>
                These providers operate under their own terms and privacy
                policies.
            </p>

            <h2 id='transfers'>International transfers</h2>
            <p>
                Several of the providers above, including Discord, Sentry,
                Cloudflare, Spotify, Twitch and Stripe, process data in the
                United States and other countries. Where the LGPD or GDPR
                applies, these transfers rely on the providers&apos; own
                transfer safeguards, such as standard contractual clauses.
            </p>

            <h2 id='retention'>Retention and deletion</h2>
            <p>Data is deleted automatically on these schedules:</p>
            <ul>
                <li>Track history and server logs: 30 days</li>
                <li>Feedback, command usage and activation events: 180 days</li>
                <li>Rate-limit records: when the limit window ends</li>
                <li>
                    Dashboard sessions: expire 7 days after your last visit, or
                    when you sign out
                </li>
                <li>
                    Integration links: until you disconnect them in the
                    dashboard
                </li>
            </ul>
            <p>
                Other server data, such as settings, moderation cases, XP and
                birthdays, is kept while Lucky is in the server. When Lucky is
                removed from a server, that server&apos;s data can be deleted on
                request at any time; automatic deletion after a 30-day grace
                period is being rolled out.
            </p>
            <p>
                To request deletion, follow the steps in our{' '}
                <ExternalLink href={DELETION_DOC_URL}>
                    data deletion guide
                </ExternalLink>
                .
            </p>

            <h2 id='rights'>Your rights</h2>
            <p>
                Depending on where you live, the LGPD (Art. 18), the GDPR (Arts.
                15 to 22) and the CCPA/CPRA give you the right to confirm
                whether we process your data, access it, correct it, receive a
                copy, have it deleted, restrict or object to processing, and
                withdraw consent. You can also complain to your data protection
                authority, such as the ANPD in Brazil. Lucky does not sell or
                share personal data, so there is nothing to opt out of.
            </p>

            <h2 id='security'>Security</h2>
            <p>
                We use reasonable technical and organizational safeguards to
                protect data. No system is perfectly secure, and you remain
                responsible for protecting your Discord account and server
                permissions.
            </p>

            <h2 id='updates'>Policy updates</h2>
            <p>
                We may update this policy when features, integrations, or legal
                requirements change. Material updates are published here with a
                revised date.
            </p>

            <h2 id='contact'>Contact and requests</h2>
            <p>
                For privacy requests, reach the maintainers on the{' '}
                <ExternalLink href={SUPPORT_SERVER_INVITE_URL}>
                    Lucky support server
                </ExternalLink>{' '}
                or open an issue at{' '}
                <ExternalLink href={ISSUES_URL}>
                    github.com/LucasSantana-Dev/Lucky/issues
                </ExternalLink>
                . Issues are public: do not post personal data there, ask for a
                private channel instead.
            </p>
        </DocsShell>
    )
}
