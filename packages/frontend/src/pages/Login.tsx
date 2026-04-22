import { Loader2, ShieldCheck, Zap, BarChart2 } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import Button from '@/components/ui/Button'
import StatTile from '@/components/ui/StatTile'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'
import { useAuthStore } from '@/stores/authStore'
import { useAuthRedirect } from '@/hooks/useAuthRedirect'
import { usePageMetadata } from '@/hooks/usePageMetadata'

export default function LoginPage() {
    const isLoading = useAuthStore((state) => state.isLoading)
    const login = useAuthStore((state) => state.login)
    const prefersReducedMotion = useReducedMotion()
    const { t } = useTranslation()

    useAuthRedirect()
    usePageMetadata({
        title: t('login.meta.title'),
        description: t('login.meta.description'),
    })

    const sectionStyle = prefersReducedMotion
        ? {}
        : { animationFillMode: 'both' as const }

    const sectionClass = prefersReducedMotion
        ? 'space-y-8'
        : 'space-y-8 animate-[fade-up_0.4s_ease-out]'

    const cardClass = prefersReducedMotion
        ? 'surface-card space-y-6 p-6 md:p-8'
        : 'surface-card space-y-6 p-6 md:p-8 animate-[fade-up_0.4s_ease-out]'

    const cardStyle = prefersReducedMotion
        ? {}
        : { animationDelay: '100ms', animationFillMode: 'both' as const }

    const badges = [
        { icon: ShieldCheck, labelKey: 'login.badges.oauthSecured' },
        { icon: Zap, labelKey: 'login.badges.fastSetup' },
        { icon: BarChart2, labelKey: 'login.badges.liveControls' },
    ] as const

    return (
        <div className='lucky-shell min-h-screen px-4 py-8 md:px-8 relative'>
            <div className='absolute top-4 right-4 z-20'>
                <LanguageSwitcher />
            </div>
            <div className='mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]'>
                <section className={sectionClass} style={sectionStyle}>
                    <div className='flex items-center gap-3'>
                        <img
                            src='/lucky-logo.png'
                            alt='Lucky'
                            className='h-12 w-12 rounded-xl object-cover border border-lucky-border'
                        />
                        <div>
                            <h1 className='type-display text-lucky-text-primary'>Lucky</h1>
                            <p className='type-body-sm text-lucky-text-tertiary'>{t('login.brand')}</p>
                        </div>
                    </div>

                    <div className='space-y-3'>
                        <h2 className='type-h1 text-lucky-text-primary'>
                            {t('login.headline')}
                        </h2>
                        <p className='type-body max-w-xl text-lucky-text-secondary'>
                            {t('login.description')}
                        </p>
                    </div>

                    <div className='grid gap-3 sm:grid-cols-3'>
                        <StatTile value='32+' label={t('login.modules')} tone='brand' />
                        <StatTile value='100+' label={t('login.commands')} tone='brand' />
                        <StatTile value='24/7' label={t('login.uptime')} tone='success' />
                    </div>
                </section>

                <section
                    className={cardClass}
                    style={cardStyle}
                >
                    <div className='space-y-2'>
                        <p className='type-meta text-lucky-text-tertiary'>{t('login.authentication')}</p>
                        <h3 className='type-h2 text-lucky-text-primary'>{t('login.signInWithDiscord')}</h3>
                        <p className='type-body-sm text-lucky-text-secondary'>
                            {t('login.permissionsNote')}
                        </p>
                    </div>

                    <Button
                        onClick={login}
                        disabled={isLoading}
                        variant='primary'
                        className='lucky-focus-visible h-12 w-full rounded-lg'
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className='h-4 w-4 animate-spin' />
                                {t('login.connecting')}
                            </>
                        ) : (
                            <>
                                <svg className='h-5 w-5' viewBox='0 0 24 24' fill='currentColor'>
                                    <path d='M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z' />
                                </svg>
                                {t('login.loginButton')}
                            </>
                        )}
                    </Button>

                    <div className='grid gap-3 sm:grid-cols-3'>
                        {badges.map(({ icon: Icon, labelKey }) => (
                            <div
                                key={labelKey}
                                className='rounded-lg border border-lucky-border bg-lucky-bg-primary/60 p-3'
                            >
                                <Icon className='h-4 w-4 text-lucky-brand' />
                                <p className='mt-2 type-body-sm text-lucky-text-secondary'>{t(labelKey)}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <footer className='pb-2 text-center space-y-1'>
                <nav className='flex items-center justify-center gap-3' aria-label='Legal links'>
                    <a
                        href='/terms'
                        className='type-body-sm text-lucky-text-tertiary underline-offset-2 hover:underline hover:text-lucky-text-secondary transition-colors'
                    >
                        {t('landing.footer.terms')}
                    </a>
                    <span className='text-lucky-border' aria-hidden='true'>·</span>
                    <a
                        href='/privacy'
                        className='type-body-sm text-lucky-text-tertiary underline-offset-2 hover:underline hover:text-lucky-text-secondary transition-colors'
                    >
                        {t('landing.footer.privacy')}
                    </a>
                </nav>
                <p className='type-body-sm text-lucky-text-disabled'>
                    {t('login.copyright')}
                </p>
            </footer>
        </div>
    )
}
