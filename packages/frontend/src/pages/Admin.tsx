import { ShieldCheck, RotateCcw } from 'lucide-react'
import Skeleton from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import GlobalTogglesSection from '@/components/Features/GlobalTogglesSection'
import BotGuildsSection from '@/components/Admin/BotGuildsSection'
import FeatureErrorBanner from '@/components/Features/FeatureErrorBanner'
import { useAuthStore } from '@/stores/authStore'
import { useFeatures } from '@/hooks/useFeatures'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { useTranslation } from 'react-i18next'

export default function AdminPage() {
    const { t } = useTranslation()
    const isDeveloper = useAuthStore((state) => state.isDeveloper)
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const login = useAuthStore((state) => state.login)
    const {
        globalToggles,
        globalToggleProvider,
        globalTogglesWritable,
        isLoading,
        loadError,
        retryLoad,
        handleGlobalToggle,
    } = useFeatures()
    usePageMetadata({
        title: 'Admin - Lucky',
        description: 'Admin panel for Lucky bot — global feature management',
    })

    if (!isAuthenticated) {
        return (
            <main className='flex flex-col items-center justify-center min-h-[64vh] gap-8 bg-lucky-bg-primary px-4'>
                <div className='flex flex-col items-center gap-4 text-center max-w-sm'>
                    <div className='p-3 rounded-lg bg-lucky-surface-elevated'>
                        <ShieldCheck
                            className='w-8 h-8 text-lucky-brand'
                            aria-hidden='true'
                        />
                    </div>
                    <div className='space-y-2'>
                        <h1
                            className='text-xl font-semibold text-lucky-text-primary'
                            style={{ fontFamily: 'Sora' }}
                        >
                            {t('admin.adminPanel')}
                        </h1>
                        <p
                            className='text-sm text-lucky-text-secondary'
                            style={{ fontFamily: 'Manrope' }}
                        >
                            {t('admin.signInWithDiscord')}
                        </p>
                    </div>
                </div>
                <Button onClick={login} className='w-fit'>
                    Sign in with Discord
                </Button>
            </main>
        )
    }

    if (!isDeveloper) {
        return (
            <main className='flex flex-col items-center justify-center min-h-[64vh] gap-6 bg-lucky-bg-primary px-4'>
                <div className='flex flex-col items-center gap-4 text-center max-w-sm'>
                    <div className='p-3 rounded-lg bg-lucky-surface-elevated'>
                        <ShieldCheck
                            className='w-8 h-8 text-lucky-error'
                            aria-hidden='true'
                        />
                    </div>
                    <div className='space-y-2'>
                        <h1
                            className='text-xl font-semibold text-lucky-text-primary'
                            style={{ fontFamily: 'Sora' }}
                        >
                            {t('admin.accessDenied')}
                        </h1>
                        <p
                            className='text-sm text-lucky-text-secondary'
                            style={{ fontFamily: 'Manrope' }}
                        >
                            {t('admin.accessDeniedDesc')}
                        </p>
                    </div>
                </div>
            </main>
        )
    }

    if (isLoading) {
        return (
            <main className='p-4 md:p-6 bg-lucky-bg-primary space-y-6 min-h-screen'>
                <div className='space-y-4'>
                    <Skeleton className='h-8 w-48' />
                    <div className='space-y-3'>
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className='h-10 w-full' />
                        ))}
                    </div>
                </div>
            </main>
        )
    }

    return (
        <main className='bg-lucky-bg-primary min-h-screen'>
            {/* Header — compact, density-first */}
            <header className='border-b border-lucky-border bg-lucky-surface-sidebar px-4 md:px-6 py-4'>
                <div className='flex items-center justify-between gap-3'>
                    <div className='flex items-center gap-3'>
                        <ShieldCheck
                            className='w-6 h-6 text-lucky-brand flex-shrink-0'
                            aria-hidden='true'
                        />
                        <h1
                            className='text-lg font-semibold text-lucky-text-primary'
                            style={{ fontFamily: 'Sora' }}
                        >
                            {t('admin.adminPanel')}
                        </h1>
                    </div>
                    {loadError && (
                        <Button
                            variant='ghost'
                            size='sm'
                            onClick={retryLoad}
                            className='text-lucky-text-secondary hover:text-lucky-text-primary'
                            aria-label='Retry loading features'
                        >
                            <RotateCcw className='w-4 h-4' />
                        </Button>
                    )}
                </div>
            </header>

            {/* Content area — enterprise admin density */}
            <div className='px-4 md:px-6 py-6 space-y-6'>
                {loadError && (
                    <FeatureErrorBanner
                        loadError={loadError}
                        retryLoad={retryLoad}
                    />
                )}

                {/* Global Toggles Section — grid density control */}
                <section
                    aria-labelledby='global-toggles-heading'
                    className='space-y-4'
                >
                    <div className='space-y-1'>
                        <h2
                            id='global-toggles-heading'
                            className='text-base font-semibold text-lucky-text-primary uppercase tracking-wide'
                            style={{ fontFamily: 'Sora' }}
                        >
                            {t('admin.globalFeatureToggles')}
                        </h2>
                        <p
                            className='text-xs text-lucky-text-tertiary'
                            style={{ fontFamily: 'Manrope' }}
                        >
                            {t('admin.manageFeatureFlags')}
                        </p>
                    </div>
                    <GlobalTogglesSection
                        toggles={globalToggles}
                        provider={globalToggleProvider}
                        writable={globalTogglesWritable}
                        onToggle={handleGlobalToggle}
                    />
                </section>

                {/* Bot Guilds Section — enterprise list density */}
                <section
                    aria-labelledby='bot-guilds-heading'
                    className='space-y-4'
                >
                    <div className='space-y-1'>
                        <h2
                            id='bot-guilds-heading'
                            className='text-base font-semibold text-lucky-text-primary uppercase tracking-wide'
                            style={{ fontFamily: 'Sora' }}
                        >
                            {t('admin.serverManagement')}
                        </h2>
                        <p
                            className='text-xs text-lucky-text-tertiary'
                            style={{ fontFamily: 'Manrope' }}
                        >
                            {t('admin.viewAndManageBotActivity')}
                        </p>
                    </div>
                    <BotGuildsSection />
                </section>
            </div>
        </main>
    )
}
