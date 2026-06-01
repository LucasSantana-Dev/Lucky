import DocsShell, { type DocsTocItem } from '@/components/DocsShell/DocsShell'
import { LEGAL_NAV } from '@/components/DocsShell/legalNav'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { metaFor } from '@/lib/seo/routeMeta'

const TOC: DocsTocItem[] = [
    { id: 'scope', label: 'Scope and controller' },
    { id: 'data', label: 'Data we collect' },
    { id: 'use', label: 'How we use data' },
    { id: 'self-host', label: 'Self-hosted instances' },
    { id: 'third-party', label: 'Third-party services' },
    { id: 'retention', label: 'Retention and deletion' },
    { id: 'rights', label: 'Your rights' },
    { id: 'security', label: 'Security' },
    { id: 'updates', label: 'Policy updates' },
    { id: 'contact', label: 'Contact' },
]

export default function PrivacyPolicyPage() {
    usePageMetadata(metaFor('/privacy-policy'))

    return (
        <DocsShell
            nav={LEGAL_NAV}
            toc={TOC}
            breadcrumb='Legal / Privacy'
            title='Privacy Policy'
            lastUpdated='March 18, 2026'
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
            <p>We process the minimum data needed to operate the service:</p>
            <ul>
                <li>Discord account identifiers and usernames</li>
                <li>Guild (server) IDs, role, and channel references</li>
                <li>Bot configuration data you save in the dashboard</li>
                <li>Moderation case records (warns, mutes, bans)</li>
                <li>
                    Optional integration data — Last.fm scrobbles, Spotify
                    listening, Twitch stream events — only when you enable them
                </li>
                <li>Session and security logs</li>
            </ul>

            <h2 id='use'>How we use data</h2>
            <p>
                Data is used to authenticate access, enforce role-based
                permissions, persist server settings, run bot commands, provide
                dashboard features, and protect platform reliability and
                security.
            </p>
            <p>Lucky does not sell personal data.</p>

            <h2 id='self-host'>Self-hosted instances</h2>
            <p>
                Lucky is open source. If you run your own instance, the project
                maintainers do not receive any of your guild or user data — it
                stays in your Postgres and Redis. This policy applies to the
                hosted bot only; your self-hosted privacy terms are whatever you
                write for your community.
            </p>

            <h2 id='third-party'>Third-party services</h2>
            <p>
                Lucky depends on third-party platforms to function, including
                Discord (identity and guild context), and optionally Last.fm,
                Spotify, and Twitch when you enable those integrations. These
                providers operate under their own terms and privacy policies.
            </p>

            <h2 id='retention'>Retention and deletion</h2>
            <p>
                We retain data only as long as needed for operational, security,
                and legal purposes. You can remove Lucky from your server and
                disable integrations at any time. Requests to delete personal
                data can be made through the support channel below.
            </p>

            <h2 id='rights'>Your rights</h2>
            <p>
                Subject to applicable law, you may request access, correction,
                export, restriction, or deletion of personal data associated
                with your account or server configuration.
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
                For privacy requests, open an issue at{' '}
                <a
                    href='https://github.com/LucasSantana-Dev/Lucky/issues'
                    target='_blank'
                    rel='noreferrer'
                >
                    github.com/LucasSantana-Dev/Lucky/issues
                </a>
                .
            </p>
        </DocsShell>
    )
}
