export default function TermsOfServicePage() {
    return (
        <main className='min-h-screen bg-lucky-bg px-6 py-10 text-lucky-text-primary'>
            <div className='mx-auto w-full max-w-4xl space-y-8'>
                <header className='space-y-3'>
                    <p className='type-meta text-lucky-text-tertiary'>Legal</p>
                    <h1 className='type-h1'>Terms of Service</h1>
                    <p className='type-body text-lucky-text-secondary'>
                        Last updated: March 18, 2026
                    </p>
                </header>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Acceptance</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        By using Lucky, you agree to these Terms of Service. If
                        you use Lucky on behalf of a server, team, or
                        organization, you confirm you are authorized to accept
                        these terms for that entity.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Service scope</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        Lucky provides Discord bot functionality and a web
                        dashboard for server management, moderation, automation,
                        engagement, and integrations. Features may change over
                        time.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Acceptable use</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        You must comply with Discord terms, applicable law, and
                        your own server rules. You may not abuse the service,
                        attempt unauthorized access, bypass limits, or use Lucky
                        for spam, harassment, malware distribution, or illegal
                        activity.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Third-party services</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        Lucky relies on third-party services including Discord,
                        and optional Last.fm and Twitch integrations. We are not
                        responsible for outages, API changes, policy decisions,
                        or account actions taken by those providers.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Availability and modifications</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        Lucky is provided on an "as is" and "as available"
                        basis. We may add, modify, limit, or remove features at
                        any time to improve security, performance, or
                        compliance.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Suspension and termination</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        We may suspend or terminate access if we reasonably
                        believe there is abuse, legal risk, or a security threat
                        to the platform or other users. You may stop using Lucky
                        at any time by removing the bot and disconnecting
                        integrations.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Disclaimers and liability</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        To the maximum extent permitted by law, Lucky and its
                        maintainers disclaim implied warranties and are not
                        liable for indirect, incidental, special, or
                        consequential damages arising from use of the service.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Changes to these terms</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        We may update these terms from time to time. Continued
                        use after updates are posted means you accept the
                        revised terms.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Contact</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        For support or legal requests, use the official issue
                        tracker:{' '}
                        <a
                            className='text-lucky-accent underline'
                            href='https://github.com/LucasSantana-Dev/Lucky/issues'
                            rel='noreferrer'
                            target='_blank'
                        >
                            https://github.com/LucasSantana-Dev/Lucky/issues
                        </a>
                        .
                    </p>
                </section>
            </div>
        </main>
    )
}
