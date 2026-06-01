import DocsShell, { type DocsTocItem } from '@/components/DocsShell/DocsShell'
import { LEGAL_NAV } from '@/components/DocsShell/legalNav'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { metaFor } from '@/lib/seo/routeMeta'

const TOC: DocsTocItem[] = [
    { id: 'acceptance', label: 'Acceptance' },
    { id: 'service-scope', label: 'Service scope' },
    { id: 'acceptable-use', label: 'Acceptable use' },
    { id: 'third-party', label: 'Third-party services' },
    { id: 'availability', label: 'Availability' },
    { id: 'suspension', label: 'Suspension and termination' },
    { id: 'disclaimers', label: 'Disclaimers and liability' },
    { id: 'changes', label: 'Changes to these terms' },
    { id: 'contact', label: 'Contact' },
]

export default function TermsOfServicePage() {
    usePageMetadata(metaFor('/terms-of-service'))

    return (
        <DocsShell
            nav={LEGAL_NAV}
            toc={TOC}
            breadcrumb='Legal / Terms'
            title='Terms of Service'
            lastUpdated='March 18, 2026'
        >
            <p>
                By using Lucky, you agree to these Terms of Service. If you use
                Lucky on behalf of a server, team, or organization, you confirm
                you are authorized to accept these terms for that entity.
            </p>

            <h2 id='acceptance'>Acceptance</h2>
            <p>
                These terms form a binding agreement between you and the Lucky
                maintainers. If you do not agree, do not install or use the bot,
                and do not access the dashboard.
            </p>

            <h2 id='service-scope'>Service scope</h2>
            <p>
                Lucky provides Discord bot functionality and a web dashboard for
                server management, moderation, automation, engagement, and
                integrations. Features may change over time as we ship
                improvements and respond to platform changes.
            </p>

            <h2 id='acceptable-use'>Acceptable use</h2>
            <p>
                You must comply with the Discord Terms of Service, applicable
                law, and your own server rules. You may not abuse the service,
                attempt unauthorized access, bypass rate limits, or use Lucky
                for spam, harassment, malware distribution, or illegal activity.
            </p>

            <h2 id='third-party'>Third-party services</h2>
            <p>
                Lucky relies on third-party services including Discord, and
                optional Last.fm, Spotify, and Twitch integrations. We are not
                responsible for outages, API changes, policy decisions, or
                account actions taken by those providers.
            </p>

            <h2 id='availability'>Availability and modifications</h2>
            <p>
                Lucky is provided on an &quot;as is&quot; and &quot;as
                available&quot; basis. We may add, modify, limit, or remove
                features at any time to improve security, performance, or
                compliance. Self-hosters control their own deployments.
            </p>

            <h2 id='suspension'>Suspension and termination</h2>
            <p>
                We may suspend or terminate access to the hosted bot if we
                reasonably believe there is abuse, legal risk, or a security
                threat to the platform or other users. You may stop using Lucky
                at any time by removing the bot and disconnecting integrations.
            </p>

            <h2 id='disclaimers'>Disclaimers and liability</h2>
            <p>
                To the maximum extent permitted by law, Lucky and its
                maintainers disclaim implied warranties and are not liable for
                indirect, incidental, special, or consequential damages arising
                from use of the service.
            </p>

            <h2 id='changes'>Changes to these terms</h2>
            <p>
                We may update these terms from time to time. Continued use after
                updates are posted means you accept the revised terms. Material
                changes will be noted with a revised &quot;Last updated&quot;
                date.
            </p>

            <h2 id='contact'>Contact</h2>
            <p>
                For support or legal requests, open an issue at{' '}
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
