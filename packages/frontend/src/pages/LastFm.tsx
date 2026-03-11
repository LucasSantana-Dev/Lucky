import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Link2, Loader2, Music, Unlink } from 'lucide-react'
import { api } from '@/services/api'
import SectionHeader from '@/components/ui/SectionHeader'
import ActionPanel from '@/components/ui/ActionPanel'

interface LastFmStatus {
    configured: boolean
    linked: boolean
    username: string | null
}

export default function LastFmPage() {
    const [status, setStatus] = useState<LastFmStatus | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isUnlinking, setIsUnlinking] = useState(false)

    const loadStatus = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const response = await api.lastfm.status()
            setStatus(response.data)
        } catch {
            setError('Failed to load Last.fm status')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        loadStatus()
    }, [loadStatus])

    const handleConnect = () => {
        window.location.href = api.lastfm.getConnectUrl()
    }

    const handleUnlink = async () => {
        if (!confirm('Disconnect your Last.fm account?')) return

        setIsUnlinking(true)

        try {
            await api.lastfm.unlink()
            setStatus((previous) =>
                previous ? { ...previous, linked: false, username: null } : previous,
            )
        } catch {
            setError('Failed to unlink account')
        } finally {
            setIsUnlinking(false)
        }
    }

    if (isLoading) {
        return (
            <div className='flex h-64 items-center justify-center'>
                <Loader2 className='h-6 w-6 animate-spin text-lucky-text-secondary' />
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <SectionHeader
                eyebrow='Music identity'
                title='Last.fm'
                description='Scrobble tracks you play to your Last.fm profile'
                actions={<Music className='h-5 w-5 text-lucky-accent' />}
            />

            {error && (
                <div className='rounded-xl border border-lucky-error/30 bg-lucky-error/10 px-4 py-3 type-body-sm text-lucky-error'>
                    {error}
                </div>
            )}

            {!status?.configured ? (
                <section className='surface-panel space-y-3 p-6'>
                    <h2 className='type-h2 text-lucky-text-primary'>Not Configured</h2>
                    <p className='type-body-sm text-lucky-text-secondary'>
                        Last.fm integration is not configured on this bot. The server owner needs
                        to set
                        <code className='mx-1 rounded bg-lucky-bg-tertiary px-1.5 py-0.5 text-xs'>
                            LASTFM_API_KEY
                        </code>
                        and
                        <code className='mx-1 rounded bg-lucky-bg-tertiary px-1.5 py-0.5 text-xs'>
                            LASTFM_API_SECRET
                        </code>
                        .
                    </p>
                </section>
            ) : status.linked ? (
                <section className='surface-panel space-y-4 p-6'>
                    <div className='flex items-start gap-3'>
                        <span className='rounded-full bg-lucky-success/20 p-3 text-lucky-success'>
                            <Link2 className='h-5 w-5' />
                        </span>
                        <div>
                            <h2 className='type-h2 text-lucky-text-primary'>Connected</h2>
                            <p className='type-body-sm text-lucky-text-secondary'>
                                Linked as
                                <a
                                    href={`https://www.last.fm/user/${status.username}`}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='ml-1 inline-flex items-center gap-1 text-lucky-accent hover:text-lucky-accent-soft'
                                >
                                    {status.username}
                                    <ExternalLink className='h-3.5 w-3.5' />
                                </a>
                            </p>
                        </div>
                    </div>

                    <p className='type-body-sm text-lucky-text-secondary'>
                        Tracks you request via the bot will be scrobbled to your Last.fm profile
                        automatically.
                    </p>

                    <button
                        onClick={handleUnlink}
                        disabled={isUnlinking}
                        className='lucky-focus-visible inline-flex items-center gap-2 rounded-lg border border-lucky-error/30 bg-lucky-error/10 px-4 py-2 type-body-sm text-lucky-error transition-colors hover:bg-lucky-error/20 disabled:opacity-60'
                    >
                        {isUnlinking ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                        ) : (
                            <Unlink className='h-4 w-4' />
                        )}
                        Disconnect
                    </button>
                </section>
            ) : (
                <section className='surface-panel space-y-4 p-6'>
                    <h2 className='type-h2 text-lucky-text-primary'>Connect Your Account</h2>
                    <p className='type-body-sm text-lucky-text-secondary'>
                        Link your Last.fm account so tracks you play through the bot are
                        automatically scrobbled to your profile.
                    </p>
                    <button
                        onClick={handleConnect}
                        className='lucky-focus-visible inline-flex items-center gap-2 rounded-lg bg-lucky-accent px-4 py-2 type-body-sm text-black transition-colors hover:bg-lucky-accent-soft'
                    >
                        <Link2 className='h-4 w-4' />
                        Connect Last.fm
                    </button>
                </section>
            )}

            <div className='grid gap-4 lg:grid-cols-2'>
                <ActionPanel
                    title='Scrobble coverage'
                    description='Lucky tracks requested songs and forwards play activity once linked.'
                    icon={<Music className='h-4 w-4' />}
                />
                <ActionPanel
                    title='Privacy control'
                    description='You can disconnect anytime without affecting server playback.'
                    icon={<Unlink className='h-4 w-4' />}
                />
            </div>

            <section className='surface-panel p-6'>
                <h3 className='type-title mb-3 text-lucky-text-primary'>How it works</h3>
                <ul className='space-y-2 type-body-sm text-lucky-text-secondary'>
                    <li className='flex items-start gap-2'>
                        <span className='text-lucky-text-tertiary'>1.</span>
                        Connect your Last.fm account above
                    </li>
                    <li className='flex items-start gap-2'>
                        <span className='text-lucky-text-tertiary'>2.</span>
                        Play music in a voice channel using the bot
                    </li>
                    <li className='flex items-start gap-2'>
                        <span className='text-lucky-text-tertiary'>3.</span>
                        Tracks are automatically scrobbled to your profile
                    </li>
                    <li className='flex items-start gap-2'>
                        <span className='text-lucky-text-tertiary'>4.</span>
                        External music bots (Rythm, Groovy, etc.) are also detected
                    </li>
                </ul>
            </section>
        </div>
    )
}
