import { useState, useEffect, useCallback } from 'react'
import { Music, Link2, Unlink, ExternalLink, Loader2 } from 'lucide-react'
import { api } from '@/services/api'

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
            const res = await api.lastfm.status()
            setStatus(res.data)
        } catch {
            setError('Failed to load Last.fm status')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        loadStatus()
    }, [loadStatus])

    const handleUnlink = async () => {
        if (!confirm('Disconnect your Last.fm account?')) return
        setIsUnlinking(true)
        try {
            await api.lastfm.unlink()
            setStatus((prev) =>
                prev ? { ...prev, linked: false, username: null } : prev,
            )
        } catch {
            setError('Failed to unlink account')
        } finally {
            setIsUnlinking(false)
        }
    }

    const handleConnect = () => {
        window.location.href = api.lastfm.getConnectUrl()
    }

    if (isLoading) {
        return (
            <div className='flex items-center justify-center h-64'>
                <Loader2 className='w-6 h-6 text-nexus-text-secondary animate-spin' />
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <div className='flex items-center gap-3'>
                <div className='w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center'>
                    <Music className='w-5 h-5 text-red-500' />
                </div>
                <div>
                    <h1 className='text-xl font-bold text-white'>Last.fm</h1>
                    <p className='text-sm text-nexus-text-secondary'>
                        Scrobble tracks you play to your Last.fm profile
                    </p>
                </div>
            </div>

            {error && (
                <div className='px-4 py-3 rounded-lg bg-nexus-error/10 border border-nexus-error/20 text-nexus-error text-sm'>
                    {error}
                </div>
            )}

            {!status?.configured ? (
                <div className='rounded-xl bg-nexus-bg-secondary border border-nexus-border p-6'>
                    <h2 className='text-lg font-semibold text-white mb-2'>
                        Not Configured
                    </h2>
                    <p className='text-nexus-text-secondary text-sm'>
                        Last.fm integration is not configured on this bot. The
                        server owner needs to set{' '}
                        <code className='text-xs bg-nexus-bg-tertiary px-1.5 py-0.5 rounded'>
                            LASTFM_API_KEY
                        </code>{' '}
                        and{' '}
                        <code className='text-xs bg-nexus-bg-tertiary px-1.5 py-0.5 rounded'>
                            LASTFM_API_SECRET
                        </code>
                        .
                    </p>
                </div>
            ) : status?.linked ? (
                <div className='rounded-xl bg-nexus-bg-secondary border border-nexus-border p-6 space-y-4'>
                    <div className='flex items-center gap-3'>
                        <div className='w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center'>
                            <Link2 className='w-6 h-6 text-green-500' />
                        </div>
                        <div>
                            <h2 className='text-lg font-semibold text-white'>
                                Connected
                            </h2>
                            <p className='text-nexus-text-secondary text-sm'>
                                Linked as{' '}
                                <a
                                    href={`https://www.last.fm/user/${status.username}`}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='text-red-400 hover:text-red-300 inline-flex items-center gap-1'
                                >
                                    {status.username}
                                    <ExternalLink className='w-3 h-3' />
                                </a>
                            </p>
                        </div>
                    </div>
                    <p className='text-nexus-text-secondary text-sm'>
                        Tracks you request via the bot will be scrobbled to your
                        Last.fm profile automatically.
                    </p>
                    <button
                        onClick={handleUnlink}
                        disabled={isUnlinking}
                        className='flex items-center gap-2 px-4 py-2 rounded-lg bg-nexus-error/10 text-nexus-error hover:bg-nexus-error/20 transition-colors text-sm font-medium disabled:opacity-50'
                    >
                        {isUnlinking ? (
                            <Loader2 className='w-4 h-4 animate-spin' />
                        ) : (
                            <Unlink className='w-4 h-4' />
                        )}
                        Disconnect
                    </button>
                </div>
            ) : (
                <div className='rounded-xl bg-nexus-bg-secondary border border-nexus-border p-6 space-y-4'>
                    <h2 className='text-lg font-semibold text-white'>
                        Connect Your Account
                    </h2>
                    <p className='text-nexus-text-secondary text-sm'>
                        Link your Last.fm account so tracks you play through the
                        bot are automatically scrobbled to your profile.
                    </p>
                    <button
                        onClick={handleConnect}
                        className='flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-medium'
                    >
                        <Link2 className='w-4 h-4' />
                        Connect Last.fm
                    </button>
                </div>
            )}

            <div className='rounded-xl bg-nexus-bg-secondary border border-nexus-border p-6'>
                <h3 className='text-sm font-semibold text-white mb-3'>
                    How it works
                </h3>
                <ul className='space-y-2 text-sm text-nexus-text-secondary'>
                    <li className='flex items-start gap-2'>
                        <span className='text-nexus-text-tertiary mt-0.5'>
                            1.
                        </span>
                        Connect your Last.fm account above
                    </li>
                    <li className='flex items-start gap-2'>
                        <span className='text-nexus-text-tertiary mt-0.5'>
                            2.
                        </span>
                        Play music in a voice channel using the bot
                    </li>
                    <li className='flex items-start gap-2'>
                        <span className='text-nexus-text-tertiary mt-0.5'>
                            3.
                        </span>
                        Tracks are automatically scrobbled to your profile
                    </li>
                    <li className='flex items-start gap-2'>
                        <span className='text-nexus-text-tertiary mt-0.5'>
                            4.
                        </span>
                        External music bots (Rythm, Groovy, etc.) are also
                        detected
                    </li>
                </ul>
            </div>
        </div>
    )
}
