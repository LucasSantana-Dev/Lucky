export default function PrivacyPolicyPage() {
    return (
        <main className='min-h-screen bg-lucky-bg px-6 py-10 text-lucky-text-primary'>
            <div className='mx-auto w-full max-w-4xl space-y-8'>
                <header className='space-y-3'>
                    <p className='type-meta text-lucky-text-tertiary'>Legal</p>
                    <h1 className='type-h1'>Privacy Policy</h1>
                    <p className='type-body text-lucky-text-secondary'>
                        Last updated: March 18, 2026
                    </p>
                </header>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Scope and controller</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        This policy explains how Lucky collects, uses, and
                        protects data when you use the Discord bot and web
                        dashboard. It applies to authentication, server
                        configuration, moderation features, music and
                        integrations, and operational security.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Data we collect</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        We process the minimum data needed to operate the
                        service: Discord account identifiers, guild/server IDs,
                        role and channel references, bot configuration data,
                        moderation case records, optional integration data
                        (Last.fm and Twitch), and session/security logs.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>How we use data</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        Data is used to authenticate access, enforce role-based
                        permissions, persist server settings, run bot commands,
                        provide dashboard features, and protect platform
                        reliability and security.
                    </p>
                    <p className='type-body text-lucky-text-secondary'>
                        Lucky does not sell personal data.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Third-party services</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        Lucky depends on third-party platforms to function,
                        including Discord (identity and guild context), and
                        optionally Last.fm and Twitch when you enable those
                        integrations. These providers operate under their own
                        terms and privacy policies.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Retention and deletion</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        We retain data only as long as needed for operational,
                        security, and legal purposes. You can remove Lucky from
                        your server and disable integrations at any time.
                        Requests to delete personal data can be made through our
                        support channel below.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Your rights</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        Subject to applicable law, you may request access,
                        correction, export, restriction, or deletion of personal
                        data associated with your account or server
                        configuration.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Security</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        We use reasonable technical and organizational
                        safeguards to protect data. No system is perfectly
                        secure, and you remain responsible for protecting your
                        Discord account and server permissions.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Policy updates</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        We may update this policy when features, integrations,
                        or legal requirements change. Material updates are
                        published here with a revised date.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Contact and requests</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        For privacy requests, open an issue at{' '}
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
