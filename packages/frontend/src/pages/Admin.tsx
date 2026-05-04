import { ShieldCheck, AlertTriangle } from 'lucide-react'
import Skeleton from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import GlobalTogglesSection from '@/components/Features/GlobalTogglesSection'
import { useAuthStore } from '@/stores/authStore'
import { useFeatures } from '@/hooks/useFeatures'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { api } from '@/services/api'

export default function AdminPage() {
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
            <main className='p-6 flex flex-col items-center justify-center min-h-[60vh] gap-6'>
                <ShieldCheck className='w-12 h-12 text-lucky-purple' />
                <div className='text-center space-y-2'>
                    <h1 className='type-h1 text-lucky-text-primary'>Admin Panel</h1>
                    <p className='text-lucky-text-secondary'>
                        Sign in with Discord to access the admin panel.
                    </p>
                </div>
                <Button onClick={login}>Sign in with Discord</Button>
            </main>
        )
    }

    if (!isDeveloper) {
        return (
            <main className='p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4'>
                <ShieldCheck className='w-12 h-12 text-lucky-red' />
                <div className='text-center space-y-2'>
                    <h1 className='type-h1 text-lucky-text-primary'>Access Denied</h1>
                    <p className='text-lucky-text-secondary'>
                        This page is restricted to bot administrators.
                    </p>
                </div>
            </main>
        )
    }

    if (isLoading) {
        return (
            <main className='p-6 space-y-6'>
                <Skeleton className='h-10 w-48' />
                <div className='space-y-4'>
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className='h-24 w-full' />
                    ))}
                </div>
            </main>
        )
    }

    return (
        <main className='p-4 md:p-6 space-y-8'>
            <header className='flex items-center gap-3'>
                <ShieldCheck className='w-7 h-7 text-lucky-purple' aria-hidden='true' />
                <h1 className='type-h1 text-lucky-text-primary'>Admin Panel</h1>
            </header>

            {loadError && (
                <section className='rounded-xl border border-lucky-border bg-lucky-bg-secondary/80 p-4'>
                    <div className='flex items-start gap-3'>
                        <AlertTriangle className='h-5 w-5 text-lucky-yellow mt-0.5' />
                        <div className='space-y-3'>
                            <div>
                                <h2 className='type-body-sm font-semibold text-lucky-text-primary'>
                                    Unable to load feature data
                                </h2>
                                <p className='text-sm text-lucky-text-secondary'>
                                    {loadError.message}
                                </p>
                            </div>
                            <div className='flex items-center gap-3'>
                                <Button size='sm' onClick={retryLoad}>
                                    Retry
                                </Button>
                                {(loadError.kind === 'auth' ||
                                    loadError.kind === 'forbidden') && (
                                    <a
                                        href={api.auth.getDiscordLoginUrl()}
                                        className='text-sm text-lucky-text-secondary hover:text-lucky-text-primary'
                                    >
                                        Re-authenticate
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            <section aria-labelledby='global-toggles-heading'>
                <GlobalTogglesSection
                    toggles={globalToggles}
                    provider={globalToggleProvider}
                    writable={globalTogglesWritable}
                    onToggle={handleGlobalToggle}
                />
            </section>
        </main>
    )
}
