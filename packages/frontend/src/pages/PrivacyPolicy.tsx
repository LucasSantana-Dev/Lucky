export default function PrivacyPolicyPage() {
    return (
        <main className='min-h-screen bg-lucky-bg px-6 py-10 text-lucky-text-primary'>
            <div className='mx-auto w-full max-w-4xl space-y-8'>
                <header className='space-y-3'>
                    <p className='type-meta text-lucky-text-tertiary'>Legal</p>
                    <h1 className='type-h1'>Privacy Policy</h1>
                    <p className='type-body text-lucky-text-secondary'>
                        Last updated: March 11, 2026
                    </p>
                </header>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Data we collect</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        Lucky processes Discord account identifiers and server
                        configuration data required to provide bot features and
                        dashboard access.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>How we use data</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        Data is used to authenticate users, manage server
                        settings, and operate integrations requested by server
                        administrators.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Data sharing and retention</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        Lucky does not sell personal data. Data is retained only
                        as needed for service operation, security, and legal
                        obligations.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Contact</h2>
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
