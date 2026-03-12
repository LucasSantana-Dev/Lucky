export default function TermsOfServicePage() {
    return (
        <main className='min-h-screen bg-lucky-bg px-6 py-10 text-lucky-text-primary'>
            <div className='mx-auto w-full max-w-4xl space-y-8'>
                <header className='space-y-3'>
                    <p className='type-meta text-lucky-text-tertiary'>Legal</p>
                    <h1 className='type-h1'>Terms of Service</h1>
                    <p className='type-body text-lucky-text-secondary'>
                        Last updated: March 11, 2026
                    </p>
                </header>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Service scope</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        Lucky provides Discord bot features and a dashboard for
                        server management. By using Lucky, you agree to these
                        terms.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Acceptable use</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        You must use Lucky in compliance with Discord terms,
                        applicable laws, and your server rules. Abuse, misuse,
                        or attempts to disrupt the service are prohibited.
                    </p>
                </section>

                <section className='space-y-3'>
                    <h2 className='type-h2'>Availability and changes</h2>
                    <p className='type-body text-lucky-text-secondary'>
                        Lucky is provided on an as-is basis. Features may be
                        updated, limited, or removed to improve reliability,
                        security, and compliance.
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
