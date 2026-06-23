import { useCallback, useEffect, useState } from 'react'
import { Check, ExternalLink, Link2, Loader2, Music, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '@/services/api'
import SectionHeader from '@/components/ui/SectionHeader'

interface SpotifyStatus {
    configured: boolean
    linked: boolean
    username: string | null
}

export default function SpotifyPage() {
    const { t } = useTranslation('spotify')
    const [status, setStatus] = useState<SpotifyStatus | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isUnlinking, setIsUnlinking] = useState(false)

    const loadStatus = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const response = await api.spotify.status()
            setStatus(response.data)
        } catch {
            setError(t('failedToLoadStatus'))
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        loadStatus()
    }, [loadStatus])

    const handleConnect = () => {
        window.location.href = api.spotify.getConnectUrl()
    }

    const handleUnlink = async () => {
        if (!confirm(t('confirmDisconnect'))) return

        setIsUnlinking(true)

        try {
            await api.spotify.unlink()
            setStatus((previous) =>
                previous
                    ? { ...previous, linked: false, username: null }
                    : previous,
            )
        } catch {
            setError(t('failedToUnlink'))
        } finally {
            setIsUnlinking(false)
        }
    }

    if (isLoading) {
        return (
            <div className='space-y-6'>
                <SectionHeader
                    eyebrow={t('eyebrow')}
                    title={t('title')}
                    description={t('description')}
                    actions={<Music className='h-5 w-5 text-lucky-accent' />}
                />
                <div className='surface-panel space-y-4 p-8'>
                    <div className='h-24 animate-pulse rounded-lg bg-lucky-bg-tertiary' />
                    <div className='h-4 w-2/3 animate-pulse rounded bg-lucky-bg-tertiary' />
                    <div className='h-4 w-1/2 animate-pulse rounded bg-lucky-bg-tertiary' />
                </div>
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <SectionHeader
                eyebrow={t('eyebrow')}
                title={t('title')}
                description={t('description')}
                actions={<Music className='h-5 w-5 text-lucky-accent' />}
            />

            {error && (
                <div className='flex items-start gap-3 rounded-xl border border-lucky-error/40 bg-lucky-error/10 p-4'>
                    <X className='mt-0.5 h-5 w-5 flex-shrink-0 text-lucky-error' />
                    <div className='flex-1'>
                        <p className='type-body-sm text-lucky-text-primary font-500'>
                            {error}
                        </p>
                    </div>
                </div>
            )}

            {!status?.configured ? (
                <section className='surface-panel space-y-4 border border-lucky-border p-8'>
                    <div className='flex items-start gap-4'>
                        <div className='rounded-lg bg-lucky-bg-tertiary p-3'>
                            <Music className='h-6 w-6 text-lucky-text-secondary' />
                        </div>
                        <div className='flex-1'>
                            <h2 className='type-h2 text-lucky-text-primary'>
                                {t('notConfigured')}
                            </h2>
                            <p className='type-body-sm text-lucky-text-secondary mt-2'>
                                {t('notConfiguredDesc')}
                            </p>
                            <div className='mt-3 space-y-2 text-xs'>
                                <code className='block rounded bg-lucky-bg-active px-2 py-1 text-lucky-text-body font-600'>
                                    SPOTIFY_CLIENT_ID
                                </code>
                                <code className='block rounded bg-lucky-bg-active px-2 py-1 text-lucky-text-body font-600'>
                                    SPOTIFY_CLIENT_SECRET
                                </code>
                            </div>
                        </div>
                    </div>
                </section>
            ) : status.linked ? (
                <section className='surface-panel space-y-6 border border-lucky-border p-8'>
                    <div className='flex items-start gap-4'>
                        <div className='rounded-full bg-lucky-success/20 p-3'>
                            <Check className='h-6 w-6 text-lucky-success' />
                        </div>
                        <div className='flex-1'>
                            <h2 className='type-h2 text-lucky-text-primary'>
                                {t('connected')}
                            </h2>
                            <p className='type-body-sm text-lucky-text-secondary mt-1'>
                                {t('linkedAs')}{' '}
                                <a
                                    href={`https://open.spotify.com/user/${status.username}`}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='inline-flex items-center gap-1 font-500 text-lucky-accent hover:text-lucky-accent-soft transition-colors lucky-focus-visible'
                                >
                                    {status.username}
                                    <ExternalLink className='h-3 w-3' />
                                </a>
                            </p>
                        </div>
                        <div className='rounded-sm bg-lucky-success/15 px-3 py-1 text-xs font-semibold uppercase text-lucky-success'>
                            {t('active')}
                        </div>
                    </div>

                    <p className='type-body-sm text-lucky-text-secondary border-t border-lucky-border pt-4'>
                        {t('accessExplanation')}
                    </p>

                    <button
                        onClick={handleUnlink}
                        disabled={isUnlinking}
                        className='inline-flex items-center gap-2 text-sm font-500 text-lucky-error hover:text-lucky-error transition-colors lucky-focus-visible disabled:opacity-60 disabled:cursor-not-allowed'
                    >
                        {isUnlinking ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                        ) : (
                            <X className='h-4 w-4' />
                        )}
                        {t('disconnect')}
                    </button>
                </section>
            ) : (
                <section className='surface-panel space-y-6 border border-lucky-border p-8'>
                    <div>
                        <h2 className='type-h2 text-lucky-text-primary'>
                            {t('connectYourAccount')}
                        </h2>
                        <p className='type-body-sm text-lucky-text-secondary mt-2'>
                            {t('connectDescription')}
                        </p>
                    </div>

                    <button
                        onClick={handleConnect}
                        className='inline-flex items-center gap-2 rounded-lg bg-lucky-accent px-6 py-3 type-body-sm font-600 text-white transition-all hover:bg-lucky-accent-soft active:scale-95 lucky-focus-visible'
                    >
                        <Link2 className='h-4 w-4' />
                        {t('connectWithSpotify')}
                    </button>
                </section>
            )}

            <div className='grid gap-4 md:grid-cols-2'>
                <div className='surface-panel border border-lucky-border p-6'>
                    <div className='flex items-start gap-3'>
                        <Music className='mt-1 h-5 w-5 text-lucky-accent flex-shrink-0' />
                        <div className='flex-1'>
                            <h3 className='type-title text-lucky-text-primary'>
                                {t('smarterAutoplay')}
                            </h3>
                            <p className='type-body-sm text-lucky-text-secondary mt-2'>
                                {t('smarterAutoplayDesc')}
                            </p>
                        </div>
                    </div>
                </div>

                <div className='surface-panel border border-lucky-border p-6'>
                    <div className='flex items-start gap-3'>
                        <Link2 className='mt-1 h-5 w-5 text-lucky-text-tertiary flex-shrink-0' />
                        <div className='flex-1'>
                            <h3 className='type-title text-lucky-text-primary'>
                                {t('privacyControl')}
                            </h3>
                            <p className='type-body-sm text-lucky-text-secondary mt-2'>
                                {t('privacyControlDesc')}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <section className='surface-panel space-y-4 border border-lucky-border p-8'>
                <h3 className='type-title text-lucky-text-primary'>
                    {t('howItWorks')}
                </h3>
                <ol className='space-y-3 text-sm'>
                    {[t('step1'), t('step2'), t('step3'), t('step4')].map(
                        (step, i) => (
                            <li key={i} className='flex items-start gap-3'>
                                <span className='mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-sm bg-lucky-accent/20 text-xs font-semibold uppercase text-lucky-accent flex-shrink-0'>
                                    {i + 1}
                                </span>
                                <span className='type-body-sm text-lucky-text-secondary'>
                                    {step}
                                </span>
                            </li>
                        ),
                    )}
                </ol>
            </section>
        </div>
    )
}
