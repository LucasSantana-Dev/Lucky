import { AlertTriangle, Shield } from 'lucide-react'
import Skeleton from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import GlobalTogglesSection from '@/components/Features/GlobalTogglesSection'
import ServerTogglesSection from '@/components/Features/ServerTogglesSection'
import { useGuildStore } from '@/stores/guildStore'
import { useFeatures } from '@/hooks/useFeatures'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { api } from '@/services/api'

export default function FeaturesPage() {
    const guilds = useGuildStore((state) => state.guilds)
    const selectedGuild = useGuildStore((state) => state.selectedGuild)
    const selectGuild = useGuildStore((state) => state.selectGuild)
    const {
        globalToggles,
        serverToggles,
        isLoading,
        loadError,
        isDeveloper,
        retryLoad,
        handleGlobalToggle,
        handleServerToggle,
    } = useFeatures()
    usePageMetadata({
        title: 'Features - Lucky',
        description:
            'Manage and configure bot features for your Discord servers',
    })

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
                <Shield className='w-7 h-7 text-lucky-red' aria-hidden='true' />
                <h1 className='text-2xl font-bold text-white'>Features</h1>
            </header>

            {loadError && (
                <section className='rounded-xl border border-lucky-border bg-lucky-bg-secondary/80 p-4'>
                    <div className='flex items-start gap-3'>
                        <AlertTriangle className='h-5 w-5 text-lucky-yellow mt-0.5' />
                        <div className='space-y-3'>
                            <div>
                                <h2 className='text-sm font-semibold text-white'>
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

            {isDeveloper && (
                <section aria-labelledby='global-toggles-heading'>
                    <GlobalTogglesSection
                        toggles={globalToggles}
                        onToggle={handleGlobalToggle}
                    />
                </section>
            )}

            <section aria-labelledby='server-toggles-heading'>
                <ServerTogglesSection
                    toggles={serverToggles}
                    onToggle={handleServerToggle}
                    selectedGuildId={selectedGuild?.id || null}
                    onSelectGuild={(id) => {
                        const guild = guilds.find((g) => g.id === id) || null
                        selectGuild(guild)
                    }}
                />
            </section>
        </main>
    )
}
